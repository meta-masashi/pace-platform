/**
 * PACE Platform — Slack 通知送信
 *
 * Incoming Webhook を使用して Slack チャネルにアジェンダ通知を送信する。
 * Slack Block Kit フォーマットを使用。
 */

import type { SlackNotificationParams, NotificationResult } from "./types";

// ---------------------------------------------------------------------------
// Slack Block Kit メッセージ構築
// ---------------------------------------------------------------------------

/**
 * Slack Block Kit メッセージペイロードを構築する。
 */
function buildSlackBlocks(params: SlackNotificationParams) {
  const { teamName, date, alertCount, criticalCount, agendaUrl } = params;

  const blocks: Record<string, unknown>[] = [
    // ヘッダー
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":clipboard: PACE 本日のアジェンダ",
        emoji: true,
      },
    },
    // チーム・日付情報
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*チーム:*\n${teamName}`,
        },
        {
          type: "mrkdwn",
          text: `*日付:*\n${date}`,
        },
      ],
    },
    // 区切り線
    { type: "divider" },
    // アラートサマリー
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*:warning: アラート件数:*\n${alertCount}件`,
        },
        {
          type: "mrkdwn",
          text: `*:rotating_light: クリティカル:*\n${criticalCount}件`,
        },
      ],
    },
  ];

  // クリティカルがある場合は警告メッセージを追加
  if (criticalCount > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:red_circle: *${criticalCount}名のアスリートに早急な確認が必要です。*`,
      },
    });
  }

  // CTA ボタン
  blocks.push(
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "ダッシュボードを開く",
            emoji: true,
          },
          url: agendaUrl,
          style: "primary",
          action_id: "open_dashboard",
        },
      ],
    }
  );

  // コンテキストフッター
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "PACE Platform から自動送信",
      },
    ],
  });

  return blocks;
}

// ---------------------------------------------------------------------------
// Slack 通知送信
// ---------------------------------------------------------------------------

/**
 * Slack Incoming Webhook を使用してアジェンダ通知を送信する。
 */
export async function sendSlackNotification(
  params: SlackNotificationParams
): Promise<NotificationResult> {
  const now = new Date().toISOString();

  try {
    const blocks = buildSlackBlocks(params);

    const response = await fetch(params.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `PACE 本日のアジェンダ: ${params.teamName}（${params.date}）- アラート ${params.alertCount}件`,
        blocks,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        channel: "slack",
        success: false,
        error: `Slack Webhook エラー: ${response.status} - ${body}`,
        sentAt: now,
      };
    }

    return {
      channel: "slack",
      success: true,
      sentAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return {
      channel: "slack",
      success: false,
      error: message,
      sentAt: now,
    };
  }
}
