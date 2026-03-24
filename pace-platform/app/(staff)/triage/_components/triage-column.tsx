'use client';

import { TriageCard } from './triage-card';
import type { TriageAthlete } from './triage-card';

interface TriageColumnProps {
  title: string;
  subtitle: string;
  athletes: TriageAthlete[];
  colorScheme: 'red' | 'amber' | 'green';
}

const SCHEME_STYLES: Record<
  string,
  { border: string; badge: string; empty: string; header: string }
> = {
  red: {
    border: 'border-critical-200',
    badge: 'bg-critical-100 text-critical-700',
    empty: 'text-critical-400',
    header: 'text-critical-700',
  },
  amber: {
    border: 'border-watchlist-200',
    badge: 'bg-watchlist-100 text-watchlist-700',
    empty: 'text-watchlist-400',
    header: 'text-watchlist-700',
  },
  green: {
    border: 'border-optimal-200',
    badge: 'bg-optimal-100 text-optimal-700',
    empty: 'text-optimal-400',
    header: 'text-optimal-700',
  },
};

export function TriageColumn({
  title,
  subtitle,
  athletes,
  colorScheme,
}: TriageColumnProps) {
  const styles = SCHEME_STYLES[colorScheme]!;

  return (
    <div
      className={`rounded-lg border-2 bg-card ${styles.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className={`text-sm font-semibold ${styles.header}`}>
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles.badge}`}
        >
          {athletes.length}
        </span>
      </div>

      {/* List */}
      <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto p-3 scrollbar-thin">
        {athletes.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className={`text-xs ${styles.empty}`}>
              該当する選手はいません
            </p>
          </div>
        ) : (
          athletes.map((athlete) => (
            <TriageCard
              key={athlete.id}
              athlete={athlete}
              colorScheme={colorScheme}
            />
          ))
        )}
      </div>
    </div>
  );
}
