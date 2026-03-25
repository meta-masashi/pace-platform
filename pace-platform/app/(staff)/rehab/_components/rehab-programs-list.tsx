'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RehabProgram {
  id: string;
  athlete_id: string;
  diagnosis_code: string | null;
  current_phase: number;
  start_date: string;
  estimated_rtp_date: string | null;
  status: string;
  athletes: {
    id: string;
    name: string;
    position: string | null;
    number: number | null;
  };
}

interface RehabProgramsListProps {
  searchParamsPromise: Promise<{ status?: string }>;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'on_hold';

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * リハビリプログラム一覧コンポーネント
 *
 * フィルター・テーブル表示・新規作成ボタンを含む。
 */
export function RehabProgramsList({ searchParamsPromise }: RehabProgramsListProps) {
  const searchParams = use(searchParamsPromise);
  const [programs, setPrograms] = useState<RehabProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.status as StatusFilter) ?? 'active'
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchPrograms() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') {
          params.set('status', statusFilter);
        }
        const res = await fetch(`/api/rehab/programs?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setPrograms(json.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '取得に失敗しました');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrograms();
    return () => { cancelled = true; };
  }, [statusFilter]);

  /** ステータスバッジの色 */
  const statusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'completed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'on_hold':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  /** ステータスラベル */
  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return '進行中';
      case 'completed': return '完了';
      case 'on_hold': return '保留';
      default: return status;
    }
  };

  return (
    <div className="space-y-4">
      {/* フィルター + 新規作成 */}
      <div className="flex flex-wrap items-center gap-3">
        {(['all', 'active', 'completed', 'on_hold'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === f
                ? 'bg-emerald-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? '全て' : f === 'active' ? '進行中' : f === 'completed' ? '完了' : '保留'}
          </button>
        ))}
        <div className="flex-1" />
        <Link
          href="/rehab/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新規プログラム作成
        </Link>
      </div>

      {/* エラー */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* テーブル */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">選手</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">診断</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">フェーズ</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">開始日</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">予定RTP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-6 w-16 animate-pulse rounded-full bg-muted" /></td>
                </tr>
              ))
            ) : programs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  リハビリプログラムがありません
                </td>
              </tr>
            ) : (
              programs.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border transition-colors hover:bg-muted/30 last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link href={`/rehab/${p.id}`} className="font-medium text-foreground hover:text-emerald-600">
                      {p.athletes?.name ?? '不明'}
                      {p.athletes?.number != null && (
                        <span className="ml-1 text-muted-foreground">#{p.athletes.number}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.diagnosis_code ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((phase) => (
                        <div
                          key={phase}
                          className={`h-3 w-3 rounded-full ${
                            phase < p.current_phase
                              ? 'bg-emerald-500'
                              : phase === p.current_phase
                                ? 'bg-emerald-500 ring-2 ring-emerald-300'
                                : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                          title={`フェーズ ${phase}`}
                        />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.current_phase}/4
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.start_date}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.estimated_rtp_date ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
