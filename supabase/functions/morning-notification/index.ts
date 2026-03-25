/**
 * PACE Platform — 朝のアジェンダ通知 Edge Function
 *
 * Supabase Edge Function（Deno ランタイム）
 *
 * 6:30 AM JST に cron トリガーで実行される。
 * 全アクティブ組織のチームに対して朝のアジェンダ通知を生成・送信する。
 *
 * トリガー設定（supabase/config.toml）:
 * ```toml
 * [functions.morning-notification]
 * schedule = "30 21 * * *"  # 21:30 UTC = 6:30 JST
 * ```
 *
 * または外部スケジューラー（GitHub Actions cron など）から HTTP で呼び出す。
 */

// @ts-ignore: Deno imports
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore: Deno imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

serve(async (req: Request) => {
  try {
    // --- 認証（Bearer トークン） ---
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // cron トリガーまたは Service Role Key での認証を許可
    if (authHeader && serviceRoleKey) {
      const token = authHeader.replace("Bearer ", "");
      if (token !== serviceRoleKey) {
        return new Response(
          JSON.stringify({ error: "認証に失敗しました" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // --- Supabase クライアント（Service Role） ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- 全アクティブ組織のチームを取得 ---
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, org_id, organizations(is_active)")
      .eq("organizations.is_active", true);

    if (teamsError) {
      console.error("[morning-notification] チーム取得エラー:", teamsError);
      return new Response(
        JSON.stringify({ error: teamsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const activeTeams = (teams ?? []).filter(
      (t: Record<string, unknown>) => t.organizations !== null
    );

    // --- 各チームの通知を実行 ---
    const date = new Date().toISOString().split("T")[0]!;
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://pace.hachi.co.jp";
    const results: Array<{
      teamId: string;
      teamName: string;
      notifications: Array<{
        channel: string;
        success: boolean;
        error?: string;
      }>;
    }> = [];

    for (const team of activeTeams) {
      const teamId = team.id as string;
      const teamName = team.name as string;
      const orgId = team.org_id as string;

      // 通知プリファレンス取得
      const { data: preferences } = await supabase
        .from("notification_preferences")
        .select("*, staff(id, email, name, is_active)")
        .eq("org_id", orgId)
        .eq("enabled", true);

      if (!preferences || preferences.length === 0) {
        results.push({ teamId, teamName, notifications: [] });
        continue;
      }

      // アジェンダ生成
      let alertCount = 0;
      let criticalCount = 0;

      try {
        const agendaResponse = await fetch(
          `${siteUrl}/api/morning-agenda?teamId=${teamId}&date=${date}`,
          {
            headers: { Authorization: `Bearer ${supabaseKey}` },
          }
        );

        if (agendaResponse.ok) {
          const agendaData = await agendaResponse.json();
          if (agendaData.success) {
            alertCount =
              (agendaData.data?.teamSummary?.criticalCount ?? 0) +
              (agendaData.data?.teamSummary?.watchlistCount ?? 0);
            criticalCount = agendaData.data?.teamSummary?.criticalCount ?? 0;
          }
        }
      } catch (err) {
        console.error(`[morning-notification] アジェンダ生成エラー (${teamName}):`, err);
      }

      const agendaUrl = `${siteUrl}/dashboard?date=${date}`;
      const teamNotifications: Array<{
        channel: string;
        success: boolean;
        error?: string;
      }> = [];

      // チャネル別送信
      for (const pref of preferences) {
        const staff = pref.staff as Record<string, unknown> | null;
        if (!staff || !(staff.is_active as boolean)) continue;

        const config = (pref.config ?? {}) as Record<string, unknown>;

        switch (pref.channel) {
          case "email": {
            const to = (config.email as string) ?? (staff.email as string);
            try {
              const resendKey = Deno.env.get("RESEND_API_KEY");
              if (resendKey) {
                const emailRes = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${resendKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    from: Deno.env.get("RESEND_FROM_EMAIL") ?? "PACE <noreply@pace.hachi.co.jp>",
                    to: [to],
                    subject: `【PACE】本日のアジェンダが生成されました（${date}）`,
                    html: buildEmailHtml(teamName, date, alertCount, criticalCount, agendaUrl),
                  }),
                });
                teamNotifications.push({
                  channel: "email",
                  success: emailRes.ok,
                  error: emailRes.ok ? undefined : await emailRes.text(),
                });
              } else {
                teamNotifications.push({
                  channel: "email",
                  success: false,
                  error: "RESEND_API_KEY が未設定",
                });
              }
            } catch (err) {
              teamNotifications.push({
                channel: "email",
                success: false,
                error: err instanceof Error ? err.message : "不明なエラー",
              });
            }
            break;
          }

          case "slack": {
            const webhookUrl = config.webhookUrl as string;
            if (!webhookUrl) {
              teamNotifications.push({
                channel: "slack",
                success: false,
                error: "Webhook URL 未設定",
              });
              break;
            }
            try {
              const slackRes = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: `PACE 本日のアジェンダ: ${teamName}（${date}）- アラート ${alertCount}件`,
                  blocks: buildSlackBlocks(teamName, date, alertCount, criticalCount, agendaUrl),
                }),
              });
              teamNotifications.push({
                channel: "slack",
                success: slackRes.ok,
                error: slackRes.ok ? undefined : await slackRes.text(),
              });
            } catch (err) {
              teamNotifications.push({
                channel: "slack",
                success: false,
                error: err instanceof Error ? err.message : "不明なエラー",
              });
            }
            break;
          }

          case "web_push": {
            // Edge Function 内では Web Push は未サポート（VAPID 署名が必要）
            teamNotifications.push({
              channel: "web_push",
              success: false,
              error: "Edge Function からの Web Push は未サポートです",
            });
            break;
          }
        }
      }

      results.push({ teamId, teamName, notifications: teamNotifications });
    }

    // --- 結果ログ ---
    const totalSent = results.reduce(
      (sum, r) => sum + r.notifications.filter((n) => n.success).length,
      0
    );
    const totalFailed = results.reduce(
      (sum, r) => sum + r.notifications.filter((n) => !n.success).length,
      0
    );

    console.log(
      `[morning-notification] 完了: ${activeTeams.length}チーム, 成功: ${totalSent}, 失敗: ${totalFailed}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        teamsProcessed: activeTeams.length,
        totalSent,
        totalFailed,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[morning-notification] 予期しないエラー:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "不明なエラー",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// ---------------------------------------------------------------------------
// ヘルパー: メール HTML テンプレート（簡易版）
// ---------------------------------------------------------------------------

function buildEmailHtml(
  teamName: string,
  date: string,
  alertCount: number,
  criticalCount: number,
  agendaUrl: string
): string {
  const criticalHtml =
    criticalCount > 0
      ? `<p style="margin:8px 0;padding:8px 12px;background:#fef2f2;border-left:4px solid #dc2626;color:#991b1b;font-size:14px;">&#9888; クリティカルアラート: ${criticalCount}件</p>`
      : "";

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:24px 20px;background:#059669;text-align:center;">
<h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:2px;">PACE</h1>
<p style="margin:6px 0 0;font-size:13px;color:#d1fae5;">本日のアジェンダ</p>
</td></tr>
<tr><td style="padding:20px 20px 8px;">
<p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${teamName}</p>
<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${date}</p>
</td></tr>
<tr><td style="padding:0 20px;">${criticalHtml}</td></tr>
<tr><td style="padding:16px 20px;text-align:center;">
<p style="margin:0;font-size:28px;font-weight:700;color:#059669;">${alertCount}</p>
<p style="margin:4px 0 0;font-size:12px;color:#065f46;">アラート件数</p>
</td></tr>
<tr><td style="padding:8px 20px 24px;text-align:center;">
<a href="${agendaUrl}" style="display:inline-block;padding:12px 32px;background:#059669;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">ダッシュボードを開く</a>
</td></tr>
<tr><td style="padding:16px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0;font-size:11px;color:#9ca3af;">PACE Platform から自動送信</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// ヘルパー: Slack Block Kit
// ---------------------------------------------------------------------------

function buildSlackBlocks(
  teamName: string,
  date: string,
  alertCount: number,
  criticalCount: number,
  agendaUrl: string
) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: ":clipboard: PACE 本日のアジェンダ", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*チーム:*\n${teamName}` },
        { type: "mrkdwn", text: `*日付:*\n${date}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*:warning: アラート件数:*\n${alertCount}件` },
        { type: "mrkdwn", text: `*:rotating_light: クリティカル:*\n${criticalCount}件` },
      ],
    },
  ];

  if (criticalCount > 0) {
    blocks.push({
      type: "section",
      fields: [],
      // @ts-ignore: text property for section
      text: { type: "mrkdwn", text: `:red_circle: *${criticalCount}名のアスリートに早急な確認が必要です。*` },
    });
  }

  blocks.push(
    { type: "divider", fields: [], text: undefined as never },
    {
      type: "actions",
      // @ts-ignore: elements property for actions
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "ダッシュボードを開く", emoji: true },
          url: agendaUrl,
          style: "primary",
          action_id: "open_dashboard",
        },
      ],
    } as never
  );

  return blocks;
}
