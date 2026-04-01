'use client';

/**
 * PACE v6.0 — MDT Copilot メインコンテンツ
 *
 * チーム全選手のパイプライン結果をリアルタイム表示する。
 * - フィルタ: ALL / RED / ORANGE / YELLOW / GREEN
 * - 選手名検索
 * - 60秒自動リフレッシュ
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AthleteRiskCard } from './athlete-risk-card';

type DecisionFilter = 'ALL' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';

interface TraceData {
  trace_id: string;
  athlete_id: string;
  timestamp_utc: string;
  pipeline_version: string;
  decision: string;
  priority: string;
  athlete_name?: string;
  inference_snapshot: Record<string, unknown>;
  acknowledged_by?: string;
  acknowledged_at?: string;
  acknowledge_action?: string;
  acknowledged_staff_name?: string;
}

interface TeamResult {
  athleteId: string;
  athleteName: string;
  latestTrace: TraceData | null;
}

interface CopilotContentProps {
  teamId: string;
  teamName: string;
}

const FILTER_OPTIONS: { value: DecisionFilter; label: string; color: string }[] = [
  { value: 'ALL', label: 'すべて', color: 'bg-muted text-foreground' },
  { value: 'RED', label: '停止', color: 'bg-[#DC2626] text-white' },
  { value: 'ORANGE', label: '警戒', color: 'bg-[#EA580C] text-white' },
  { value: 'YELLOW', label: '注意', color: 'bg-[#CA8A04] text-white' },
  { value: 'GREEN', label: '良好', color: 'bg-[#16A34A] text-white' },
];

export function CopilotContent({ teamId, teamName }: CopilotContentProps) {
  const [results, setResults] = useState<TeamResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchResults = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/pipeline/team?teamId=${teamId}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? 'データの取得に失敗しました。');
        return;
      }

      setResults(data.data ?? []);
      setLastRefreshed(new Date());
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  // 初回フェッチ
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // 60秒自動リフレッシュ
  useEffect(() => {
    const interval = setInterval(fetchResults, 60_000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  // フィルタリング
  const filteredResults = useMemo(() => {
    let filtered = results;

    // 判定フィルタ
    if (filter !== 'ALL') {
      filtered = filtered.filter((r) => {
        if (!r.latestTrace) return false;
        return r.latestTrace.decision === filter;
      });
    }

    // 検索フィルタ
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) =>
        r.athleteName.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [results, filter, searchQuery]);

  // 統計
  const stats = useMemo(() => {
    const counts = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, NONE: 0 };
    for (const r of results) {
      if (r.latestTrace) {
        const d = r.latestTrace.decision as keyof typeof counts;
        if (d in counts) {
          counts[d]++;
        }
      } else {
        counts.NONE++;
      }
    }
    return counts;
  }, [results]);

  if (isLoading) {
    return <CopilotSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            MDT Copilot
          </h1>
          <p className="text-sm text-muted-foreground">
            {teamName} — {results.length}名の選手
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            最終更新:{' '}
            {lastRefreshed.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </span>
          <button
            onClick={fetchResults}
            className="rounded-md border border-border p-1.5 transition-colors hover:bg-accent"
            aria-label="更新"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 統計サマリー */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="停止" count={stats.RED} color="bg-[#DC2626]" />
        <StatCard label="警戒" count={stats.ORANGE} color="bg-[#EA580C]" />
        <StatCard label="注意" count={stats.YELLOW} color="bg-[#CA8A04]" />
        <StatCard label="良好" count={stats.GREEN} color="bg-[#16A34A]" />
        <StatCard label="データなし" count={stats.NONE} color="bg-muted" />
      </div>

      {/* フィルタ + 検索 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filter === opt.value
                  ? opt.color
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
              {opt.value !== 'ALL' && (
                <span className="ml-1">
                  ({stats[opt.value as keyof typeof stats] ?? 0})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 md:max-w-xs">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="選手名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* 選手カード一覧 */}
      <div className="space-y-3">
        {filteredResults.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {results.length === 0
                ? 'パイプライン結果がまだありません。'
                : '該当する選手が見つかりません。'}
            </p>
          </div>
        ) : (
          filteredResults.map((r) => (
            <AthleteRiskCard
              key={r.athleteId}
              athleteId={r.athleteId}
              athleteName={r.athleteName}
              trace={r.latestTrace as Parameters<typeof AthleteRiskCard>[0]['trace']}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className={`h-3 w-3 shrink-0 rounded-full ${color}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{count}</p>
      </div>
    </div>
  );
}

function CopilotSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="h-10 w-full max-w-lg animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
