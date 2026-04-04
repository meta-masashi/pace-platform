/**
 * pace-platform/lib/stripe/platform-admin.ts
 * ============================================================
 * Platform Admin 向け Stripe データ集約ヘルパー
 *
 * 全契約組織のサブスクリプション情報を集約取得する関数群。
 * Supabase の billing テーブルと Stripe API のハイブリッドで実装。
 *
 * - subscriptions テーブルから現在の契約状態を取得
 * - Stripe API から MRR 推移・Dunning ステータスを補完
 * - エラーハンドリング + リトライ（既存パターン準拠）
 * - 冪等性保証（Stripe-Idempotency-Key 使用）
 * ============================================================
 */

// サーバーサイド専用ガード
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).window !== 'undefined') {
  throw new Error(
    '[stripe/platform-admin] このモジュールはサーバーサイド専用です。'
  )
}

import Stripe from 'stripe'
import { stripe, PLANS, type PlanId } from '@/lib/billing/stripe-client'
import { createLogger } from '@/lib/observability/logger'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const log = createLogger('billing')

// ============================================================
// 型定義
// ============================================================

export interface PlatformSubscription {
  orgId: string
  orgName: string
  plan: PlanId | string
  status: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cvAddonEnabled: boolean
  staffCount: number
  athleteCount: number
}

export interface MrrDataPoint {
  date: string       // YYYY-MM-DD
  mrrJpy: number     // 月間経常収益（円）
}

export interface MrrTimeSeries {
  current: number
  previous: number
  changePercent: number
  trend: MrrDataPoint[]
}

export interface DunningOrg {
  orgId: string
  orgName: string
  stripeCustomerId: string
  failedAt: string
  attemptCount: number
  dunningStage: 'day1' | 'day3' | 'day7' | 'day14' | 'pending'
  amountDueJpy: number | null
}

export interface RevenueBreakdown {
  planId: PlanId | string
  planName: string
  orgCount: number
  totalMrrJpy: number
  percentage: number
}

// ============================================================
// Supabase Admin クライアント（Service Role）
// ============================================================

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[stripe/platform-admin] Supabase 環境変数が未設定です。')
  }

  return createSupabaseAdmin(url, key, {
    auth: { persistSession: false },
  })
}

// ============================================================
// Stripe API リトライヘルパー
// ============================================================

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const isRetryable =
        err instanceof Stripe.errors.StripeConnectionError ||
        err instanceof Stripe.errors.StripeAPIError ||
        (err instanceof Stripe.errors.StripeRateLimitError)

      if (!isRetryable || attempt === MAX_RETRIES) {
        log.error(`${label}: リトライ上限到達 (${attempt}/${MAX_RETRIES})`, {
          data: { error: lastError.message },
        })
        throw lastError
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
      log.warn(`${label}: リトライ ${attempt}/${MAX_RETRIES} (${delay}ms 待機)`, {
        data: { error: lastError.message },
      })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError!
}

// ============================================================
// 1. getAllSubscriptions — 全組織のサブスクリプション一覧
// ============================================================

export async function getAllSubscriptions(): Promise<PlatformSubscription[]> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('v_platform_billing_summary')
    .select('*')

  if (error) {
    log.error('getAllSubscriptions: ビュークエリ失敗', {
      data: { error: error.message },
    })
    throw new Error(`サブスクリプション一覧取得失敗: ${error.message}`)
  }

  // チーム概要データも取得してスタッフ・選手数を補完
  const { data: teamData, error: teamError } = await supabase
    .from('v_platform_team_overview')
    .select('org_id, staff_count, athlete_count')

  if (teamError) {
    log.warn('getAllSubscriptions: チーム概要取得警告', {
      data: { error: teamError.message },
    })
  }

  const teamMap = new Map(
    (teamData ?? []).map((t: { org_id: string; staff_count: number; athlete_count: number }) => [
      t.org_id,
      { staffCount: t.staff_count, athleteCount: t.athlete_count },
    ])
  )

  return (data ?? []).map((row: Record<string, unknown>) => {
    const team = teamMap.get(row.org_id as string) ?? { staffCount: 0, athleteCount: 0 }
    return {
      orgId: row.org_id as string,
      orgName: row.org_name as string,
      plan: (row.current_plan as PlanId) ?? 'standard',
      status: (row.subscription_status as string) ?? 'inactive',
      stripeCustomerId: row.stripe_customer_id as string | null,
      stripeSubscriptionId: row.stripe_subscription_id as string | null,
      currentPeriodStart: row.current_period_start as string | null,
      currentPeriodEnd: row.current_period_end as string | null,
      cancelAtPeriodEnd: (row.cancel_at_period_end as boolean) ?? false,
      cvAddonEnabled: (row.cv_addon_enabled as boolean) ?? false,
      staffCount: team.staffCount,
      athleteCount: team.athleteCount,
    }
  })
}

// ============================================================
// 2. getMrrTimeSeries — MRR 推移データ
// ============================================================

export async function getMrrTimeSeries(
  period: '30d' | '90d' | '1y' = '30d'
): Promise<MrrTimeSeries> {
  const supabase = getSupabaseAdmin()

  // 現在のアクティブサブスクリプションから MRR を算出
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('plan, status, stripe_subscription_id, updated_at')
    .in('status', ['active', 'trialing'])

  if (error) {
    log.error('getMrrTimeSeries: クエリ失敗', { data: { error: error.message } })
    throw new Error(`MRR データ取得失敗: ${error.message}`)
  }

  // 現在の MRR を計算（subscriptions テーブルのプランから）
  const currentMrr = (subs ?? []).reduce((sum, sub) => {
    const plan = PLANS[sub.plan as PlanId]
    return sum + (plan?.priceJpy ?? 0)
  }, 0)

  // Stripe API から過去の Invoice データで MRR 推移を取得
  const trend = await buildMrrTrend(period, currentMrr)

  const previousMrr = trend.length >= 2 ? (trend[trend.length - 2]?.mrrJpy ?? currentMrr) : currentMrr
  const changePercent = previousMrr > 0
    ? Math.round(((currentMrr - previousMrr) / previousMrr) * 1000) / 10
    : 0

  return {
    current: currentMrr,
    previous: previousMrr,
    changePercent,
    trend,
  }
}

/**
 * Stripe Invoice データから MRR 推移トレンドを構築
 * Stripe API が利用不可の場合は DB のみでフォールバック
 */
async function buildMrrTrend(
  period: '30d' | '90d' | '1y',
  currentMrr: number
): Promise<MrrDataPoint[]> {
  const daysMap = { '30d': 30, '90d': 90, '1y': 365 } as const
  const days = daysMap[period]
  const now = new Date()

  // Stripe API が利用可能な場合は Invoice データから推移を取得
  if (stripe) {
    try {
      const sinceTs = Math.floor((now.getTime() - days * 86400000) / 1000)

      const invoices = await withRetry(
        () => stripe!.invoices.list({
          created: { gte: sinceTs },
          status: 'paid',
          limit: 100,
          expand: ['data.subscription'],
        }),
        'getMrrTimeSeries:invoices.list'
      )

      // 月ごとに集約
      const monthlyRevenue = new Map<string, number>()
      for (const inv of invoices.data) {
        const date = new Date(inv.created * 1000)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
        const current = monthlyRevenue.get(monthKey) ?? 0
        monthlyRevenue.set(monthKey, current + (inv.amount_paid ?? 0))
      }

      // ソートしてトレンドデータに変換
      const trend: MrrDataPoint[] = Array.from(monthlyRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({
          date,
          mrrJpy: amount,
        }))

      // 最新月として現在の MRR を追加
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      if (!trend.find(t => t.date === currentMonth)) {
        trend.push({ date: currentMonth, mrrJpy: currentMrr })
      }

      return trend
    } catch (err) {
      log.warn('Stripe Invoice 取得失敗、DB フォールバック', {
        data: { error: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  // フォールバック: 現在の MRR のみ返す
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  return [{ date: currentMonth, mrrJpy: currentMrr }]
}

// ============================================================
// 3. getDunningStatus — 未払い・催促中の組織一覧
// ============================================================

export async function getDunningStatus(): Promise<DunningOrg[]> {
  const supabase = getSupabaseAdmin()

  // v_platform_billing_summary から Dunning 中の組織を取得
  const { data, error } = await supabase
    .from('v_platform_billing_summary')
    .select('*')
    .not('dunning_failed_at', 'is', null)
    .is('dunning_resolved_at', null)

  if (error) {
    log.error('getDunningStatus: クエリ失敗', { data: { error: error.message } })
    throw new Error(`Dunning ステータス取得失敗: ${error.message}`)
  }

  const results: DunningOrg[] = []

  for (const row of (data ?? [])) {
    // Dunning ステージを判定
    let dunningStage: DunningOrg['dunningStage'] = 'pending'
    if (row.dunning_day14) dunningStage = 'day14'
    else if (row.dunning_day7) dunningStage = 'day7'
    else if (row.dunning_day3) dunningStage = 'day3'
    else if (row.dunning_day1) dunningStage = 'day1'

    // Stripe から未払い額を取得（利用可能な場合）
    let amountDueJpy: number | null = null
    if (stripe && row.stripe_customer_id) {
      try {
        const invoices = await withRetry(
          () => stripe!.invoices.list({
            customer: row.stripe_customer_id,
            status: 'open',
            limit: 1,
          }),
          'getDunningStatus:invoices.list'
        )
        if (invoices.data.length > 0) {
          amountDueJpy = invoices.data[0]?.amount_due ?? null
        }
      } catch (err) {
        log.warn('Dunning 未払い額取得失敗', {
          data: {
            orgId: row.org_id,
            error: err instanceof Error ? err.message : String(err),
          },
        })
      }
    }

    results.push({
      orgId: row.org_id,
      orgName: row.org_name,
      stripeCustomerId: row.stripe_customer_id,
      failedAt: row.dunning_failed_at,
      attemptCount: row.dunning_attempt_count ?? 1,
      dunningStage,
      amountDueJpy,
    })
  }

  return results
}

// ============================================================
// 4. getRevenueBreakdown — プラン別売上内訳
// ============================================================

export async function getRevenueBreakdown(): Promise<RevenueBreakdown[]> {
  const supabase = getSupabaseAdmin()

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .in('status', ['active', 'trialing'])

  if (error) {
    log.error('getRevenueBreakdown: クエリ失敗', { data: { error: error.message } })
    throw new Error(`売上内訳取得失敗: ${error.message}`)
  }

  // プラン別に集計
  const planCounts = new Map<string, number>()
  for (const sub of (subs ?? [])) {
    const plan = sub.plan as string
    planCounts.set(plan, (planCounts.get(plan) ?? 0) + 1)
  }

  let totalMrr = 0
  const breakdowns: RevenueBreakdown[] = []

  for (const [planId, count] of planCounts) {
    const planDef = PLANS[planId as PlanId]
    const mrr = (planDef?.priceJpy ?? 0) * count
    totalMrr += mrr

    breakdowns.push({
      planId,
      planName: planDef?.name ?? planId,
      orgCount: count,
      totalMrrJpy: mrr,
      percentage: 0, // 後で計算
    })
  }

  // パーセンテージを計算
  for (const bd of breakdowns) {
    bd.percentage = totalMrr > 0
      ? Math.round((bd.totalMrrJpy / totalMrr) * 1000) / 10
      : 0
  }

  // MRR 降順でソート
  breakdowns.sort((a, b) => b.totalMrrJpy - a.totalMrrJpy)

  return breakdowns
}

// ============================================================
// 5. approvePlanChange — プラン変更承認 + Stripe 連携
// ============================================================

export interface PlanChangeApprovalResult {
  success: boolean
  error?: string
  stripeSubscriptionId?: string
  oldPlan: string
  newPlan: string
}

/**
 * プラン変更依頼を承認し、Stripe サブスクリプションを更新する。
 *
 * - plan_change_requests のステータスを 'approved' に更新
 * - Stripe Subscription の Price を新プランに変更（プロレーション対応）
 * - subscriptions テーブルを同期
 * - 冪等性保証（Stripe-Idempotency-Key 使用）
 */
export async function approvePlanChange(
  requestId: string,
  adminUserId: string
): Promise<PlanChangeApprovalResult> {
  const supabase = getSupabaseAdmin()

  // 1. plan_change_requests を取得
  const { data: request, error: fetchError } = await supabase
    .from('plan_change_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return {
      success: false,
      error: `プラン変更依頼が見つかりません: ${fetchError?.message ?? 'not found'}`,
      oldPlan: '',
      newPlan: '',
    }
  }

  if (request.status !== 'pending') {
    return {
      success: false,
      error: `この依頼は既に処理済みです (status: ${request.status})`,
      oldPlan: request.current_plan,
      newPlan: request.requested_plan,
    }
  }

  const oldPlan = request.current_plan as PlanId
  const newPlan = request.requested_plan as PlanId

  // 2. 組織のサブスクリプション情報を取得
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('org_id', request.org_id)
    .single()

  if (subError || !subscription) {
    return {
      success: false,
      error: `サブスクリプション情報が見つかりません: ${subError?.message ?? 'not found'}`,
      oldPlan,
      newPlan,
    }
  }

  // 3. Stripe サブスクリプション更新（利用可能な場合）
  let stripeSubscriptionId: string | undefined
  if (stripe && subscription.stripe_subscription_id) {
    const newPlanDef = PLANS[newPlan]
    if (!newPlanDef?.priceId) {
      // Enterprise は個別契約のため Stripe 自動更新なし
      log.info('approvePlanChange: Enterprise プランは個別契約のため Stripe 更新をスキップ', {
        data: { requestId, newPlan },
      })
    } else {
      try {
        // 現在の Stripe サブスクリプションを取得
        const stripeSub = await withRetry(
          () => stripe!.subscriptions.retrieve(subscription.stripe_subscription_id, {
            expand: ['items'],
          }),
          'approvePlanChange:subscriptions.retrieve'
        )

        const itemId = stripeSub.items.data[0]?.id
        if (!itemId) {
          return {
            success: false,
            error: 'Stripe サブスクリプションにアイテムが存在しません',
            oldPlan,
            newPlan,
          }
        }

        // 冪等性キー: requestId を使用して二重処理を防止
        const idempotencyKey = `plan-change-${requestId}`

        // プラン変更（プロレーション=日割り計算対応）
        const updated = await withRetry(
          () => stripe!.subscriptions.update(
            subscription.stripe_subscription_id,
            {
              items: [{
                id: itemId,
                price: newPlanDef.priceId!,
              }],
              proration_behavior: 'create_prorations',
              metadata: {
                plan_change_request_id: requestId,
                previous_plan: oldPlan,
                new_plan: newPlan,
              },
            },
            { idempotencyKey }
          ),
          'approvePlanChange:subscriptions.update'
        )

        stripeSubscriptionId = updated.id
        log.info('Stripe サブスクリプション更新完了', {
          data: { requestId, oldPlan, newPlan, stripeSubscriptionId },
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        log.error('Stripe サブスクリプション更新失敗', {
          data: { requestId, error: errorMsg },
        })
        return {
          success: false,
          error: `Stripe 更新失敗: ${errorMsg}`,
          oldPlan,
          newPlan,
        }
      }
    }
  }

  // 4. DB: plan_change_requests を approved に更新（楽観的ロック: status='pending' を条件に追加）
  const now = new Date().toISOString()
  const { data: updateResult, error: updateReqError } = await supabase
    .from('plan_change_requests')
    .update({
      status: 'approved',
      resolved_at: now,
      resolved_by: adminUserId,
      admin_notes: 'Approved',
    })
    .eq('id', requestId)
    .eq('status', 'pending') // 楽観的ロック: 並行承認を防止
    .select('id')
    .maybeSingle()

  if (updateReqError) {
    log.error('plan_change_requests 更新失敗', {
      data: { requestId, error: updateReqError.message },
    })
    return {
      success: false,
      error: 'プラン変更依頼の更新に失敗しました。',
      oldPlan,
      newPlan,
      ...(stripeSubscriptionId != null ? { stripeSubscriptionId } : {}),
    }
  }

  if (!updateResult) {
    // 別の管理者が先に処理済み
    log.warn('plan_change_requests の楽観的ロック失敗（並行処理競合）', {
      data: { requestId },
    })
    return {
      success: false,
      error: 'この依頼は既に別の管理者が処理済みです。',
      oldPlan,
      newPlan,
      ...(stripeSubscriptionId != null ? { stripeSubscriptionId } : {}),
    }
  }

  // 5. DB: subscriptions テーブルを同期
  const { error: updateSubError } = await supabase
    .from('subscriptions')
    .update({
      plan: newPlan,
      updated_at: now,
    })
    .eq('org_id', request.org_id)

  if (updateSubError) {
    log.warn('subscriptions テーブル同期警告（Webhook で補正される可能性あり）', {
      data: { orgId: request.org_id, error: updateSubError.message },
    })
  }

  // 6. DB: organizations テーブルのプランも同期
  const orgUpdateFields: Record<string, unknown> = { plan: newPlan }
  if (newPlan === 'pro_cv' || newPlan === 'enterprise') {
    orgUpdateFields.cv_addon_enabled = true
  } else {
    orgUpdateFields.cv_addon_enabled = false
  }

  await supabase
    .from('organizations')
    .update(orgUpdateFields)
    .eq('id', request.org_id)

  log.info('プラン変更承認完了', {
    data: { requestId, orgId: request.org_id, oldPlan, newPlan },
  })

  return {
    success: true,
    ...(stripeSubscriptionId != null ? { stripeSubscriptionId } : {}),
    oldPlan,
    newPlan,
  }
}

// ============================================================
// 6. rejectPlanChange — プラン変更却下
// ============================================================

export async function rejectPlanChange(
  requestId: string,
  adminUserId: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  const { data: request, error: fetchError } = await supabase
    .from('plan_change_requests')
    .select('status')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return {
      success: false,
      error: `プラン変更依頼が見つかりません: ${fetchError?.message ?? 'not found'}`,
    }
  }

  if (request.status !== 'pending') {
    return {
      success: false,
      error: `この依頼は既に処理済みです (status: ${request.status})`,
    }
  }

  const { error: updateError } = await supabase
    .from('plan_change_requests')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: adminUserId,
      admin_notes: adminNotes ?? null,
    })
    .eq('id', requestId)

  if (updateError) {
    return {
      success: false,
      error: `却下処理失敗: ${updateError.message}`,
    }
  }

  log.info('プラン変更却下完了', { data: { requestId } })
  return { success: true }
}
