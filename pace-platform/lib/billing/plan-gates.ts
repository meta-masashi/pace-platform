/**
 * pace-platform/lib/billing/plan-gates.ts
 * ============================================================
 * プラン別権限制御
 * Supabase RLS と連携したプラン別機能ゲート
 *
 * standard:   基本アセスメント・日次チェックイン・SOAP（¥100,000/月）
 * pro:        Standard + LLM分析・高度ダッシュボード（¥300,000/月）
 * pro_cv:     Pro + CV解析API 50本/月（¥500,000/月）
 * enterprise: Pro+CV Addon + 複数チーム管理（¥600,000/月）
 * ============================================================
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { PlanId } from './stripe-client'

// ============================================================
// 機能フラグ定義
// ============================================================

export type Feature =
  | 'feature_basic_assessment'       // 基本アセスメント
  | 'feature_daily_checkin'          // 日次チェックイン
  | 'feature_cv_analysis'            // CV（コンピュータビジョン）解析 ※pro_cv以上
  | 'feature_rag_pipeline'           // RAG パイプライン
  | 'feature_gemini_ai'              // Gemini AI機能
  | 'feature_custom_bayes'           // カスタムベイズノード
  | 'feature_enterprise'             // エンタープライズ専用機能
  | 'feature_multi_team'             // 複数チーム管理
  // Phase 6 新機能フラグ（PB-001-4 / Sprint 1）
  | 'feature_condition_score'        // P1-P5 + Readiness スコア（全プラン）
  | 'feature_condition_score_hrv'    // HRV ペナルティ付き Readiness（Pro以上）
  | 'feature_insight_card'           // Gemini InsightCard（Pro以上）
  | 'feature_calendar_sync'          // Google Calendar Function Calling（Pro以上）
  | 'feature_ai_weekly_plan'         // AI 週次計画 + トークン上限管理（Pro以上）
  | 'feature_risk_avoidance_report'  // ファクトベースROIレポート（Pro以上）
  | 'feature_acwr_trend_chart'       // ACWR トレンドチャート（Pro以上）

// プラン別に許可される機能 (MASTER-SPEC v1.1)
export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  standard: [
    'feature_basic_assessment',
    'feature_daily_checkin',
    'feature_condition_score',
  ],
  pro: [
    'feature_basic_assessment',
    'feature_daily_checkin',
    'feature_rag_pipeline',
    'feature_gemini_ai',
    'feature_condition_score',
    'feature_condition_score_hrv',
    'feature_insight_card',
    'feature_calendar_sync',
    'feature_ai_weekly_plan',
    'feature_risk_avoidance_report',
    'feature_acwr_trend_chart',
  ],
  pro_cv: [
    'feature_basic_assessment',
    'feature_daily_checkin',
    'feature_cv_analysis',
    'feature_rag_pipeline',
    'feature_gemini_ai',
    'feature_condition_score',
    'feature_condition_score_hrv',
    'feature_insight_card',
    'feature_calendar_sync',
    'feature_ai_weekly_plan',
    'feature_risk_avoidance_report',
    'feature_acwr_trend_chart',
  ],
  enterprise: [
    'feature_basic_assessment',
    'feature_daily_checkin',
    'feature_cv_analysis',
    'feature_rag_pipeline',
    'feature_gemini_ai',
    'feature_custom_bayes',
    'feature_enterprise',
    'feature_multi_team',
    'feature_condition_score',
    'feature_condition_score_hrv',
    'feature_insight_card',
    'feature_calendar_sync',
    'feature_ai_weekly_plan',
    'feature_risk_avoidance_report',
    'feature_acwr_trend_chart',
  ],
}

// ============================================================
// プラン上限定義
// ============================================================

export interface PlanLimits {
  maxStaff: number | null     // null = 無制限
  maxAthletes: number | null
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  standard: {
    maxStaff: 5,
    maxAthletes: 50,
  },
  pro: {
    maxStaff: 20,
    maxAthletes: 200,
  },
  pro_cv: {
    maxStaff: 20,
    maxAthletes: 200,
  },
  enterprise: {
    maxStaff: null,
    maxAthletes: null,
  },
}

// ============================================================
// 有効なサブスクリプション状態
// アクセスを許可するステータス
// ============================================================

const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const READ_ONLY_STATUSES = new Set(['past_due', 'read_only'])

// ============================================================
// メイン: プラン別機能アクセスチェック
// ============================================================

export interface AccessResult {
  allowed: boolean
  reason?: string
  plan?: PlanId
  status?: string
  readOnly?: boolean
}

/**
 * 指定した組織が特定の機能にアクセスできるか確認する
 *
 * @param supabaseClient - Supabase クライアント（認証済み、または admin）
 * @param orgId          - 組織 ID
 * @param feature        - チェックする機能フラグ
 * @returns AccessResult
 */
export async function canAccess(
  supabaseClient: SupabaseClient,
  orgId: string,
  feature: Feature
): Promise<AccessResult> {
  const { data: subscription, error } = await supabaseClient
    .from('subscriptions')
    .select('plan, status')
    .eq('org_id', orgId)
    .single()

  if (error || !subscription) {
    return {
      allowed: false,
      reason: 'サブスクリプション情報が見つかりません。プランをご確認ください。',
    }
  }

  const plan = subscription.plan as PlanId
  const status = subscription.status as string

  // 読み取り専用モード（Dunning Day 7）
  if (READ_ONLY_STATUSES.has(status)) {
    return {
      allowed: false,
      reason: `お支払いが確認できていないため、現在は読み取り専用モードです。カスタマーポータルでお支払い方法を更新してください。`,
      plan,
      status,
      readOnly: true,
    }
  }

  // 解約・停止状態
  if (status === 'canceled' || status === 'unpaid' || status === 'inactive') {
    return {
      allowed: false,
      reason: `有効なサブスクリプションが必要です。現在のステータス: ${status}`,
      plan,
      status,
    }
  }

  // アクティブでない場合
  if (!ACTIVE_STATUSES.has(status)) {
    return {
      allowed: false,
      reason: `サブスクリプションが有効ではありません（ステータス: ${status}）。`,
      plan,
      status,
    }
  }

  // 機能権限チェック
  const allowedFeatures = PLAN_FEATURES[plan] ?? []
  if (!allowedFeatures.includes(feature)) {
    const upgradeHint = getUpgradeHint(plan, feature)
    return {
      allowed: false,
      reason: `この機能は ${plan} プランでは利用できません。${upgradeHint}`,
      plan,
      status,
    }
  }

  return { allowed: true, plan, status }
}

/**
 * アクセスを強制する（許可されていない場合は例外をスロー）
 * サーバーサイドのルートハンドラーで使用する
 */
export async function requireAccess(
  supabaseClient: SupabaseClient,
  orgId: string,
  feature: Feature
): Promise<void> {
  const result = await canAccess(supabaseClient, orgId, feature)

  if (!result.allowed) {
    throw new Error(result.reason ?? 'アクセスが拒否されました。')
  }
}

// ============================================================
// プラン上限チェック
// ============================================================

export interface LimitCheckResult {
  withinLimit: boolean
  current: number
  limit: number | null
  reason?: string
}

/**
 * スタッフ数の上限チェック
 */
export async function checkStaffLimit(
  supabaseClient: SupabaseClient,
  orgId: string
): Promise<LimitCheckResult> {
  const { data: subscription } = await supabaseClient
    .from('subscriptions')
    .select('plan')
    .eq('org_id', orgId)
    .single()

  const plan = (subscription?.plan as PlanId) ?? 'standard'
  const limit = PLAN_LIMITS[plan].maxStaff

  const { count } = await supabaseClient
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)

  const current = count ?? 0

  if (limit !== null && current >= limit) {
    return {
      withinLimit: false,
      current,
      limit,
      reason: `${plan} プランのスタッフ上限（${limit}名）に達しています。プランをアップグレードしてください。`,
    }
  }

  return { withinLimit: true, current, limit }
}

/**
 * 選手数の上限チェック
 */
export async function checkAthleteLimit(
  supabaseClient: SupabaseClient,
  orgId: string
): Promise<LimitCheckResult> {
  const { data: subscription } = await supabaseClient
    .from('subscriptions')
    .select('plan')
    .eq('org_id', orgId)
    .single()

  const plan = (subscription?.plan as PlanId) ?? 'standard'
  const limit = PLAN_LIMITS[plan].maxAthletes

  const { count } = await supabaseClient
    .from('athletes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)

  const current = count ?? 0

  if (limit !== null && current >= limit) {
    return {
      withinLimit: false,
      current,
      limit,
      reason: `${plan} プランの選手上限（${limit}名）に達しています。プランをアップグレードしてください。`,
    }
  }

  return { withinLimit: true, current, limit }
}

// ============================================================
// ヘルパー: アップグレード案内メッセージ
// ============================================================

function getUpgradeHint(currentPlan: PlanId, feature: Feature): string {
  const featureToMinPlan: Record<Feature, PlanId | null> = {
    feature_basic_assessment: null,       // 全プランで利用可能
    feature_daily_checkin: null,
    feature_condition_score: null,        // 全プラン（DAU定着最優先）
    feature_cv_analysis: 'pro_cv',        // Pro + CV Addon 以上
    feature_rag_pipeline: 'pro',
    feature_gemini_ai: 'pro',
    feature_condition_score_hrv: 'pro',   // HRV ペナルティ
    feature_insight_card: 'pro',          // Gemini InsightCard
    feature_calendar_sync: 'pro',         // Google Calendar
    feature_ai_weekly_plan: 'pro',        // AI 週次計画
    feature_risk_avoidance_report: 'pro', // ファクトベースROI
    feature_acwr_trend_chart: 'pro',      // ACWR トレンド
    feature_custom_bayes: 'enterprise',
    feature_enterprise: 'enterprise',
    feature_multi_team: 'enterprise',
  }

  const minPlan = featureToMinPlan[feature]

  if (!minPlan) return ''

  const planOrder: PlanId[] = ['standard', 'pro', 'pro_cv', 'enterprise']
  const currentIndex = planOrder.indexOf(currentPlan)
  const requiredIndex = planOrder.indexOf(minPlan)

  if (currentIndex < requiredIndex) {
    const planNames: Record<PlanId, string> = {
      standard: 'Standard',
      pro: 'Pro',
      pro_cv: 'Pro + CV Addon',
      enterprise: 'Enterprise',
    }
    if (minPlan === 'enterprise') {
      return `Enterprise プランへのアップグレードまたはお問い合わせが必要です。`
    }
    return `${planNames[minPlan]} プランへのアップグレードが必要です。`
  }

  return ''
}

// ============================================================
// プラン名の日本語表示
// ============================================================

export function getPlanDisplayName(plan: PlanId): string {
  const names: Record<PlanId, string> = {
    standard: 'Standard（¥100,000/月）',
    pro: 'Pro（¥300,000/月）',
    pro_cv: 'Pro + CV Addon（¥500,000/月）',
    enterprise: 'Enterprise（要お問合せ）',
  }
  return names[plan]
}
