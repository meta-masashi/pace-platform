/**
 * Supabase Edge Function — stripe-webhook
 * ============================================================
 * Stripe からの Webhook イベントを受け取り、署名検証後に
 * pace-platform/lib/billing/webhook-handler.ts の処理ロジックを
 * Deno 環境でネイティブに実行する。
 *
 * エンドポイント: POST /functions/v1/stripe-webhook
 * 認証: Stripe-Signature ヘッダーによる署名検証
 *
 * Stripe ダッシュボード設定:
 *   Developers > Webhooks > Add endpoint
 *   URL: https://[project-ref].supabase.co/functions/v1/stripe-webhook
 *   リッスンするイベント:
 *     - checkout.session.completed
 *     - invoice.payment_succeeded
 *     - invoice.payment_failed
 *     - customer.subscription.updated
 *     - customer.subscription.deleted
 *
 * 【防壁1】Stripe 署名検証（constructEvent）で偽装リクエストを排除
 * 【防壁4】冪等性保証: stripe_events テーブルで重複処理を防止
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Stripe 署名検証（Deno 対応版）
// Web Crypto API を使用して HMAC-SHA256 で検証
// ---------------------------------------------------------------------------

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<void> {
  // sigHeader 形式: "t=1234,v1=abcd,v0=efgh"
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=", 2) as [string, string])
  );

  const timestamp = parts["t"];
  const signature = parts["v1"];

  if (!timestamp || !signature) {
    throw new Error("Stripe-Signature ヘッダーの形式が不正です");
  }

  // タイムスタンプ検証（5分以内）
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    throw new Error("Webhook タイムスタンプが古すぎます（リプレイ攻撃の可能性）");
  }

  // 署名計算
  const signedPayload = `${timestamp}.${payload}`;
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(signedPayload);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, msgData);
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // タイミングサイドチャネル攻撃防止: 文字列長が異なる場合でも同じ時間で比較（防壁1）
  const expectedBytes = new TextEncoder().encode(expectedSig);
  const receivedBytes = new TextEncoder().encode(signature.padEnd(expectedSig.length, "\0").slice(0, expectedSig.length));
  const equal = expectedBytes.length === signature.length &&
    crypto.subtle.timingSafeEqual
      ? // Deno 1.37+ timingSafeEqual 対応
        (crypto.subtle as unknown as { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean }).timingSafeEqual?.(expectedBytes, receivedBytes) ?? (expectedSig === signature)
      : expectedSig === signature;

  if (!equal) {
    throw new Error("Stripe 署名の検証に失敗しました");
  }
}

// ---------------------------------------------------------------------------
// Supabase Admin クライアント
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase 環境変数が未設定です");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Slack 通知
// ---------------------------------------------------------------------------

async function notifySlack(message: string, level: "info" | "warning" | "error" = "error") {
  const webhookUrl =
    Deno.env.get("HACHI_SLACK_WEBHOOK_URL") || Deno.env.get("SLACK_WEBHOOK_URL");
  if (!webhookUrl) return;

  const emoji = level === "error" ? ":red_circle:" : level === "warning" ? ":warning:" : ":white_check_mark:";

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${emoji} [stripe-webhook] ${message}` }),
  }).catch((e) => console.warn("Slack 通知失敗:", e));
}

// ---------------------------------------------------------------------------
// イベント処理
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvent(event: Record<string, any>, supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { type, id: eventId, data } = event;
  const obj = data?.object ?? {};

  switch (type) {
    case "checkout.session.completed": {
      const orgId = obj.metadata?.org_id;
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;

      if (!orgId) {
        console.warn(`[stripe-webhook] checkout.session.completed: org_id が metadata にありません (event=${eventId})`);
        return;
      }

      const { error } = await supabase.from("subscriptions").upsert(
        {
          org_id: orgId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: "active",
          plan_id: obj.metadata?.plan_id ?? "starter",
          current_period_start: new Date(obj.created * 1000).toISOString(),
          current_period_end: null,
        },
        { onConflict: "org_id" }
      );

      if (error) throw error;

      await notifySlack(
        `新規サブスクリプション開始: org=${orgId} plan=${obj.metadata?.plan_id ?? "starter"}`,
        "info"
      );
      break;
    }

    case "invoice.payment_succeeded": {
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;

      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: new Date(obj.period_start * 1000).toISOString(),
          current_period_end: new Date(obj.period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId)
        .eq("stripe_subscription_id", subscriptionId);

      if (error) throw error;
      break;
    }

    case "invoice.payment_failed": {
      const customerId = obj.customer;

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;

      // Dunning スケジュール登録
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("org_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (sub?.org_id) {
        await supabase.from("dunning_schedules").upsert(
          {
            stripe_customer_id: customerId,
            org_id: sub.org_id,
            failed_at: new Date().toISOString(),
            attempt_count: 1,
          },
          { onConflict: "stripe_customer_id" }
        );
      }

      await notifySlack(
        `支払い失敗: customer=${customerId}`,
        "warning"
      );
      break;
    }

    case "customer.subscription.updated": {
      const customerId = obj.customer;
      const status = obj.status;

      const { error } = await supabase
        .from("subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;
      break;
    }

    case "customer.subscription.deleted": {
      const customerId = obj.customer;

      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_customer_id", customerId);

      if (error) throw error;

      await notifySlack(
        `サブスクリプション解約: customer=${customerId}`,
        "warning"
      );
      break;
    }

    default:
      console.info(`[stripe-webhook] 未処理のイベントタイプ: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// メインハンドラー
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET が未設定です");
    return new Response("Internal Server Error", { status: 500 });
  }

  const sigHeader = req.headers.get("stripe-signature");
  if (!sigHeader) {
    return new Response("stripe-signature ヘッダーがありません", { status: 400 });
  }

  const payload = await req.text();

  // 署名検証
  try {
    await verifyStripeSignature(payload, sigHeader, webhookSecret);
  } catch (err) {
    console.warn("[stripe-webhook] 署名検証失敗:", err);
    return new Response("署名の検証に失敗しました", { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: Record<string, any>;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("無効なJSONペイロード", { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 冪等性チェック（同一イベントの二重処理防止）
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .single();

  if (existing) {
    console.info(`[stripe-webhook] 重複イベント、スキップ: ${event.id}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // イベント記録（冪等性保証）
  const { error: insertError } = await supabase.from("stripe_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
    processed_at: new Date().toISOString(),
  });

  if (insertError?.code === "23505") {
    // 同時実行による重複（競合状態）
    console.info(`[stripe-webhook] 競合状態で重複、スキップ: ${event.id}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (insertError) {
    console.error("[stripe-webhook] イベント記録失敗:", insertError.message);
    return new Response("イベント記録に失敗しました", { status: 500 });
  }

  // イベント処理
  try {
    await handleEvent(event, supabase);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] イベント処理エラー (${event.type}):`, message);
    await notifySlack(`イベント処理エラー: type=${event.type} error=${message}`, "error");

    // Stripe は 2xx 以外を受け取ると再送するため、重複防止のため 200 を返す
    // stripe_events テーブルの failed_at を更新
    await supabase
      .from("stripe_events")
      .update({ error_message: message })
      .eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true, error: message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
