'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// チームコード���理画面（master向け）
// ---------------------------------------------------------------------------

interface TeamCode {
  id: string;
  code: string;
  expires_at: string;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

export default function TeamCodesPage() {
  const [codes, setCodes] = useState<TeamCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // モーダルフォーム状態
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [maxUses, setMaxUses] = useState<string>('');

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // モックデータ（API接続まではプレースホルダー）
      await new Promise((r) => setTimeout(r, 500));
      setCodes([
        { id: '1', code: 'ABCD1234', expires_at: '2026-04-11T00:00:00Z', max_uses: null, current_uses: 5, is_active: true, created_at: '2026-04-04T00:00:00Z' },
        { id: '2', code: 'EFGH5678', expires_at: '2026-04-08T00:00:00Z', max_uses: 10, current_uses: 8, is_active: true, created_at: '2026-04-01T00:00:00Z' },
        { id: '3', code: 'IJKL9012', expires_at: '2026-03-30T00:00:00Z', max_uses: 5, current_uses: 5, is_active: false, created_at: '2026-03-23T00:00:00Z' },
      ]);
    } catch {
      setError('コード一覧の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/team-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_in_days: expiresInDays,
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'コードの生成に失敗しました。');
        return;
      }
      setShowModal(false);
      setExpiresInDays(7);
      setMaxUses('');
      await fetchCodes();
    } catch {
      setError('コードの生成中にエラーが発生しました。');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeactivate(codeId: string) {
    setDeactivating(codeId);
    try {
      const res = await fetch(`/api/admin/team-codes/${codeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'コードの無効化に失敗しました。');
        return;
      }
      await fetchCodes();
    } catch {
      setError('コードの無効化中にエラーが発生しました。');
    } finally {
      setDeactivating(null);
    }
  }

  function getStatusLabel(code: TeamCode): { label: string; className: string } {
    if (!code.is_active) return { label: '無効', className: 'bg-slate-100 text-slate-500' };
    const expired = new Date(code.expires_at) < new Date();
    if (expired) return { label: '期限切れ', className: 'bg-red-50 text-red-600' };
    if (code.max_uses !== null && code.current_uses >= code.max_uses) return { label: '上限到達', className: 'bg-amber-50 text-amber-600' };
    return { label: '有効', className: 'bg-emerald-50 text-emerald-700' };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">チームコード管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            選手がチームに参加するためのコードを管理します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          新規コード生成
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 font-medium underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-4">
              <div className="flex gap-4">
                <div className="h-5 w-24 rounded bg-muted" />
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-5 w-20 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* コード一覧 */}
      {!loading && codes.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            まだチームコードが生成されていません。
          </p>
        </div>
      )}

      {!loading && codes.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">コード</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">有効期限</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">使用回数</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">ステータス</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const status = getStatusLabel(code);
                return (
                  <tr key={code.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-sm font-medium tracking-wider text-foreground">
                      {code.code}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(code.expires_at).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {code.current_uses} / {code.max_uses ?? '\u221e'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {code.is_active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(code.id)}
                          disabled={deactivating === code.id}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deactivating === code.id ? '無効化中...' : '無効化'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新規生成モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">チームコード生成</h2>
            <p className="mt-1 text-sm text-gray-500">
              選手がチームに参加するためのコードを生成します。
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="expires-days" className="block text-sm font-medium text-gray-700">
                  有効期限（日数）
                </label>
                <input
                  id="expires-days"
                  type="number"
                  min="1"
                  max="90"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 7)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="max-uses" className="block text-sm font-medium text-gray-700">
                  使用回数上限（空欄 = 無制限）
                </label>
                <input
                  id="max-uses"
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="無制限"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? '生成中...' : 'コードを生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
