'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { LockManager } from './lock-manager';
import { MetricLabel } from '@/app/_components/metric-label';

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

interface SoapNoteData {
  id: string;
  athlete_id: string;
  staff_id: string;
  s_text: string;
  o_text: string;
  a_text: string;
  p_text: string;
  created_at: string;
  ai_assisted: boolean;
}

interface AthleteDetailContentProps {
  paramsPromise: Promise<{ athleteId: string }>;
}

// タブ構造を廃止 → ラプソード型1画面ダッシュボード

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AthleteDetailContent({
  paramsPromise,
}: AthleteDetailContentProps) {
  const { athleteId } = use(paramsPromise);

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
      } catch (err) { void err; // silently handled
        setError('ネットワークエラーが発生しました。');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [athleteId]);

  return (
    <div className="space-y-6">
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/athletes"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight">選手ダッシュボード</h1>
            <p className="text-xs text-muted-foreground">ID: {athleteId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/what-if?athleteId=${athleteId}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            What-If
          </Link>
          <Link
            href={`/assessment/new?athlete=${athleteId}`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            アセスメント
          </Link>
          <Link
            href={`/soap/new?athleteId=${athleteId}`}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            SOAP作成
          </Link>
        </div>
      </div>

      {/* ── セクション1: ロック + コンディション ── */}
      <StatusTab athleteId={athleteId} data={data} loading={loading} error={error} />

      {/* ── セクション2: MetricLabel グリッド（スタッフ用技術表示） ── */}
      {data && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            パフォーマンス指標
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricLabel metricId="readiness" value={data.conditioningScore} mode="staff" />
            <MetricLabel metricId="acwr" value={data.acwr} mode="staff" />
            <MetricLabel metricId="fitness" value={data.fitnessEwma} mode="staff" />
            <MetricLabel metricId="fatigue" value={data.fatigueEwma} mode="staff" />
          </div>
        </div>
      )}

      {/* ── セクション3: SOAPノート ── */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SOAPノート
        </h3>
        <SoapTab athleteId={athleteId} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: ステータス (with Lock Management)
// ---------------------------------------------------------------------------

function StatusTab({
  athleteId,
  data,
  loading,
  error,
}: {
  athleteId: string;
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
      {/* Lock Management Section */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          ロック状態
        </h3>
        <LockManager athleteId={athleteId} />
      </div>

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

// ProgramsTab removed — integrated into single dashboard view

// ---------------------------------------------------------------------------
// Tab 3: SOAPノート (fully implemented)
// ---------------------------------------------------------------------------

function SoapTab({ athleteId }: { athleteId: string }) {
  const [notes, setNotes] = useState<SoapNoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/soap?athleteId=${encodeURIComponent(athleteId)}&limit=20`
      );
      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? 'SOAPノートの取得に失敗しました。');
        return;
      }

      setNotes(json.data.notes as SoapNoteData[]);
    } catch (err) { void err; // silently handled
      setError('ネットワークエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Link
          href={`/soap/new?athleteId=${athleteId}`}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          新規SOAPノート作成
        </Link>
        <Link
          href={`/soap/new?athleteId=${athleteId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
          AI補助で作成
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-critical-200 bg-critical-50 px-3 py-2">
          <p className="text-sm text-critical-700">{error}</p>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-card">
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
            </svg>
            <p className="mt-2 text-sm text-muted-foreground">
              SOAPノートはまだ作成されていません
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note.id;
            return (
              <div
                key={note.id}
                className="rounded-lg border border-border bg-card"
              >
                {/* Note header (clickable) */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedNoteId(isExpanded ? null : note.id)
                  }
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {new Date(note.created_at).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        スタッフ: {note.staff_id.slice(0, 8)}...
                      </span>
                    </div>
                    {note.ai_assisted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
                        </svg>
                        AI補助
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    <SoapSection label="S" title="主観的所見" text={note.s_text} />
                    <SoapSection label="O" title="客観的所見" text={note.o_text} />
                    <SoapSection label="A" title="評価" text={note.a_text} />
                    <SoapSection label="P" title="計画" text={note.p_text} />

                    {note.ai_assisted && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs text-amber-800">
                          ※ AI生成内容は参考情報です。最終判断は有資格スタッフが行ってください。
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * SOAPノートのセクション表示コンポーネント
 */
function SoapSection({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
          {label}
        </span>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-7">
        {text}
      </p>
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
