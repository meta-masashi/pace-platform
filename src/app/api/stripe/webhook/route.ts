/**
 * POST /api/stripe/webhook
 *
 * ADR-010 準拠:
 *  1. stripe.webhooks.constructEvent() で署名検証（必須）
 *  2. stripe_webhook_events テーブルで DEDUP（冪等性）
 *  3. checkout.session.completed → organizations.plan 更新 + subscriptions INSERT
 *  4. invoice.payment_failed → plan を 'standard' にダウングレード
 *  5. customer.subscription.deleted → plan を 'standard' にリセット
 *
 * NOTE: Next.js の bodyParser を無効化するため export const config を使用。
 * Stripe の署名検証には raw body が必要。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import type Stripe from "stripe";

// Next.js App Router では body の生データを取得するために headers から raw text を読む
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Service client (RLS バイパス)
// ---------------------------------------------------------------------------

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key);
}

// ---------------------------------------------------------------------------
// DEDUP: 処理済みイベントを確認・登録
// ---------------------------------------------------------------------------

async function isDuplicate(eventId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db
    .from("stripe_webhook_events")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return !!data;
}

async function markProcessed(eventId: string, eventType: string): Promise<void> {
  const db = getDb();
  await db.from("stripe_webhook_events").insert({
    stripe_event_id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function resolveOrg(
  db: ReturnType<typeof getDb>,
  customerId: string,
  fallbackOrgId?: string | null
): Promise<string | null> {
  const { data: org } = await db
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (org) return org.id;
  return fallbackOrgId ?? null;
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const db = getDb();
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  const planMeta = session.metadata?.plan as string | undefined;
  const addonType = session.metadata?.addon_type as string | undefined;

  const orgId = await resolveOrg(db, customerId, session.client_reference_id);
  if (!orgId) {
    console.warn("[stripe/webhook] checkout.session.completed: org not found for customer", customerId);
    return;
  }

  // CV Addon 購入フロー
  if (addonType === "cv_addon") {
    await db.from("organizations").update({
      cv_addon_enabled: true,
      stripe_cv_addon_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
    }).eq("id", orgId);
    await db.from("stripe_subscriptions").upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan: "cv_addon",
      status: "active",
      updated_at: new Date().toISOString(),
    });
    console.log(`[stripe/webhook] CV Addon activated for org ${orgId}`);
    return;
  }

  // Enterprise プラン購入フロー
  const plan = (planMeta as "pro" | "standard" | "enterprise") ?? "standard";
  const updates: Record<string, unknown> = {
    plan,
    stripe_customer_id: customerId,
  };
  if (plan === "enterprise") {
    updates.stripe_enterprise_subscription_id = subscriptionId;
    updates.cv_addon_enabled = true; // Enterprise は CV Addon を含む
  }

  await db.from("organizations").update(updates).eq("id", orgId);
  await db.from("stripe_subscriptions").upsert({
    org_id: orgId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    plan,
    status: "active",
    updated_at: new Date().toISOString(),
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const db = getDb();
  const customerId = invoice.customer as string;
  const rawSub = (invoice as unknown as Record<string, unknown>).subscription;
  const subscriptionId = typeof rawSub === "string"
    ? rawSub
    : (rawSub as Stripe.Subscription | null)?.id;

  const orgId = await resolveOrg(db, customerId);
  if (!orgId) return;

  // CV Addon サブスクリプションの支払い失敗 → addon 無効化
  const { data: org } = await db.from("organizations").select("stripe_cv_addon_subscription_id, plan").eq("id", orgId).maybeSingle();
  if (org?.stripe_cv_addon_subscription_id === subscriptionId) {
    await db.from("organizations").update({ cv_addon_enabled: false }).eq("id", orgId);
    console.warn(`[stripe/webhook] CV Addon payment_failed for org ${orgId} — addon disabled`);
  } else {
    // 通常プラン支払い失敗 → standard にダウングレード
    await db.from("organizations").update({ plan: "standard" }).eq("id", orgId);
    console.warn(`[stripe/webhook] payment_failed for customer ${customerId} — downgraded to standard`);
  }

  await db
    .from("stripe_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId);
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const db = getDb();
  const customerId = subscription.customer as string;

  const orgId = await resolveOrg(db, customerId);
  if (!orgId) return;

  const { data: org } = await db.from("organizations").select("stripe_cv_addon_subscription_id").eq("id", orgId).maybeSingle();

  if (org?.stripe_cv_addon_subscription_id === subscription.id) {
    // CV Addon サブスク解約 → addon 無効化のみ（プランはそのまま）
    await db.from("organizations").update({
      cv_addon_enabled: false,
      stripe_cv_addon_subscription_id: null,
    }).eq("id", orgId);
    console.log(`[stripe/webhook] CV Addon subscription deleted for org ${orgId}`);
  } else {
    // 通常プランサブスク解約 → standard にリセット
    await db.from("organizations").update({
      plan: "standard",
      stripe_enterprise_subscription_id: null,
    }).eq("id", orgId);
  }

  await db
    .from("stripe_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text(); // raw body for signature verification
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 });
  }

  // DEDUP check (ADR-010: 冪等性)
  if (await isDuplicate(event.id)) {
    console.log(`[stripe/webhook] duplicate event ${event.id} — skipped`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        // 未処理イベントは記録のみ
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }

    await markProcessed(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] handler error:", err);
    // 500 を返すと Stripe がリトライする（最大 3 回）
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
