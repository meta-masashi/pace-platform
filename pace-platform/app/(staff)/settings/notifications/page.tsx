'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface NotificationPreference {
  id: string;
  staff_id: string;
  org_id: string;
  channel: 'email' | 'slack' | 'web_push';
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PreferencesResponse {
  email: string;
  preferences: NotificationPreference[];
}

// ---------------------------------------------------------------------------
// 通知設定ページ
// ---------------------------------------------------------------------------

export default function NotificationSettingsPage() {
  const [staffEmail, setStaffEmail] = useState('');
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Slack Webhook URL（ローカル入力状態）
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');

  // --- データ取得 ---
  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/preferences');
      if (!res.ok) throw new Error('設定の取得に失敗しました');
      const data: PreferencesResponse = await res.json();
      setStaffEmail(data.email);
      setPreferences(data.preferences);

      // Slack Webhook URL をローカル状態にセット
      const slackPref = data.preferences.find((p) => p.channel === 'slack');
      if (slackPref?.config?.webhookUrl) {
        setSlackWebhookUrl(slackPref.config.webhookUrl as string);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // --- チャネル有効状態を取得 ---
  function isChannelEnabled(channel: string): boolean {
    const pref = preferences.find((p) => p.channel === channel);
    return pref?.enabled ?? false;
  }

  // --- トグル更新 ---
  async function toggleChannel(
    channel: 'email' | 'slack' | 'web_push',
    enabled: boolean,
    config?: Record<string, unknown>
  ) {
    setSaving(channel);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, enabled, config }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '設定の保存に失敗しました');
      }

      const data = await res.json();

      // ローカル状態を更新
      setPreferences((prev) => {
        const filtered = prev.filter((p) => p.channel !== channel);
        return [...filtered, data.preference];
      });

      setSuccessMessage('設定を保存しました');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました');
    } finally {
      setSaving(null);
    }
  }

  // --- Slack 設定保存 ---
  async function saveSlackConfig() {
    await toggleChannel('slack', isChannelEnabled('slack'), {
      webhookUrl: slackWebhookUrl,
    });
  }

  // --- Web Push 許可リクエスト ---
  async function requestWebPushPermission() {
    if (!('Notification' in window)) {
      setError('このブラウザは Web Push 通知に対応していません。');
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      setError('通知の許可が拒否されました。ブラウザの設定から許可してください。');
      return;
    }

    // Service Worker からサブスクリプションを取得
    try {
      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      const subscriptionJSON = subscription.toJSON();

      await toggleChannel('web_push', true, {
        subscription: {
          endpoint: subscriptionJSON.endpoint,
          keys: subscriptionJSON.keys,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Web Push のサブスクリプション取得に失敗しました。'
      );
    }
  }

  // --- ローディング表示 ---
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">通知設定</h1>
        <p className="mt-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">通知設定</h1>
        <p className="mt-1 text-sm text-gray-500">
          朝のアジェンダ通知（6:30 AM）の配信チャネルを設定します。
        </p>
      </div>

      {/* 成功メッセージ */}
      {successMessage && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* メール通知 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              メール通知
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              アジェンダをメールで受信します。
            </p>
            <p className="mt-2 text-xs text-gray-400">
              送信先: {staffEmail}
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isChannelEnabled('email')}
              onChange={(e) => toggleChannel('email', e.target.checked)}
              disabled={saving === 'email'}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 peer-disabled:opacity-50" />
          </label>
        </div>
      </div>

      {/* Slack 通知 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Slack 通知
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              アジェンダを Slack チャネルに送信します。
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isChannelEnabled('slack')}
              onChange={(e) =>
                toggleChannel('slack', e.target.checked, {
                  webhookUrl: slackWebhookUrl,
                })
              }
              disabled={saving === 'slack'}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 peer-disabled:opacity-50" />
          </label>
        </div>

        {/* Slack Webhook URL 入力 */}
        {isChannelEnabled('slack') && (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="slack-webhook"
                className="block text-sm font-medium text-gray-700"
              >
                Incoming Webhook URL
              </label>
              <input
                id="slack-webhook"
                type="url"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Slack App の Incoming Webhook URL を入力してください。
              </p>
            </div>
            <button
              type="button"
              onClick={saveSlackConfig}
              disabled={saving === 'slack'}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === 'slack' ? '保存中...' : '保存'}
            </button>
          </div>
        )}
      </div>

      {/* Web Push 通知 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Web Push 通知
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              ブラウザのプッシュ通知でアジェンダを受信します。
            </p>
            <p className="mt-2 text-xs text-gray-400">
              VAPID キーの設定が必要です（オプション機能）
            </p>
          </div>
          {isChannelEnabled('web_push') ? (
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={true}
                onChange={() => toggleChannel('web_push', false)}
                disabled={saving === 'web_push'}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 peer-disabled:opacity-50" />
            </label>
          ) : (
            <button
              type="button"
              onClick={requestWebPushPermission}
              disabled={saving === 'web_push'}
              className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === 'web_push' ? '設定中...' : '通知を許可する'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
