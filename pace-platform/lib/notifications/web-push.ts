/**
 * PACE Platform — Web Push 通知送信
 *
 * Web Push API を使用してブラウザにプッシュ通知を送信する。
 * VAPID キー（VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY）が必要。
 *
 * 現段階ではインフラストラクチャのみ整備。
 * Web Push を有効化するには VAPID キーの生成と設定が必要。
 */

import type { WebPushParams, NotificationResult } from "./types";

// ---------------------------------------------------------------------------
// Web Push 送信
// ---------------------------------------------------------------------------

/**
 * Web Push 通知を送信する。
 *
 * web-push npm パッケージを使用。VAPID キーが未設定の場合はスキップする。
 */
export async function sendWebPush(
  params: WebPushParams
): Promise<NotificationResult> {
  const now = new Date().toISOString();

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:noreply@pace.hachi.co.jp";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return {
      channel: "web_push",
      success: false,
      error: "VAPID キーが設定されていません。Web Push は現在無効です。",
      sentAt: now,
    };
  }

  try {
    // web-push パッケージの動的インポート（オプション依存）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleName = "web-push";
    const webpush = (await import(moduleName)) as {
      default?: {
        setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
        sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
      };
      setVapidDetails?: (subject: string, publicKey: string, privateKey: string) => void;
      sendNotification?: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
    };

    const wp = webpush.default ?? webpush;
    const setVapidDetails = wp.setVapidDetails;
    const sendNotification = wp.sendNotification;

    if (!setVapidDetails || !sendNotification) {
      throw new Error("web-push モジュールの読み込みに失敗しました");
    }

    setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title: params.title,
      body: params.body,
      icon: "/icons/pace-icon-192.png",
      badge: "/icons/pace-badge-72.png",
      data: {
        url: params.url,
      },
    });

    const subscription = {
      endpoint: params.subscription.endpoint,
      keys: {
        p256dh: params.subscription.keys.p256dh,
        auth: params.subscription.keys.auth,
      },
    };

    await sendNotification(subscription, payload);

    return {
      channel: "web_push",
      success: true,
      sentAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";

    // web-push パッケージが未インストールの場合
    if (message.includes("Cannot find module") || message.includes("MODULE_NOT_FOUND")) {
      return {
        channel: "web_push",
        success: false,
        error: "web-push パッケージがインストールされていません。npm install web-push を実行してください。",
        sentAt: now,
      };
    }

    return {
      channel: "web_push",
      success: false,
      error: message,
      sentAt: now,
    };
  }
}
