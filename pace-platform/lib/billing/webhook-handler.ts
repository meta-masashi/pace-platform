/**
 * pace-platform/lib/billing/webhook-handler.ts
 * ============================================================
 * Stripe Webhook ハンドラー
 * 【防壁1】署名検証 + 冪等性保証（同一イベントの二重処理防止）
 * 【防壁4】耐障害性: エラー時は Slack 通知 + ログ記録
 * ============================================================
 */

import Stripe from 'stripe'
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('billing');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { stripe } from './stripe-client'
import type { PlanId } from './stripe-client'
import { PLANS } from './stripe-client'

// Supabase クライアントの型（Webhook ハンドラー内では any スキーマを使用）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = SupabaseClient<any, any, any>

// ============================================================
// Supabase Admin クライアント（サービスロールキー使用）
// ============================================================

function getSupabaseAdmin(): SupabaseAdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[webhook-handler] Supabase 環境変数が未設定です。')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

// ============================================================
// Slack エラー通知
// ============================================================

async function notifySlack(message: string, level: 'info' | 'warning' | 'error' = 'error'): Promise<void> {
  const webhookUrl = process.env.HACHI_SLACK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    log.warn('HACHI_SLACK_WEBHOOK_URL が未設定のため Slack 通知をスキップします')
    return
  }

  const emoji = level === 'error' ? ':red_circle:' : level === 'warning' ? ':warning:' : ':white_check_mark:'

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *[PACE Billing]* ${message}`,
      }),
    })
  } catch (err) {
    // Slack 通知失敗はログのみ（決済処理をブロックしない）
    log.errorFromException('Slack 通知失敗', err)
  }
}

// ============================================================
// メイン: Webhook イベント処理
// ============================================================

export interface WebhookHandlerResult {
  received: boolean
  alreadyProcessed?: boolean
  error?: string
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string
): Promise<WebhookHandlerResult> {
  if (!stripe) {
    const msg = 'Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。'
    log.error(msg)
    return { received: false, error: msg }
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    const msg = 'STRIPE_WEBHOOK_SECRET が未設定です。Webhook 署名を検証できません。'
    await notifySlack(msg, 'error')
    return { received: false, error: msg }
  }

  // --------------------------------------------------------
  // 【防壁2】Webhook 署名検証（改ざん防止）
  // --------------------------------------------------------
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const msg = `Webhook 署名検証失敗: ${err instanceof Error ? err.message : String(err)}`
    log.error(msg)
    return { received: false, error: msg }
  }

  const supabase = getSupabaseAdmin()

  // --------------------------------------------------------
  // 冪等性チェック（同一イベントの二重処理防止）
  // --------------------------------------------------------
  const { error: insertError } = await supabase
    .from('stripe_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    })

  if (insertError) {
    if (insertError.code === '23505') {
      // unique_violation: 既に処理済み
      log.info(`重複イベントをスキップ: ${event.id}`)
      return { received: true, alreadyProcessed: true }
    }
    // その他のDBエラー
    const msg = `stripe_events への記録失敗: ${insertError.message} (event: ${event.id})`
    log.error(msg)
    await notifySlack(msg, 'error')
    return { received: false, error: msg }
  }

  // --------------------------------------------------------
  // イベント種別ごとの処理
  // --------------------------------------------------------
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase)
        break

      default:
        // 未処理イベントはスキップ（ログのみ）
        log.info(`未処理イベントタイプ: ${event.type}`)
    }
  } catch (err) {
    const msg = `イベント処理中にエラーが発生しました (event: ${event.id}, type: ${event.type}): ${err instanceof Error ? err.message : String(err)}`
    log.error(msg)
    await notifySlack(msg, 'error')
    return { received: false, error: msg }
  }

  return { received: true }
}

// ============================================================
// checkout.session.completed → サブスクリプション有効化
// ============================================================

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseAdminClient
): Promise<void> {
  const orgId = session.metadata?.org_id
  const planId = session.metadata?.plan_id as PlanId | undefined
  const stripeCustomerId = session.customer as string | null
  const stripeSubscriptionId = session.subscription as string | null

  if (!orgId || !stripeCustomerId || !stripeSubscriptionId) {
    throw new Error(
      `checkout.session.completed に必要なメタデータが不足しています: ` +
      `org_id=${orgId}, customer=${stripeCustomerId}, subscription=${stripeSubscriptionId}`
    )
  }

  // サブスクリプション詳細を Stripe から取得
  if (!stripe) throw new Error('Stripe が初期化されていません。')

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        plan: planId ?? resolvePlanFromSubscription(subscription),
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

  if (error) {
    throw new Error(`subscriptions upsert 失敗: ${error.message}`)
  }

  log.info(`サブスクリプション有効化完了: org=${orgId}, plan=${planId}`)
  await notifySlack(
    `新規サブスクリプション開始: org_id=${orgId}, plan=${planId}, subscription=${stripeSubscriptionId}`,
    'info'
  )
}

// ============================================================
// invoice.payment_succeeded → 支払い成功記録
// ============================================================

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: SupabaseAdminClient
): Promise<void> {
  const stripeCustomerId = invoice.customer as string

  // 支払い成功 → status を active に戻す（Dunning からの回復）
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)
    .neq('status', 'canceled')  // 解約済みは除外

  if (error) {
    throw new Error(`payment_succeeded 処理失敗: ${error.message}`)
  }

  // Dunning スケジュールをリセット
  await supabase
    .from('dunning_schedules')
    .update({ resolved_at: new Date().toISOString() })
    .eq('stripe_customer_id', stripeCustomerId)
    .is('resolved_at', null)

  log.info(`支払い成功記録: customer=${stripeCustomerId}`)
}

// ============================================================
// invoice.payment_failed → Dunning 開始
// ============================================================

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseAdminClient
): Promise<void> {
  const stripeCustomerId = invoice.customer as string
  const attemptCount = invoice.attempt_count ?? 1

  // status を past_due に更新
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)

  if (error) {
    throw new Error(`payment_failed ステータス更新失敗: ${error.message}`)
  }

  // Dunning スケジュールを作成（既存がなければ）
  const now = new Date()
  const { error: dunningError } = await supabase
    .from('dunning_schedules')
    .upsert(
      {
        stripe_customer_id: stripeCustomerId,
        failed_at: now.toISOString(),
        attempt_count: attemptCount,
        day1_sent_at: null,
        day3_sent_at: null,
        day7_restricted_at: null,
        day14_canceled_at: null,
        resolved_at: null,
        updated_at: now.toISOString(),
      },
      { onConflict: 'stripe_customer_id', ignoreDuplicates: false }
    )

  if (dunningError) {
    log.warn(`Dunning スケジュール作成警告: ${dunningError.message}`)
  }

  log.warn(`支払い失敗 Dunning 開始: customer=${stripeCustomerId}, attempt=${attemptCount}`)
  await notifySlack(
    `支払い失敗を検出しました: customer=${stripeCustomerId}, 試行回数=${attemptCount}。Dunning プロセスを開始します。`,
    'warning'
  )
}

// ============================================================
// customer.subscription.updated → プラン変更反映
// ============================================================

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdminClient
): Promise<void> {
  const stripeCustomerId = subscription.customer as string
  const planId = resolvePlanFromSubscription(subscription)

  const { error } = await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      plan: planId,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)

  if (error) {
    throw new Error(`subscription.updated 処理失敗: ${error.message}`)
  }

  log.info(`サブスクリプション更新: customer=${stripeCustomerId}, plan=${planId}, status=${subscription.status}`)
}

// ============================================================
// customer.subscription.deleted → アクセス無効化
// ============================================================

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseAdminClient
): Promise<void> {
  const stripeCustomerId = subscription.customer as string

  // データは保持し、status のみ canceled に変更（graceful degradation）
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', stripeCustomerId)

  if (error) {
    throw new Error(`subscription.deleted 処理失敗: ${error.message}`)
  }

  log.info(`サブスクリプション解約完了: customer=${stripeCustomerId}`)
  await notifySlack(
    `サブスクリプション解約: customer=${stripeCustomerId}。データは保持されています。`,
    'warning'
  )
}

// ============================================================
// ヘルパー: Subscription から PlanId を解決
// ============================================================

function resolvePlanFromSubscription(subscription: Stripe.Subscription): PlanId {
  const priceId = subscription.items.data[0]?.price?.id
  if (!priceId) return 'standard'

  const found = Object.entries(PLANS).find(([, p]) => p.priceId === priceId)
  return (found?.[0] as PlanId | undefined) ?? 'standard'
}
