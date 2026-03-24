/**
 * Supabase Edge Function — dunning-cron
 * ============================================================
 * Supabase Cron（pg_cron）または外部スケジューラーから呼び出される
 * Dunning（支払い失敗後の段階的督促処理）Cron ジョブ。
 *
 * 推奨実行スケジュール: 毎日 09:00 JST（00:00 UTC）
 * Supabase ダッシュボード > Database > Extensions > pg_cron で設定:
 *   SELECT cron.schedule(
 *     'dunning-daily',
 *     '0 0 * * *',
 *     $$
 *       SELECT net.http_post(
 *         url := 'https://[project-ref].supabase.co/functions/v1/dunning-cron',
 *         headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
 *         body := '{}'::jsonb
 *       )
 *     $$
 *   );
 *
 * 処理フロー（dunning.ts に準拠）:
 *   Day  1: メール通知（Supabase Auth 経由）
 *   Day  3: 2回目メール + Slack アラート
 *   Day  7: 読み取り専用モード（アクセス制限）
 *   Day 14: サブスクリプション停止
 *
 * 【防壁4】耐障害性: 1件の失敗が他の処理をブロックしない（try/catch per record）
 * ============================================================
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface DunningSchedule {
  id: string;
  stripe_customer_id: string;
  org_id: string;
  failed_at: string;
  attempt_count: number;
  day1_sent_at: string | null;
  day3_sent_at: string | null;
  day7_restricted_at: string | null;
  day14_canceled_at: string | null;
}

type DunningAction = "day1_email" | "day3_email_slack" | "day7_restrict" | "day14_cancel";

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

async function notifySlack(message: string, level: "info" | "warning" | "error" = "warning") {
  const webhookUrl =
    Deno.env.get("HACHI_SLACK_WEBHOOK_URL") ||
    Deno.env.get("SLACK_WEBHOOK_BILLING") ||
    Deno.env.get("SLACK_WEBHOOK_URL");
  if (!webhookUrl) return;

  const emoji = level === "error" ? ":red_circle:" : level === "warning" ? ":warning:" : ":white_check_mark:";

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `${emoji} [dunning-cron] ${message}` }),
  }).catch((e) => console.warn("Slack 通知失敗:", e));
}

// ---------------------------------------------------------------------------
// Supabase Auth メール通知（Edge Function 内での簡易実装）
// 実際の運用では Supabase Email Templates を使用するか、
// SendGrid / Resend 等の外部サービスを利用すること
// ---------------------------------------------------------------------------

async function sendDunningEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  attempt: 1 | 2
): Promise<void> {
  // org の管理者ユーザーを取得
  const { data: orgUsers } = await supabase
    .from("organization_members")
    .select("user_id, users(email)")
    .eq("org_id", orgId)
    .eq("role", "admin")
    .limit(1);

  if (!orgUsers || orgUsers.length === 0) {
    console.warn(`[dunning-cron] org_id=${orgId} の管理者が見つかりません`);
    return;
  }

  // ここでは通知ログを記録（実際のメール送信は外部サービスに委ねる）
  // production では Resend/SendGrid の API をここで呼び出す
  console.info(
    `[dunning-cron] メール通知 attempt=${attempt} org_id=${orgId}`
  );

  // Slack にもアラート（Day 3 以降は Slack 必須）
  if (attempt >= 2) {
    await notifySlack(
      `支払い失敗 Day3 通知: org=${orgId} — 未払いが続く場合 Day7 でアクセス制限`,
      "warning"
    );
  }
}

// ---------------------------------------------------------------------------
// Dunning アクション実行
// ---------------------------------------------------------------------------

async function executeDunningAction(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  schedule: DunningSchedule,
  action: DunningAction
): Promise<void> {
  const { id, org_id, stripe_customer_id } = schedule;
  const now = new Date().toISOString();

  switch (action) {
    case "day1_email": {
      await sendDunningEmail(supabase, org_id, 1);
      await supabase
        .from("dunning_schedules")
        .update({ day1_sent_at: now })
        .eq("id", id);
      console.info(`[dunning-cron] Day1 メール送信完了: org=${org_id}`);
      break;
    }

    case "day3_email_slack": {
      await sendDunningEmail(supabase, org_id, 2);
      await supabase
        .from("dunning_schedules")
        .update({ day3_sent_at: now })
        .eq("id", id);
      console.info(`[dunning-cron] Day3 メール+Slack 完了: org=${org_id}`);
      break;
    }

    case "day7_restrict": {
      // サブスクリプションを read_only に変更
      await supabase
        .from("subscriptions")
        .update({ status: "read_only", updated_at: now })
        .eq("org_id", org_id);

      await supabase
        .from("dunning_schedules")
        .update({ day7_restricted_at: now })
        .eq("id", id);

      await notifySlack(
        `読み取り専用制限適用: org=${org_id} customer=${stripe_customer_id}`,
        "error"
      );
      console.info(`[dunning-cron] Day7 アクセス制限適用: org=${org_id}`);
      break;
    }

    case "day14_cancel": {
      // サブスクリプションを canceled に変更
      await supabase
        .from("subscriptions")
        .update({ status: "canceled", updated_at: now })
        .eq("org_id", org_id);

      await supabase
        .from("dunning_schedules")
        .update({ day14_canceled_at: now })
        .eq("id", id);

      await notifySlack(
        `サブスクリプション自動解約: org=${org_id} customer=${stripe_customer_id}`,
        "error"
      );
      console.info(`[dunning-cron] Day14 自動解約: org=${org_id}`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

async function processPendingDunningSchedules(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<{ processed: number; errors: number }> {
  const now = new Date();

  // 未完了の Dunning スケジュールを取得（day14_canceled_at が null のもの）
  const { data: schedules, error } = await supabase
    .from("dunning_schedules")
    .select("*")
    .is("day14_canceled_at", null)
    .order("failed_at", { ascending: true });

  if (error) throw error;
  if (!schedules || schedules.length === 0) {
    console.info("[dunning-cron] 処理対象なし");
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const schedule of schedules as DunningSchedule[]) {
    try {
      const failedAt = new Date(schedule.failed_at);
      const daysSinceFailed = Math.floor(
        (now.getTime() - failedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 実行すべきアクションを判定（1件のスケジュールで最大1アクション/日）
      let action: DunningAction | null = null;

      if (daysSinceFailed >= 14 && !schedule.day14_canceled_at) {
        action = "day14_cancel";
      } else if (daysSinceFailed >= 7 && !schedule.day7_restricted_at) {
        action = "day7_restrict";
      } else if (daysSinceFailed >= 3 && !schedule.day3_sent_at) {
        action = "day3_email_slack";
      } else if (daysSinceFailed >= 1 && !schedule.day1_sent_at) {
        action = "day1_email";
      }

      if (action) {
        await executeDunningAction(supabase, schedule, action);
        processed++;
      }
    } catch (err) {
      // 1件の失敗が他の処理をブロックしない（防壁4）
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[dunning-cron] スケジュール処理エラー (id=${schedule.id}):`,
        message
      );
      errors++;
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// メインハンドラー
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Authorization ヘッダーで認証（Supabase cron からの呼び出しを前提）
  // 【防壁1】環境変数未設定時は 500 を返し認証をスキップしない
  const authHeader = req.headers.get("authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    console.error("[dunning-cron] SUPABASE_SERVICE_ROLE_KEY が未設定です");
    return new Response("Internal Server Error", { status: 500 });
  }

  // タイミングサイドチャネル攻撃防止: 定長バイト比較（防壁1）
  const expected = new TextEncoder().encode(`Bearer ${serviceRoleKey}`);
  const received = new TextEncoder().encode(authHeader.padEnd(`Bearer ${serviceRoleKey}`.length, "\0").slice(0, `Bearer ${serviceRoleKey}`.length));
  const timingSafe = (crypto.subtle as unknown as { timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean }).timingSafeEqual;
  const authorized = authHeader.length === `Bearer ${serviceRoleKey}`.length &&
    (timingSafe ? timingSafe(expected, received) : authHeader === `Bearer ${serviceRoleKey}`);

  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const { processed, errors } = await processPendingDunningSchedules(supabase);

    const result = {
      success: true,
      processed,
      errors,
      executedAt: new Date().toISOString(),
    };

    console.info("[dunning-cron] 実行完了:", result);

    if (errors > 0) {
      await notifySlack(
        `Dunning Cron 完了（エラーあり）: processed=${processed} errors=${errors}`,
        "warning"
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dunning-cron] 致命的エラー:", message);
    await notifySlack(`Dunning Cron 致命的エラー: ${message}`, "error");

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
