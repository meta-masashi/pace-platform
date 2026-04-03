/**
 * pace-platform/lib/billing/dunning.ts
 * ============================================================
 * Dunning（支払い失敗処理）
 * 支払い失敗後の段階的アクセス制限と通知フロー
 *
 * フロー:
 *   Day  1: メール通知（Supabase Auth 経由）
 *   Day  3: 2回目メール + Slack アラート
 *   Day  7: 読み取り専用モード（アクセス制限）
 *   Day 14: サブスクリプション停止
 *
 * 【防壁4】耐障害性: データは猶予期間中も保持
 * ============================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('billing');

// ============================================================
// 型定義
// ============================================================

export interface DunningSchedule {
  id: string
  stripe_customer_id: string
  org_id: string
  failed_at: string
  attempt_count: number
  day1_sent_at: string | null
  day3_sent_at: string | null
  day7_restricted_at: string | null
  day14_canceled_at: string | null
  resolved_at: string | null
  updated_at: string
}

export type DunningStage = 'day1' | 'day3' | 'day7' | 'day14' | 'resolved' | 'pending'

// ============================================================
// Supabase Admin クライアント
// ============================================================

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[dunning] Supabase 環境変数が未設定です。')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// ============================================================
// Slack 通知（内部ヘルパー）
// ============================================================

async function notifySlack(message: string, level: 'warning' | 'error'): Promise<void> {
  const webhookUrl = process.env.HACHI_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) return

  const emoji = level === 'error' ? ':red_circle:' : ':warning:'

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *[PACE Dunning]* ${message}`,
      }),
    })
  } catch (err) {
    log.errorFromException('Slack 通知失敗', err)
  }
}

// ============================================================
// メール通知（Supabase Auth 経由）
// ============================================================

async function sendPaymentFailedEmail(
  supabase: SupabaseClient,
  orgId: string,
  stage: 'day1' | 'day3'
): Promise<void> {
  // org_id から管理者ユーザーのメールアドレスを取得
  const { data: orgData } = await supabase
    .from('organizations')
    .select('owner_user_id, name')
    .eq('id', orgId)
    .single()

  if (!orgData) {
    log.warn(`組織が見つかりません: org_id=${orgId}`)
    return
  }

  // Supabase Auth からユーザーのメールアドレスを取得
  const { data: userData } = await supabase.auth.admin.getUserById(orgData.owner_user_id)

  if (!userData?.user?.email) {
    log.warn(`ユーザーのメールアドレスが見つかりません: user_id=${orgData.owner_user_id}`)
    return
  }

  const subject =
    stage === 'day1'
      ? '[PACE] お支払いに失敗しました - ご確認をお願いします'
      : '[PACE] 【重要】お支払いが確認できていません - 早急なご対応をお願いします'

  const body =
    stage === 'day1'
      ? `${orgData.name} 様\n\n定期お支払いの処理に失敗しました。\nお支払い方法をご確認いただき、クレジットカード情報を更新してください。\n\nカスタマーポータル: ${process.env.NEXT_PUBLIC_SITE_URL}/billing\n\n※ お支払いが確認できない場合、7日後にアクセスが制限されます。`
      : `${orgData.name} 様\n\n【重要】お支払いが依然として確認できていません。\n\n本日より4日以内にお支払い方法を更新いただかない場合、アクセスが読み取り専用に制限されます。\n\nカスタマーポータル: ${process.env.NEXT_PUBLIC_SITE_URL}/billing\n\nご不明な点はサポートまでお問い合わせください。`

  // Supabase Auth 経由でメール送信（カスタムSMTP設定が必要）
  // 本番環境では SendGrid / Resend 等のメールプロバイダーを設定すること
  // PII マスキング: メールアドレスをログに直接出力しない（防壁2）
  const maskedEmail = userData.user.email
    ? userData.user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
    : '***'
  log.info(`メール送信: to=${maskedEmail}, subject=${subject}`)

  // TODO: 実際のメール送信は SMTP プロバイダー連携後に実装
  // await sendEmail({ to: userData.user.email, subject, body })
}

// ============================================================
// Dunning ステージ処理（Day 1）
// ============================================================

export async function processDunningDay1(
  schedule: DunningSchedule
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    await sendPaymentFailedEmail(supabase, schedule.org_id, 'day1')

    await supabase
      .from('dunning_schedules')
      .update({
        day1_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    log.info(`Day 1 メール送信完了: org=${schedule.org_id}`)
  } catch (err) {
    log.errorFromException('Day 1 処理エラー', err)
    await notifySlack(`Dunning Day 1 処理エラー: org=${schedule.org_id}, error=${err instanceof Error ? err.message : String(err)}`, 'error')
    throw err
  }
}

// ============================================================
// Dunning ステージ処理（Day 3）
// ============================================================

export async function processDunningDay3(
  schedule: DunningSchedule
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    await sendPaymentFailedEmail(supabase, schedule.org_id, 'day3')

    await supabase
      .from('dunning_schedules')
      .update({
        day3_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    await notifySlack(
      `Dunning Day 3: org=${schedule.org_id} の支払いが3日間未解決です。2回目のメールを送信しました。`,
      'warning'
    )

    log.info(`Day 3 メール送信完了: org=${schedule.org_id}`)
  } catch (err) {
    log.errorFromException('Day 3 処理エラー', err)
    await notifySlack(`Dunning Day 3 処理エラー: org=${schedule.org_id}, error=${err instanceof Error ? err.message : String(err)}`, 'error')
    throw err
  }
}

// ============================================================
// Dunning ステージ処理（Day 7）: 読み取り専用モード
// ============================================================

export async function processDunningDay7(
  schedule: DunningSchedule
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    // subscriptions テーブルで読み取り専用フラグを設定
    await supabase
      .from('subscriptions')
      .update({
        status: 'read_only',  // カスタムステータス: アクセス制限（データは保持）
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', schedule.org_id)

    await supabase
      .from('dunning_schedules')
      .update({
        day7_restricted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    await notifySlack(
      `Dunning Day 7: org=${schedule.org_id} を読み取り専用モードに移行しました。7日間支払いが確認できていません。`,
      'warning'
    )

    log.warn(`Day 7 アクセス制限: org=${schedule.org_id} を読み取り専用に移行`)
  } catch (err) {
    log.errorFromException('Day 7 処理エラー', err)
    await notifySlack(`Dunning Day 7 処理エラー: org=${schedule.org_id}, error=${err instanceof Error ? err.message : String(err)}`, 'error')
    throw err
  }
}

// ============================================================
// Dunning ステージ処理（Day 14）: サブスクリプション停止
// ============================================================

export async function processDunningDay14(
  schedule: DunningSchedule
): Promise<void> {
  const supabase = getSupabaseAdmin()

  try {
    // status を canceled に変更（データは保持）
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', schedule.org_id)

    await supabase
      .from('dunning_schedules')
      .update({
        day14_canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    await notifySlack(
      `Dunning Day 14: org=${schedule.org_id} のサブスクリプションを停止しました。データは保持されています（graceful degradation）。`,
      'error'
    )

    log.warn(`Day 14 サブスクリプション停止: org=${schedule.org_id}（データ保持）`)
  } catch (err) {
    log.errorFromException('Day 14 処理エラー', err)
    await notifySlack(`Dunning Day 14 処理エラー: org=${schedule.org_id}, error=${err instanceof Error ? err.message : String(err)}`, 'error')
    throw err
  }
}

// ============================================================
// Dunning 解決（支払い成功時）
// ============================================================

export async function resolveDunning(stripeCustomerId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  const { error } = await supabase
    .from('dunning_schedules')
    .update({
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)
    .is('resolved_at', null)

  if (error) {
    log.error(`Dunning 解決処理エラー: ${error.message}`)
  }
}

// ============================================================
// 未処理 Dunning スケジュールの一括処理（Cron ジョブから呼び出す）
// ============================================================

export async function processPendingDunningSchedules(): Promise<void> {
  const supabase = getSupabaseAdmin()

  // 未解決の Dunning スケジュールを取得
  const { data: schedules, error } = await supabase
    .from('dunning_schedules')
    .select('*')
    .is('resolved_at', null)
    .is('day14_canceled_at', null)

  if (error) {
    log.error('Dunning スケジュール取得エラー', { data: { error: error.message } })
    await notifySlack(`Dunning スケジュール取得エラー: ${error.message}`, 'error')
    return
  }

  if (!schedules || schedules.length === 0) {
    return
  }

  const now = new Date()

  for (const schedule of schedules as DunningSchedule[]) {
    const failedAt = new Date(schedule.failed_at)
    const daysSinceFailed = Math.floor((now.getTime() - failedAt.getTime()) / (1000 * 60 * 60 * 24))

    try {
      if (daysSinceFailed >= 14 && !schedule.day14_canceled_at) {
        await processDunningDay14(schedule)
      } else if (daysSinceFailed >= 7 && !schedule.day7_restricted_at) {
        await processDunningDay7(schedule)
      } else if (daysSinceFailed >= 3 && !schedule.day3_sent_at) {
        await processDunningDay3(schedule)
      } else if (daysSinceFailed >= 1 && !schedule.day1_sent_at) {
        await processDunningDay1(schedule)
      }
    } catch (err) {
      // 個別エラーは既に通知済み。他のスケジュール処理は継続
      log.errorFromException(`schedule=${schedule.id} の処理中にエラー（スキップして継続）`, err)
    }
  }
}

// ============================================================
// 現在の Dunning ステージを返す
// ============================================================

export function getDunningStage(schedule: DunningSchedule): DunningStage {
  if (schedule.resolved_at) return 'resolved'
  if (schedule.day14_canceled_at) return 'day14'
  if (schedule.day7_restricted_at) return 'day7'
  if (schedule.day3_sent_at) return 'day3'
  if (schedule.day1_sent_at) return 'day1'
  return 'pending'
}
