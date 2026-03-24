'use client';

import { use, useEffect, useState } from 'react';
import { TriageColumn } from './triage-column';
import type { TriageAthlete } from './triage-card';

interface AlertItem {
  id: string;
  athleteId: string;
  athleteName: string;
  priority: 'critical' | 'watchlist';
  reason: string;
  actionHref: string;
}

interface TriageContentProps {
  searchParamsPromise: Promise<{ team?: string }>;
}

export function TriageContent({ searchParamsPromise }: TriageContentProps) {
  const searchParams = use(searchParamsPromise);
  const teamId = searchParams.team;

  const [critical, setCritical] = useState<TriageAthlete[]>([]);
  const [watchlist, setWatchlist] = useState<TriageAthlete[]>([]);
  const [normal, setNormal] = useState<TriageAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTriage() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/team/dashboard?team_id=${encodeURIComponent(teamId!)}`,
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error ?? 'データ取得失敗');
        }

        const data = json.data;
        const alerts: AlertItem[] = data.alerts ?? [];

        // Classify alerts into triage categories
        const criticalAthletes: TriageAthlete[] = [];
        const watchlistAthletes: TriageAthlete[] = [];
        const seenIds = new Set<string>();

        for (const alert of alerts) {
          if (seenIds.has(alert.athleteId)) continue;
          seenIds.add(alert.athleteId);

          const athlete: TriageAthlete = {
            id: alert.athleteId,
            name: alert.athleteName,
            reason: alert.reason,
            priority: alert.priority,
            conditioningScore: null,
            lockType: null,
          };

          if (alert.priority === 'critical') {
            criticalAthletes.push(athlete);
          } else {
            watchlistAthletes.push(athlete);
          }
        }

        if (!cancelled) {
          setCritical(criticalAthletes);
          setWatchlist(watchlistAthletes);
          // Normal athletes are those not in any alert
          // We don't have the full roster from dashboard, so leave empty for now
          setNormal([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'データの取得に失敗しました',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTriage();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!teamId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">
          チームを選択してトリアージリストを表示してください
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="h-24 animate-pulse rounded-lg border border-border bg-card"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-critical-200 bg-critical-50 p-6">
        <p className="text-sm font-medium text-critical-700">
          エラー: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TriageColumn
        title="Critical"
        subtitle="要介入"
        athletes={critical}
        colorScheme="red"
      />
      <TriageColumn
        title="Watchlist"
        subtitle="経過観察"
        athletes={watchlist}
        colorScheme="amber"
      />
      <TriageColumn
        title="Normal"
        subtitle="通常"
        athletes={normal}
        colorScheme="green"
      />
    </div>
  );
}
