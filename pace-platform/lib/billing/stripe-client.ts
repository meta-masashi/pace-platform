/**
 * pace-platform/lib/billing/stripe-client.ts
 * ============================================================
 * Stripe SDK 初期化 + プラン定義 + セッション管理
 * 【防壁1】モック実装なし: Stripe テスト環境と実接続
 * 【防壁2】サーバーサイド専用（クライアントから直接インポート禁止）
 * 【防壁3】コスト保護: 金額は JPY 固定
 * ============================================================
 */

// サーバーサイド専用ガード
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).window !== 'undefined') {
  throw new Error(
    '[stripe-client] このモジュールはサーバーサイド専用です。クライアントコンポーネントからのインポートは禁止されています。'
  )
}

import Stripe from 'stripe'

// ============================================================
// Stripe クライアント初期化
// ============================================================

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!stripeSecretKey) {
  console.warn(
    '[stripe-client] STRIPE_SECRET_KEY が未設定です。決済機能は無効化されています。テスト環境では sk_test_... を設定してください。'
  )
}

export const stripe: Stripe | null = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  : null

// ============================================================
// プラン定義（JPY 固定）
// ============================================================

export type PlanId = 'starter' | 'pro' | 'enterprise'

export interface PlanDefinition {
  id: PlanId
  name: string
  priceJpy: number | null   // enterprise は問い合わせ制のため null
  maxStaff: number | null   // null = 無制限
  maxAthletes: number | null
  priceId: string | null    // Stripe Price ID（環境変数から取得）
  features: string[]
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceJpy: 29800,
    maxStaff: 5,
    maxAthletes: 50,
    priceId: process.env.STRIPE_STARTER_PRICE_ID ?? null,
    features: [
      'feature_basic_assessment',
      'feature_daily_checkin',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceJpy: 79800,
    maxStaff: 20,
    maxAthletes: 200,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    features: [
      'feature_basic_assessment',
      'feature_daily_checkin',
      'feature_cv_analysis',
      'feature_rag_pipeline',
      'feature_gemini_ai',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceJpy: null,
    maxStaff: null,
    maxAthletes: null,
    priceId: null,  // 個別契約のため Stripe Price ID なし
    features: [
      'feature_basic_assessment',
      'feature_daily_checkin',
      'feature_cv_analysis',
      'feature_rag_pipeline',
      'feature_gemini_ai',
      'feature_custom_bayes',
      'feature_enterprise',
    ],
  },
}

// ============================================================
// チェックアウトセッション作成
// ============================================================

export interface CreateCheckoutSessionParams {
  orgId: string
  userId: string
  planId: Exclude<PlanId, 'enterprise'>  // enterprise は問い合わせ制
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  existingCustomerId?: string
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  if (!stripe) {
    throw new Error('[stripe-client] Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。')
  }

  const plan = PLANS[params.planId]
  if (!plan.priceId) {
    throw new Error(
      `[stripe-client] ${params.planId} プランの Price ID が未設定です。` +
      `STRIPE_${params.planId.toUpperCase()}_PRICE_ID 環境変数を設定してください。`
    )
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    currency: 'jpy',
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      org_id: params.orgId,
      user_id: params.userId,
      plan_id: params.planId,
    },
    subscription_data: {
      metadata: {
        org_id: params.orgId,
        user_id: params.userId,
        plan_id: params.planId,
      },
    },
    // 既存顧客の場合はカスタマーIDを指定
    ...(params.existingCustomerId
      ? { customer: params.existingCustomerId }
      : params.customerEmail
      ? { customer_email: params.customerEmail }
      : {}),
    // 解約後はデータを保持（cancel_at_period_end 方式）
    payment_method_collection: 'always',
    // 日本語ロケール
    locale: 'ja',
  }

  return stripe.checkout.sessions.create(sessionParams)
}

// ============================================================
// カスタマーポータルセッション作成
// ============================================================

export interface CreatePortalSessionParams {
  stripeCustomerId: string
  returnUrl: string
}

export async function createPortalSession(
  params: CreatePortalSessionParams
): Promise<Stripe.BillingPortal.Session> {
  if (!stripe) {
    throw new Error('[stripe-client] Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。')
  }

  return stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  })
}

// ============================================================
// サブスクリプション状態取得
// ============================================================

export interface SubscriptionState {
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: Stripe.Subscription.Status
  planId: PlanId | null
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  trialEnd: Date | null
}

export async function getSubscriptionState(
  stripeSubscriptionId: string
): Promise<SubscriptionState> {
  if (!stripe) {
    throw new Error('[stripe-client] Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。')
  }

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price'],
  })

  // Price ID からプラン名を逆引き
  const priceId = subscription.items.data[0]?.price?.id ?? null
  const planId = priceId
    ? (Object.entries(PLANS).find(([, p]) => p.priceId === priceId)?.[0] as PlanId | undefined) ?? null
    : null

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer as string,
    status: subscription.status,
    planId,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
  }
}

// ============================================================
// サブスクリプション解約（期末解約）
// ============================================================

export async function cancelSubscriptionAtPeriodEnd(
  stripeSubscriptionId: string
): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('[stripe-client] Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。')
  }

  // データ保持ポリシー: 即時削除せず期末解約
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  })
}

// ============================================================
// サブスクリプション解約取り消し（復活）
// ============================================================

export async function reactivateSubscription(
  stripeSubscriptionId: string
): Promise<Stripe.Subscription> {
  if (!stripe) {
    throw new Error('[stripe-client] Stripe が初期化されていません。STRIPE_SECRET_KEY を設定してください。')
  }

  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  })
}
