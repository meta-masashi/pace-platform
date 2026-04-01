'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DeviceProvider } from '@/lib/s2s/types';
import { PROVIDER_LABELS } from '@/lib/s2s/types';
import type { CalendarSyncStatus } from '@/lib/calendar/types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CredentialInfo {
  id: string;
  provider: DeviceProvider;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface ExternalMapping {
  id: string;
  athleteId: string;
  athleteName: string;
  provider: string;
  externalId: string;
}

// ---------------------------------------------------------------------------
// プロバイダー情報
// ---------------------------------------------------------------------------

const PROVIDERS: Array<{
  key: DeviceProvider;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    key: 'catapult',
    label: 'Catapult Sports',
    description: 'PlayerLoad, GPS, 加速度データを自動連携',
    icon: 'C',
  },
  {
    key: 'kinexon',
    label: 'Kinexon',
    description: 'リアルタイム位置追跡・パフォーマンスデータ',
    icon: 'K',
  },
  {
    key: 'statsports',
    label: 'STATSports',
    description: 'GPS・HRデータの自動取り込み',
    icon: 'S',
  },
  {
    key: 'polar',
    label: 'Polar',
    description: '心拍数・HRV・トレーニング負荷データ',
    icon: 'P',
  },
  {
    key: 'garmin',
    label: 'Garmin',
    description: 'ウェアラブルデバイスからのHR・HRV連携',
    icon: 'G',
  },
  {
    key: 'custom',
    label: 'カスタム',
    description: '独自システムとのAPI連携',
    icon: '+',
  },
];

// ---------------------------------------------------------------------------
// インテグレーション設定ページ
// ---------------------------------------------------------------------------

export default function IntegrationSettingsPage() {
  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<DeviceProvider | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [newKeyProvider, setNewKeyProvider] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Google Calendar 状態
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>('disconnected');
  const [calendarCalendarId, setCalendarCalendarId] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  // --- 資格情報取得 ---
  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/s2s/credentials');
      const json = await res.json();

      if (!json.success) {
        if (res.status === 403) {
          setError('この操作には master 権限が必要です。');
        } else {
          setError(json.error || '資格情報の取得に失敗しました。');
        }
        return;
      }

      setCredentials(json.data.credentials as CredentialInfo[]);
      setError(null);
    } catch (err) { void err; // silently handled
      setError('資格情報の取得中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Google Calendar 状態を取得
  const fetchCalendarStatus = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const res = await fetch('/api/calendar/connect?status=1');
      const json = (await res.json()) as {
        success: boolean;
        data?: { status: CalendarSyncStatus; calendarId?: string };
      };
      if (json.success && json.data) {
        setCalendarStatus(json.data.status);
        setCalendarCalendarId(json.data.calendarId ?? null);
      }
    } catch (err) { void err; // silently handled
      setCalendarStatus('error');
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendarStatus();
  }, [fetchCalendarStatus]);

  // Google Calendar 接続
  const handleConnectCalendar = useCallback(async () => {
    setConnectingCalendar(true);
    try {
      const res = await fetch('/api/calendar/connect');
      const json = (await res.json()) as {
        success: boolean;
        data?: { authUrl: string };
        error?: string;
      };
      if (!json.success || !json.data?.authUrl) {
        setError(json.error ?? 'Google Calendar 接続 URL の取得に失敗しました。');
        return;
      }
      window.location.href = json.data.authUrl;
    } catch (err) { void err; // silently handled
      setError('Google Calendar 接続中にエラーが発生しました。');
    } finally {
      setConnectingCalendar(false);
    }
  }, []);

  // Google Calendar 切断
  const handleDisconnectCalendar = useCallback(async () => {
    setDisconnectingCalendar(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/connect', { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? 'Google Calendar の切断に失敗しました。');
        return;
      }
      setCalendarStatus('disconnected');
      setCalendarCalendarId(null);
      setSuccessMessage('Google Calendar の連携を解除しました。');
    } catch (err) { void err; // silently handled
      setError('Google Calendar 切断中にエラーが発生しました。');
    } finally {
      setDisconnectingCalendar(false);
    }
  }, []);

  // --- APIキー生成 ---
  const handleGenerateKey = async (provider: DeviceProvider) => {
    setGeneratingKey(provider);
    setNewApiKey(null);
    setNewKeyProvider(null);
    setError(null);

    try {
      const res = await fetch('/api/s2s/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || 'APIキーの生成に失敗しました。');
        return;
      }

      setNewApiKey(json.data.apiKey as string);
      setNewKeyProvider(provider);
      setSuccessMessage('APIキーを生成しました。このキーは一度だけ表示されます。');
      await fetchCredentials();
    } catch (err) { void err; // silently handled
      setError('APIキーの生成中にエラーが発生しました。');
    } finally {
      setGeneratingKey(null);
    }
  };

  // --- APIキー無効化 ---
  const handleRevokeKey = async (credentialId: string) => {
    setRevoking(credentialId);
    setError(null);

    try {
      const res = await fetch('/api/s2s/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error || '無効化に失敗しました。');
        return;
      }

      setSuccessMessage('APIキーを無効化しました。');
      await fetchCredentials();
    } catch (err) { void err; // silently handled
      setError('無効化中にエラーが発生しました。');
    } finally {
      setRevoking(null);
    }
  };

  // --- クリップボードコピー ---
  const handleCopyKey = async () => {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      setSuccessMessage('APIキーをクリップボードにコピーしました。');
    } catch (err) { void err; // silently handled
      // フォールバック
    }
  };

  // --- アクティブな資格情報の取得 ---
  const getCredentialForProvider = (provider: DeviceProvider) =>
    credentials.find((c) => c.provider === provider && c.isActive);

  // --- 成功メッセージの自動クリア ---
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // --- レンダリング ---
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          外部デバイス連携
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GPS・ウェアラブルデバイスのデータを自動取り込みするための
          S2S（Server-to-Server）API 設定を管理します。
        </p>
      </div>

      {/* 通知バナー */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
          <p className="text-sm text-green-700 dark:text-green-400">
            {successMessage}
          </p>
        </div>
      )}

      {/* 新しいAPIキー表示 */}
      {newApiKey && (
        <div className="rounded-lg border-2 border-amber-500 bg-amber-50 p-6 dark:bg-amber-950/30">
          <h3 className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
            新しいAPIキー（{newKeyProvider ? PROVIDER_LABELS[newKeyProvider as DeviceProvider] : ''}）
          </h3>
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
            このキーは一度だけ表示されます。安全な場所に保管してください。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-amber-100 px-3 py-2 text-sm font-mono dark:bg-amber-900/50">
              {newApiKey}
            </code>
            <button
              onClick={handleCopyKey}
              className="shrink-0 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              コピー
            </button>
          </div>
          <button
            onClick={() => {
              setNewApiKey(null);
              setNewKeyProvider(null);
            }}
            className="mt-3 text-sm text-amber-600 underline hover:text-amber-800"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Google Calendar 連携（M15） */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-xl font-bold text-red-600">
              G
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Google Calendar
              </h2>
              <p className="text-sm text-muted-foreground">
                チームスケジュール（試合・高強度練習・リカバリー）を同期して負荷予測オーバーレイを表示
              </p>
            </div>
          </div>

          {calendarLoading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          ) : calendarStatus === 'connected' ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                接続済み
              </span>
              <button
                type="button"
                onClick={handleDisconnectCalendar}
                disabled={disconnectingCalendar}
                className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {disconnectingCalendar ? '切断中...' : '切断'}
              </button>
            </div>
          ) : calendarStatus === 'expired' ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                期限切れ
              </span>
              <button
                type="button"
                onClick={handleConnectCalendar}
                disabled={connectingCalendar}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {connectingCalendar ? '接続中...' : '再接続'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectCalendar}
              disabled={connectingCalendar}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {connectingCalendar ? '接続中...' : 'Google アカウントで接続'}
            </button>
          )}
        </div>

        {calendarStatus === 'connected' && calendarCalendarId && (
          <p className="mt-3 text-xs text-muted-foreground">
            同期カレンダー: <span className="font-mono">{calendarCalendarId}</span>
          </p>
        )}

        {calendarStatus === 'expired' && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">
              ⚠️ アクセストークンの期限が切れています。再接続してスケジュール同期を再開してください。
            </p>
          </div>
        )}
      </div>

      {/* プロバイダー一覧 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          サポート対象プロバイダー
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-border bg-card"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((provider) => {
              const credential = getCredentialForProvider(provider.key);
              const isGenerating = generatingKey === provider.key;
              const isRevoking =
                credential && revoking === credential.id;

              return (
                <div
                  key={provider.key}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    {/* プロバイダーアイコン */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">
                        {provider.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {credential ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          接続済み
                        </span>
                        <button
                          onClick={() => handleRevokeKey(credential.id)}
                          disabled={!!isRevoking}
                          className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          {isRevoking ? '処理中...' : '無効化'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateKey(provider.key)}
                        disabled={!!isGenerating}
                        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isGenerating ? '生成中...' : 'APIキーを生成'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* API仕様ガイド */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          API 連携ガイド
        </h2>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div>
            <h3 className="mb-1 font-medium text-foreground">
              エンドポイント
            </h3>
            <code className="rounded bg-muted px-2 py-1 text-xs">
              POST /api/s2s/ingest
            </code>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-foreground">認証</h3>
            <p>
              Authorization ヘッダーに Bearer トークンとして API キーを指定してください。
            </p>
            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
              Authorization: Bearer pace_s2s_xxxx...
            </code>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-foreground">
              リクエストボディ例
            </h3>
            <pre className="mt-1 overflow-x-auto rounded bg-muted p-3 text-xs">
{`{
  "provider": "catapult",
  "teamId": "team-001",
  "timestamp": "2026-03-25T10:00:00Z",
  "athletes": [
    {
      "externalId": "CAT-001",
      "name": "田中 太郎",
      "metrics": {
        "playerLoad": 450,
        "totalDistance": 8500,
        "highSpeedDistance": 1200,
        "heartRateAvg": 155,
        "hrv": 62
      }
    }
  ]
}`}
            </pre>
          </div>

          <div>
            <h3 className="mb-1 font-medium text-foreground">
              レートリミット
            </h3>
            <p>
              APIキーあたり 1時間に最大100リクエストまで送信可能です。
            </p>
          </div>
        </div>
      </div>

      {/* アスリートマッピングセクション */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          アスリートID マッピング
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          外部デバイスのアスリートIDと内部の選手情報を紐づけます。
          名前による自動マッチングも利用可能ですが、外部IDの事前登録を推奨します。
        </p>

        <AthleteMapping />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// アスリートマッピングコンポーネント
// ---------------------------------------------------------------------------

function AthleteMapping() {
  const [mappings, setMappings] = useState<ExternalMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formAthleteId, setFormAthleteId] = useState('');
  const [formProvider, setFormProvider] = useState<DeviceProvider>('catapult');
  const [formExternalId, setFormExternalId] = useState('');

  // 現時点ではプレースホルダー
  // 完全な CRUD は将来のスプリントで実装

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="h-16 animate-pulse rounded bg-muted" />
      ) : mappings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            マッピングが登録されていません。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            S2S データ送信時に選手名による自動マッチングが試行されます。
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {mappings.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-foreground">
                  {m.athleteName}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.provider}: {m.externalId}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        手動マッピングの登録機能は今後のアップデートで追加予定です。
        現在は S2S データ送信時の name フィールドによる自動マッチングをご利用ください。
      </p>
    </div>
  );
}
