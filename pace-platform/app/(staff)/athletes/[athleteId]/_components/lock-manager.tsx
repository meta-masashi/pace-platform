'use client';

/**
 * PACE Platform — ロック管理コンポーネント
 *
 * アスリートの Hard Lock / Soft Lock の表示・設定・解除を行う。
 * - Hard Lock: master のみ設定・解除可能（赤色）
 * - Soft Lock: AT/PT/master が設定・解除可能（アンバー色）
 */

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface LockData {
  id: string;
  athlete_id: string;
  set_by_staff_id: string;
  lock_type: 'hard' | 'soft';
  tag: string;
  reason: string;
  set_at: string;
  expires_at: string | null;
}

interface LockManagerProps {
  athleteId: string;
}

const LOCK_TAGS = [
  { value: 'injury', label: '傷害' },
  { value: 'medical', label: '医療' },
  { value: 'disciplinary', label: '懲戒' },
  { value: 'other', label: 'その他' },
];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function LockManager({ athleteId }: LockManagerProps) {
  const [currentLock, setCurrentLock] = useState<LockData | null>(null);
  const [lockHistory, setLockHistory] = useState<LockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // モーダル状態
  const [showModal, setShowModal] = useState(false);
  const [lockType, setLockType] = useState<'hard' | 'soft'>('soft');
  const [reason, setReason] = useState('');
  const [tag, setTag] = useState('injury');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  /**
   * ロック状態を取得する
   */
  const fetchLocks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/locks?athleteId=${encodeURIComponent(athleteId)}`
      );
      const json = await res.json();

      if (json.success) {
        const locks = (Array.isArray(json.data) ? json.data : json.data?.locks ?? []) as LockData[];
        // 現在有効なロックを特定（expires_at が null または未来）
        const now = new Date();
        const active = locks.find(
          (l) =>
            !l.expires_at || new Date(l.expires_at) > now
        );
        setCurrentLock(active ?? null);
        setLockHistory(locks.slice(0, 5));
      }
    } catch (err) { void err; // silently handled
      // ロック取得失敗は致命的ではない
      console.warn('[lock-manager] ロック状態の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    fetchLocks();
  }, [fetchLocks]);

  /**
   * ロックを設定する
   */
  const handleSetLock = async () => {
    if (!reason.trim()) {
      setError('理由を入力してください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteId,
          lockType,
          tag,
          reason: reason.trim(),
          expiresAt: lockType === 'soft' && expiresAt ? expiresAt : null,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'ロックの設定に失敗しました。');
        return;
      }

      setShowModal(false);
      setReason('');
      setTag('injury');
      setExpiresAt('');
      await fetchLocks();
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * ロックを解除する
   */
  const handleUnlock = async () => {
    if (!currentLock) return;

    setUnlocking(true);
    setError(null);

    try {
      const res = await fetch('/api/locks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockId: currentLock.id }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'ロック解除に失敗しました。');
        return;
      }

      await fetchLocks();
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 現在のロック状態 */}
      {currentLock ? (
        <div
          className={`rounded-lg border-2 p-4 ${
            currentLock.lock_type === 'hard'
              ? 'border-critical-300 bg-critical-50'
              : 'border-watchlist-300 bg-watchlist-50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {/* ロックアイコン */}
              <div
                className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                  currentLock.lock_type === 'hard'
                    ? 'bg-critical-200 text-critical-700'
                    : 'bg-watchlist-200 text-watchlist-700'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      currentLock.lock_type === 'hard'
                        ? 'bg-critical-200 text-critical-800'
                        : 'bg-watchlist-200 text-watchlist-800'
                    }`}
                  >
                    {currentLock.lock_type === 'hard' ? 'Hard Lock' : 'Soft Lock'}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {LOCK_TAGS.find((t) => t.value === currentLock.tag)?.label ??
                      currentLock.tag}
                  </span>
                </div>
                <p
                  className={`mt-1 text-sm ${
                    currentLock.lock_type === 'hard'
                      ? 'text-critical-700'
                      : 'text-watchlist-700'
                  }`}
                >
                  {currentLock.reason}
                </p>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>
                    設定日時: {new Date(currentLock.set_at).toLocaleString('ja-JP')}
                  </span>
                  {currentLock.expires_at && (
                    <span>
                      期限: {new Date(currentLock.expires_at).toLocaleString('ja-JP')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                currentLock.lock_type === 'hard'
                  ? 'bg-critical-600 hover:bg-critical-700'
                  : 'bg-watchlist-600 hover:bg-watchlist-700'
              }`}
            >
              {unlocking ? 'ロック解除中...' : 'ロック解除'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-optimal-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
                <line x1="3" y1="15" x2="5" y2="13" />
              </svg>
              <span className="text-sm text-optimal-600 font-medium">
                ロックなし — 活動許可状態
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
            >
              ロック設定
            </button>
          </div>
        </div>
      )}

      {/* ロック設定ボタン（現在ロックがある場合も追加設定可能） */}
      {currentLock && (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          新しいロックを設定
        </button>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* ロック履歴 */}
      {lockHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            ロック履歴（直近5件）
          </h4>
          <div className="space-y-2">
            {lockHistory.map((lock) => (
              <div
                key={lock.id}
                className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      lock.lock_type === 'hard'
                        ? 'bg-critical-400'
                        : 'bg-watchlist-400'
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {new Date(lock.set_at).toLocaleDateString('ja-JP')}
                  </span>
                  <span className="text-xs text-foreground">
                    {lock.lock_type === 'hard' ? 'Hard' : 'Soft'} —{' '}
                    {lock.reason.length > 30
                      ? `${lock.reason.slice(0, 30)}...`
                      : lock.reason}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {LOCK_TAGS.find((t) => t.value === lock.tag)?.label ?? lock.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ロック設定モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                ロック設定
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* ロックタイプ */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  ロックタイプ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLockType('hard')}
                    className={`rounded-lg border-2 p-3 text-center text-sm transition-colors ${
                      lockType === 'hard'
                        ? 'border-critical-400 bg-critical-50 text-critical-700'
                        : 'border-border text-muted-foreground hover:border-critical-300'
                    }`}
                  >
                    <span className="block font-semibold">Hard Lock</span>
                    <span className="block text-xs mt-1">完全免荷・活動停止</span>
                    <span className="block text-xs mt-0.5 opacity-70">master のみ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLockType('soft')}
                    className={`rounded-lg border-2 p-3 text-center text-sm transition-colors ${
                      lockType === 'soft'
                        ? 'border-watchlist-400 bg-watchlist-50 text-watchlist-700'
                        : 'border-border text-muted-foreground hover:border-watchlist-300'
                    }`}
                  >
                    <span className="block font-semibold">Soft Lock</span>
                    <span className="block text-xs mt-1">制限付き活動許可</span>
                    <span className="block text-xs mt-0.5 opacity-70">AT/PT/master</span>
                  </button>
                </div>
              </div>

              {/* タグ */}
              <div className="space-y-2">
                <label
                  htmlFor="lock-tag"
                  className="text-sm font-medium text-foreground"
                >
                  タグ
                </label>
                <select
                  id="lock-tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {LOCK_TAGS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 理由 */}
              <div className="space-y-2">
                <label
                  htmlFor="lock-reason"
                  className="text-sm font-medium text-foreground"
                >
                  理由 <span className="text-critical-500">*</span>
                </label>
                <textarea
                  id="lock-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ロック設定の理由を入力してください"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              {/* 期限（Soft Lock のみ） */}
              {lockType === 'soft' && (
                <div className="space-y-2">
                  <label
                    htmlFor="lock-expires"
                    className="text-sm font-medium text-foreground"
                  >
                    期限（任意）
                  </label>
                  <input
                    id="lock-expires"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    期限が設定されない場合、手動で解除するまで有効です。
                  </p>
                </div>
              )}

              {/* エラー表示 */}
              {error && (
                <div className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2">
                  <p className="text-sm text-critical-700">{error}</p>
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setError(null);
                  }}
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSetLock}
                  disabled={submitting || !reason.trim()}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                    lockType === 'hard'
                      ? 'bg-critical-600 hover:bg-critical-700'
                      : 'bg-watchlist-600 hover:bg-watchlist-700'
                  }`}
                >
                  {submitting ? '設定中...' : 'ロック設定'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
