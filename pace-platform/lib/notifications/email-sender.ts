/**
 * PACE Platform — 朝のアジェンダメール送信
 *
 * Resend API（RESEND_API_KEY が設定されている場合）または
 * Supabase の組み込みメール送信を使用してメールを送信する。
 */

import type { MorningEmailParams, NotificationResult } from "./types";

// ---------------------------------------------------------------------------
// メールテンプレート
// ---------------------------------------------------------------------------

/**
 * 朝のアジェンダメールの HTML テンプレートを生成する。
 *
 * メールクライアント互換性のためインライン CSS を使用。
 */
function buildEmailHtml(params: MorningEmailParams): string {
  const { teamName, date, alertCount, criticalCount, agendaUrl } = params;

  const criticalSection =
    criticalCount > 0
      ? `
        <tr>
          <td style="padding: 12px 20px; background-color: #fef2f2; border-left: 4px solid #dc2626;">
            <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 600;">
              &#9888; クリティカルアラート: ${criticalCount}件
            </p>
            <p style="margin: 4px 0 0; font-size: 13px; color: #b91c1c;">
              早急な確認が必要なアスリートがいます。
            </p>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PACE 本日のアジェンダ</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- ヘッダー -->
          <tr>
            <td style="padding: 24px 20px; background-color: #059669; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 2px;">PACE</h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #d1fae5;">本日のアジェンダ</p>
            </td>
          </tr>

          <!-- チーム名・日付 -->
          <tr>
            <td style="padding: 20px 20px 8px;">
              <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">${teamName}</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${date}</p>
            </td>
          </tr>

          <!-- クリティカルアラート -->
          ${criticalSection}

          <!-- サマリー -->
          <tr>
            <td style="padding: 16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 12px; background-color: #f0fdf4; border-radius: 6px; text-align: center;">
                    <p style="margin: 0; font-size: 28px; font-weight: 700; color: #059669;">${alertCount}</p>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #065f46;">アラート件数</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA ボタン -->
          <tr>
            <td style="padding: 8px 20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${agendaUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 32px; background-color: #059669; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                      ダッシュボードを開く
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- フッター -->
          <tr>
            <td style="padding: 16px 20px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                このメールは PACE Platform から自動送信されています。
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// メール送信
// ---------------------------------------------------------------------------

/**
 * 朝のアジェンダメールを送信する。
 *
 * RESEND_API_KEY が設定されている場合は Resend API を使用。
 * それ以外は Supabase の Edge Function 経由でメールを送信する。
 */
export async function sendMorningEmail(
  params: MorningEmailParams
): Promise<NotificationResult> {
  const now = new Date().toISOString();

  try {
    const html = buildEmailHtml(params);
    const subject = `【PACE】本日のアジェンダが生成されました（${params.date}）`;

    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey) {
      return await sendViaResend(resendApiKey, params.to, subject, html, now);
    }

    return await sendViaSupabase(params.to, subject, html, now);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return {
      channel: "email",
      success: false,
      error: message,
      sentAt: now,
    };
  }
}

// ---------------------------------------------------------------------------
// Resend API 送信
// ---------------------------------------------------------------------------

async function sendViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  sentAt: string
): Promise<NotificationResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "PACE <noreply@hachi-riskon.com>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      channel: "email",
      success: false,
      error: `Resend API エラー: ${response.status} - ${body}`,
      sentAt,
    };
  }

  return {
    channel: "email",
    success: true,
    sentAt,
  };
}

// ---------------------------------------------------------------------------
// Supabase Edge Function 経由送信
// ---------------------------------------------------------------------------

async function sendViaSupabase(
  to: string,
  subject: string,
  html: string,
  sentAt: string
): Promise<NotificationResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      channel: "email",
      success: false,
      error: "Supabase 環境変数が設定されていません。",
      sentAt,
    };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      channel: "email",
      success: false,
      error: `Supabase メール送信エラー: ${response.status} - ${body}`,
      sentAt,
    };
  }

  return {
    channel: "email",
    success: true,
    sentAt,
  };
}
