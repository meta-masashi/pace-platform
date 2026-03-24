'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConditioningData {
  conditioningScore: number;
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
  trend: TrendEntry[];
  insight: string;
}

interface TrendEntry {
  date: string;
  conditioning_score: number | null;
  fitness_ewma: number | null;
  fatigue_ewma: number | null;
  acwr: number | null;
  srpe: number | null;
}

interface AthleteDetailContentProps {
  paramsPromise: Promise<{ athleteId: string }>;
}

type TabId = 'status' | 'programs' | 'soap';

const TABS: { id: TabId; label: string }[] = [
  { id: 'status', label: 'ステータス' },
  { id: 'programs', label: 'プログラム承認' },
  { id: 'soap', label: 'SOAPノート' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AthleteDetailContent({
  paramsPromise,
}: AthleteDetailContentProps) {
  const { athleteId } = use(paramsPromise);

  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [data, setData] = useState<ConditioningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/conditioning/${athleteId}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? 'データの取得に失敗しました。');
          return;
        }

        const d = json.data;
        setData({
          conditioningScore: d.current.conditioningScore,
          fitnessEwma: d.current.fitnessEwma,
          fatigueEwma: d.current.fatigueEwma,
          acwr: d.current.acwr,
          trend: d.trend,
          insight: d.insight,
        });
      } catch {
        setError('ネットワークエラーが発生しました。');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [athleteId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/athletes"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted"
          >
            <svg
              className="h-4 w-4 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight">選手詳細</h1>
            <p className="text-xs text-muted-foreground">ID: {athleteId}</p>
          </div>
        </div>
        <Link
          href={`/assessment/new?athlete=${athleteId}`}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          アセスメント開始
        </Link>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'status' && (
        <StatusTab
          data={data}
          loading={loading}
          error={error}
        />
      )}
      {activeTab === 'programs' && <ProgramsTab />}
      {activeTab === 'soap' && <SoapTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: ステータス (fully implemented)
// ---------------------------------------------------------------------------

function StatusTab({
  data,
  loading,
  error,
}: {
  data: ConditioningData | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="h-48 w-48 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-critical-200 bg-critical-50 p-6 text-center">
        <p className="text-sm text-critical-700">
          {error ?? 'データを取得できませんでした。'}
        </p>
      </div>
    );
  }

  const scoreColor =
    data.conditioningScore >= 70
      ? 'text-optimal-600'
      : data.conditioningScore >= 40
        ? 'text-watchlist-600'
        : 'text-critical-600';

  const ringColor =
    data.conditioningScore >= 70
      ? 'stroke-optimal-400'
      : data.conditioningScore >= 40
        ? 'stroke-watchlist-400'
        : 'stroke-critical-400';

  const SIZE = 180;
  const SW = 12;
  const R = (SIZE - SW) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - (data.conditioningScore / 100) * C;

  return (
    <div className="space-y-6">
      {/* Conditioning score ring */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={SW}
              className="text-muted/50"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={SW}
              strokeLinecap="round"
              className={ringColor}
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">コンディション</span>
            <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
              {data.conditioningScore}
            </span>
          </div>
        </div>
      </div>

      {/* AI insight */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2H10a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
            <line x1="9" y1="21" x2="15" y2="21" />
          </svg>
          <p className="text-sm text-foreground">{data.insight}</p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="フィットネス蓄積"
          value={data.fitnessEwma.toFixed(1)}
          unit="42日 EWMA"
        />
        <MetricCard
          label="疲労負荷"
          value={data.fatigueEwma.toFixed(1)}
          unit="7日 EWMA"
        />
        <MetricCard
          label="ACWR"
          value={data.acwr.toFixed(2)}
          unit=""
          color={
            data.acwr <= 1.3
              ? 'text-optimal-600'
              : data.acwr <= 1.5
                ? 'text-watchlist-600'
                : 'text-critical-600'
          }
        />
      </div>

      {/* Daily metrics history */}
      {data.trend.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            日別メトリクス推移
          </h3>
          <div className="max-h-64 overflow-y-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                    日付
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                    CS
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                    Fitness
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                    Fatigue
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                    ACWR
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                    sRPE
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.trend
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <tr
                      key={entry.date}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {entry.date}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {entry.conditioning_score ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {entry.fitness_ewma?.toFixed(1) ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {entry.fatigue_ewma?.toFixed(1) ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {entry.acwr?.toFixed(2) ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {entry.srpe ?? '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: プログラム承認 (placeholder)
// ---------------------------------------------------------------------------

function ProgramsTab() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
      <div className="text-center">
        <svg
          className="mx-auto h-10 w-10 text-muted-foreground/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <p className="mt-2 text-sm text-muted-foreground">
          承認待ちのリハビリプログラムはありません
        </p>
        <p className="text-xs text-muted-foreground/70">
          （この機能は開発中です）
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: SOAPノート (placeholder)
// ---------------------------------------------------------------------------

function SoapTab() {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
      <div className="text-center">
        <svg
          className="mx-auto h-10 w-10 text-muted-foreground/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p className="mt-2 text-sm text-muted-foreground">
          SOAPノートはまだ作成されていません
        </p>
        <p className="text-xs text-muted-foreground/70">
          （この機能は開発中です）
        </p>
        <button
          type="button"
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          AI SOAPノート作成
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color ?? 'text-foreground'}`}>
        {value}
      </p>
      {unit && (
        <p className="text-xs text-muted-foreground">{unit}</p>
      )}
    </div>
  );
}
