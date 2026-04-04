'use client';

/**
 * 要確認選手カード
 *
 * P1-P4 で検出された選手を優先度順に表示。
 * ミニスパークライン（ACWR or NRS の7日推移）付き。
 * 「アセスメント」ボタンでアセスメント画面へ遷移。
 */

import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttentionAthleteData {
  athleteId: string;
  name: string;
  number: number | null;
  position: string | null;
  priority: 'P1_SAFETY' | 'P2_MECHANICAL_RISK' | 'P3_DECOUPLING' | 'P4_GAS_EXHAUSTION';
  decision: 'RED' | 'ORANGE' | 'YELLOW';
  /** 主要リスク要因テキスト */
  reason: string;
  /** 主要指標 */
  metrics: {
    acwr?: number;
    monotony?: number;
    nrs?: number;
    fatigue?: number;
    sleepScore?: number;
    srpe?: number;
  };
  /** ACWR or NRS の直近7日推移 */
  sparkline: number[];
}

export interface RehabAthleteData {
  athleteId: string;
  name: string;
  number: number | null;
  position: string | null;
  diagnosis: string;
  currentPhase: number;
  totalPhases: number;
  daysSinceInjury: number;
  recoveryScore: number;
  nrsCurrent: number;
  nrsPrevious: number;
}

// ---------------------------------------------------------------------------
// Priority label & colors
// ---------------------------------------------------------------------------

const priorityConfig: Record<string, { label: string; dotColor: string; bgColor: string; borderColor: string }> = {
  P1_SAFETY: {
    label: 'P1: 安全',
    dotColor: 'bg-critical-500',
    bgColor: 'bg-critical-500/5',
    borderColor: 'border-critical-500/20',
  },
  P2_MECHANICAL_RISK: {
    label: 'P2: 負荷超過',
    dotColor: 'bg-watchlist-500',
    bgColor: 'bg-watchlist-500/5',
    borderColor: 'border-watchlist-500/20',
  },
  P3_DECOUPLING: {
    label: 'P3: 効率低下',
    dotColor: 'bg-watchlist-500',
    bgColor: 'bg-watchlist-500/5',
    borderColor: 'border-watchlist-500/20',
  },
  P4_GAS_EXHAUSTION: {
    label: 'P4: 蓄積疲労',
    dotColor: 'bg-watchlist-500',
    bgColor: 'bg-watchlist-500/5',
    borderColor: 'border-watchlist-500/20',
  },
};

// ---------------------------------------------------------------------------
// Sparkline SVG (inline mini chart)
// ---------------------------------------------------------------------------

function Sparkline({ data, color = '#FF9F29' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest point dot */}
      {data.length > 0 && (
        <circle
          cx={padding + ((data.length - 1) / (data.length - 1)) * (width - 2 * padding)}
          cy={height - padding - (((data[data.length - 1] ?? min) - min) / range) * (height - 2 * padding)}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Attention Athlete Card
// ---------------------------------------------------------------------------

export function AttentionAthleteCard({ athlete }: { athlete: AttentionAthleteData }) {
  const config = priorityConfig[athlete.priority] ?? priorityConfig.P4_GAS_EXHAUSTION ?? { label: 'P4', dotColor: 'bg-watchlist-500', bgColor: 'bg-watchlist-500/5', borderColor: 'border-watchlist-500/20' };
  const sparkColor = athlete.decision === 'RED' ? '#FF4B4B' : '#FF9F29';

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4 transition-shadow hover:shadow-card-hover`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${config.dotColor}`} />
          <span className="text-sm font-semibold text-foreground">
            {athlete.name}
          </span>
          {athlete.number != null && (
            <span className="text-xs text-muted-foreground">#{athlete.number}</span>
          )}
          {athlete.position && (
            <span className="text-xs text-muted-foreground">{athlete.position}</span>
          )}
        </div>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          {config.label}
        </span>
      </div>

      {/* Metrics row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {athlete.metrics.acwr != null && (
          <span className={athlete.metrics.acwr > 1.5 ? 'font-medium text-critical-500' : 'text-muted-foreground'}>
            ACWR {athlete.metrics.acwr.toFixed(2)}
          </span>
        )}
        {athlete.metrics.monotony != null && (
          <span className={athlete.metrics.monotony > 2.0 ? 'font-medium text-critical-500' : 'text-muted-foreground'}>
            Mono {athlete.metrics.monotony.toFixed(2)}
          </span>
        )}
        {athlete.metrics.nrs != null && (
          <span className={athlete.metrics.nrs >= 8 ? 'font-medium text-critical-500' : 'text-muted-foreground'}>
            NRS {athlete.metrics.nrs}
          </span>
        )}
        {athlete.metrics.fatigue != null && (
          <span className="text-muted-foreground">
            疲労 {athlete.metrics.fatigue}/10
          </span>
        )}
        {athlete.metrics.sleepScore != null && (
          <span className="text-muted-foreground">
            睡眠 {athlete.metrics.sleepScore}/5
          </span>
        )}
      </div>

      {/* Sparkline + reason */}
      <div className="mt-3 flex items-center justify-between">
        <p className="flex-1 text-xs text-muted-foreground">{athlete.reason}</p>
        <Sparkline data={athlete.sparkline} color={sparkColor} />
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <Link
          href={`/athletes/${athlete.athleteId}?tab=assessment`}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          アセスメント
        </Link>
        <Link
          href={`/athletes/${athlete.athleteId}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          詳細推移
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rehab Athlete Card
// ---------------------------------------------------------------------------

export function RehabAthleteCard({ athlete }: { athlete: RehabAthleteData }) {
  const progressPercent = Math.round((athlete.currentPhase / athlete.totalPhases) * 100);
  const nrsTrend = athlete.nrsCurrent < athlete.nrsPrevious ? 'improving' : athlete.nrsCurrent > athlete.nrsPrevious ? 'worsening' : 'stable';

  return (
    <div className="rounded-lg border border-cyber-cyan-500/20 bg-cyber-cyan-500/5 p-4 transition-shadow hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-cyber-cyan-500" />
          <span className="text-sm font-semibold text-foreground">{athlete.name}</span>
          {athlete.number != null && (
            <span className="text-xs text-muted-foreground">#{athlete.number}</span>
          )}
          {athlete.position && (
            <span className="text-xs text-muted-foreground">{athlete.position}</span>
          )}
        </div>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          Phase {athlete.currentPhase}/{athlete.totalPhases}
        </span>
      </div>

      {/* Diagnosis & day count */}
      <p className="mt-2 text-xs text-muted-foreground">
        {athlete.diagnosis} — Day {athlete.daysSinceInjury}
      </p>

      {/* Recovery progress bar */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">回復度</span>
          <span className="text-sm font-bold tabular-nums text-cyber-cyan-500">
            {athlete.recoveryScore}%
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-cyber-cyan-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* NRS trend */}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">NRS:</span>
        <span className="font-medium tabular-nums text-foreground">{athlete.nrsCurrent}</span>
        <span className={`text-2xs ${
          nrsTrend === 'improving' ? 'text-optimal-500' : nrsTrend === 'worsening' ? 'text-critical-500' : 'text-muted-foreground'
        }`}>
          {nrsTrend === 'improving' ? '↓ 改善' : nrsTrend === 'worsening' ? '↑ 悪化' : '→ 安定'}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <Link
          href={`/athletes/${athlete.athleteId}?tab=rehab`}
          className="rounded-md bg-cyber-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyber-cyan-500 transition-colors hover:bg-cyber-cyan-500/30"
        >
          リハビリ評価
        </Link>
        <Link
          href={`/athletes/${athlete.athleteId}`}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          回復推移
        </Link>
      </div>
    </div>
  );
}
