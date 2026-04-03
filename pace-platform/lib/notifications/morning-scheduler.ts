/**
 * PACE Platform — 朝のアジェンダ通知スケジューラー
 *
 * 朝6:30（JST）に以下のフローを実行する:
 *   1. /api/morning-agenda を内部呼び出しして当日のアジェンダを生成
 *   2. チーム内全スタッフの通知プリファレンスを取得
 *   3. 設定されたチャネル（Email / Slack / Web Push）で通知を送信
 *   4. 結果をログに記録
 */

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createLogger } from '@/lib/observability/logger';
const log = createLogger('notifications');
import { sendMorningEmail } from "./email-sender";
import { sendSlackNotification } from "./slack-sender";
import { sendWebPush } from "./web-push";
import type {
  NotificationResult,
  NotificationPreference,
  EmailChannelConfig,
  SlackChannelConfig,
  WebPushChannelConfig,
} from "./types";

// ---------------------------------------------------------------------------
// 管理用 Supabase クライアント（Service Role）
// ---------------------------------------------------------------------------

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase 環境変数が設定されていません");
  }
  return createSupabaseAdmin(url, serviceKey);
}

// ---------------------------------------------------------------------------
// アジェンダ生成（内部 API 呼び出し）
// ---------------------------------------------------------------------------

interface AgendaResult {
  alertCount: number;
  criticalCount: number;
}

/**
 * /api/morning-agenda を内部的に呼び出してアジェンダを生成する。
 */
async function generateAgenda(
  teamId: string,
  date: string
): Promise<AgendaResult> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const url = `${siteUrl}/api/morning-agenda?teamId=${encodeURIComponent(teamId)}&date=${encodeURIComponent(date)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`アジェンダ生成エラー: ${response.status}`);
  }

  const body = await response.json();

  if (!body.success) {
    throw new Error(body.error ?? "アジェンダ生成に失敗しました");
  }

  return {
    alertCount:
      (body.data?.teamSummary?.criticalCount ?? 0) +
      (body.data?.teamSummary?.watchlistCount ?? 0),
    criticalCount: body.data?.teamSummary?.criticalCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// メインスケジューラー
// ---------------------------------------------------------------------------

/**
 * チーム単位の朝のアジェンダ通知を生成・送信する。
 *
 * @param teamId - 対象チーム ID
 * @returns 各チャネルの送信結果配列
 */
export async function generateAndSendMorningNotifications(
  teamId: string
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const date = new Date().toISOString().split("T")[0]!;
  const supabase = getAdminClient();

  // --- 1. チーム情報取得 ---
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, org_id")
    .eq("id", teamId)
    .single();

  if (!team) {
    return [
      {
        channel: "email",
        success: false,
        error: "チームが見つかりません",
        sentAt: new Date().toISOString(),
      },
    ];
  }

  const teamName = team.name as string;
  const orgId = team.org_id as string;

  // --- 2. アジェンダ生成 ---
  let agenda: AgendaResult;
  try {
    agenda = await generateAgenda(teamId, date);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return [
      {
        channel: "email",
        success: false,
        error: `アジェンダ生成失敗: ${message}`,
        sentAt: new Date().toISOString(),
      },
    ];
  }

  // --- 3. 通知プリファレンス取得 ---
  const { data: preferences } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("org_id", orgId)
    .eq("enabled", true);

  if (!preferences || preferences.length === 0) {
    return [
      {
        channel: "email",
        success: true,
        error: "有効な通知設定がありません",
        sentAt: new Date().toISOString(),
      },
    ];
  }

  // --- 4. スタッフ情報取得 ---
  const staffIds = [
    ...new Set(
      (preferences as NotificationPreference[]).map((p) => p.staff_id)
    ),
  ];

  const { data: staffMembers } = await supabase
    .from("staff")
    .select("id, email, name")
    .in("id", staffIds)
    .eq("is_active", true);

  const staffMap = new Map(
    (staffMembers ?? []).map((s) => [s.id as string, s])
  );

  // --- 5. チャネル別送信 ---
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pace.hachi.co.jp";
  const agendaUrl = `${siteUrl}/dashboard?date=${date}`;

  for (const pref of preferences as NotificationPreference[]) {
    const staff = staffMap.get(pref.staff_id);
    if (!staff) continue;

    switch (pref.channel) {
      case "email": {
        const config = pref.config as EmailChannelConfig;
        const result = await sendMorningEmail({
          to: config.email ?? (staff.email as string),
          teamName,
          date,
          alertCount: agenda.alertCount,
          criticalCount: agenda.criticalCount,
          agendaUrl,
        });
        results.push(result);
        break;
      }

      case "slack": {
        const config = pref.config as SlackChannelConfig;
        if (!config.webhookUrl) {
          results.push({
            channel: "slack",
            success: false,
            error: "Slack Webhook URL が設定されていません",
            sentAt: new Date().toISOString(),
          });
          break;
        }
        const result = await sendSlackNotification({
          webhookUrl: config.webhookUrl,
          teamName,
          date,
          alertCount: agenda.alertCount,
          criticalCount: agenda.criticalCount,
          agendaUrl,
        });
        results.push(result);
        break;
      }

      case "web_push": {
        const config = pref.config as WebPushChannelConfig;
        if (!config.subscription) {
          results.push({
            channel: "web_push",
            success: false,
            error: "Web Push サブスクリプションが設定されていません",
            sentAt: new Date().toISOString(),
          });
          break;
        }
        const result = await sendWebPush({
          subscription: config.subscription,
          title: `PACE 本日のアジェンダ（${teamName}）`,
          body: `アラート ${agenda.alertCount}件（クリティカル ${agenda.criticalCount}件）`,
          url: agendaUrl,
        });
        results.push(result);
        break;
      }
    }
  }

  // --- 6. 結果ログ ---
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  log.info(`チーム ${teamName}: 送信完了 (成功: ${successCount}, 失敗: ${failCount})`);

  return results;
}
