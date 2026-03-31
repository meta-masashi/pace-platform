'use client';

import Link from 'next/link';

export interface TriageAthlete {
  id: string;
  name: string;
  position?: string;
  number?: number;
  reason: string;
  priority: 'critical' | 'watchlist' | 'normal';
  conditioningScore: number | null;
  lockType: 'hard' | 'soft' | null;
  /** P2/P3 複合条件の根拠データ（エビデンスベース表示用） */
  compoundEvidence?: {
    acwr?: number;
    declinedWellnessItems?: number;
    consecutiveBadDays?: number;
    triggerRule?: string;
  };
}

interface TriageCardProps {
  athlete: TriageAthlete;
  colorScheme: 'red' | 'amber' | 'green';
}

const BORDER_COLOR: Record<string, string> = {
  red: 'border-l-critical-500',
  amber: 'border-l-watchlist-500',
  green: 'border-l-optimal-500',
};

export function TriageCard({ athlete, colorScheme }: TriageCardProps) {
  return (
    <Link
      href={`/athletes/${athlete.id}`}
      className={`block rounded-lg border border-border border-l-4 bg-background p-3 transition-all hover:bg-muted/50 hover:shadow-sm ${BORDER_COLOR[colorScheme]}`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {athlete.name}
            </p>
            {athlete.lockType && (
              <LockIcon type={athlete.lockType} />
            )}
          </div>
          {(athlete.position || athlete.number !== undefined) && (
            <p className="text-xs text-muted-foreground">
              {athlete.position}
              {athlete.number !== undefined ? ` #${athlete.number}` : ''}
            </p>
          )}
        </div>

        {/* Mini conditioning score ring */}
        {athlete.conditioningScore !== null && (
          <MiniConditioningRing score={athlete.conditioningScore} />
        )}
      </div>

      {/* Reason */}
      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
        {athlete.reason}
      </p>

      {/* 複合条件の根拠（P2/P3 発火時） */}
      {athlete.compoundEvidence && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {athlete.compoundEvidence.acwr !== undefined && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              athlete.compoundEvidence.acwr > 1.5
                ? 'bg-critical-100 text-critical-700'
                : 'bg-watchlist-100 text-watchlist-700'
            }`}>
              ACWR {athlete.compoundEvidence.acwr.toFixed(2)}
            </span>
          )}
          {athlete.compoundEvidence.declinedWellnessItems !== undefined && athlete.compoundEvidence.declinedWellnessItems > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              ウェルネス{athlete.compoundEvidence.declinedWellnessItems}項目悪化
            </span>
          )}
          {athlete.compoundEvidence.consecutiveBadDays !== undefined && athlete.compoundEvidence.consecutiveBadDays >= 3 && (
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
              {athlete.compoundEvidence.consecutiveBadDays}日連続悪化
            </span>
          )}
          {athlete.compoundEvidence.triggerRule && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {athlete.compoundEvidence.triggerRule}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mini conditioning ring (32x32)
// ---------------------------------------------------------------------------

function MiniConditioningRing({ score }: { score: number }) {
  const SIZE = 32;
  const STROKE = 3;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - (Math.min(100, Math.max(0, score)) / 100) * C;

  const color =
    score >= 70
      ? 'stroke-optimal-400'
      : score >= 40
        ? 'stroke-watchlist-400'
        : 'stroke-critical-400';

  const textColor =
    score >= 70
      ? 'text-optimal-600'
      : score >= 40
        ? 'text-watchlist-600'
        : 'text-critical-600';

  return (
    <div className="relative shrink-0">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-muted/50"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className={color}
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums ${textColor}`}
      >
        {score}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lock icon
// ---------------------------------------------------------------------------

function LockIcon({ type }: { type: 'hard' | 'soft' }) {
  const isHard = type === 'hard';
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 ${isHard ? 'text-critical-500' : 'text-watchlist-500'}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {isHard ? (
        <path d="M7 11V7a5 5 0 0110 0v4" />
      ) : (
        <path d="M7 11V7a5 5 0 019.9-1" />
      )}
    </svg>
  );
}
