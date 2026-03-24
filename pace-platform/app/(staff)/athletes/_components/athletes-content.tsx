'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Athlete {
  id: string;
  name: string;
  position: string | null;
  number: number | null;
  conditioningScore: number | null;
  acwr: number | null;
  hardLock: boolean;
  softLock: boolean;
  lastCheckin: string | null;
}

interface AthletesContentProps {
  searchParamsPromise: Promise<{ team?: string; q?: string }>;
}

type SortField = 'name' | 'position' | 'number' | 'conditioningScore' | 'acwr';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AthletesContent({ searchParamsPromise }: AthletesContentProps) {
  const searchParams = use(searchParamsPromise);
  const teamId = searchParams.team;

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.q ?? '');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAthletes() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/team/dashboard?team_id=${encodeURIComponent(teamId!)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        // Dashboard gives us alerts with athlete info
        // Build athlete list from alerts (best we have without dedicated endpoint)
        const alertMap = new Map<string, Athlete>();
        for (const alert of json.data.alerts ?? []) {
          if (!alertMap.has(alert.athleteId)) {
            alertMap.set(alert.athleteId, {
              id: alert.athleteId,
              name: alert.athleteName,
              position: null,
              number: null,
              conditioningScore: null,
              acwr: null,
              hardLock: false,
              softLock: false,
              lastCheckin: null,
            });
          }
        }

        if (!cancelled) {
          setAthletes(Array.from(alertMap.values()));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'データの取得に失敗しました',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAthletes();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Filter and sort
  const filteredAthletes = useMemo(() => {
    let result = athletes;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.position ?? '').toLowerCase().includes(q),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'ja');
          break;
        case 'position':
          cmp = (a.position ?? '').localeCompare(b.position ?? '', 'ja');
          break;
        case 'number':
          cmp = (a.number ?? 0) - (b.number ?? 0);
          break;
        case 'conditioningScore':
          cmp = (a.conditioningScore ?? 0) - (b.conditioningScore ?? 0);
          break;
        case 'acwr':
          cmp = (a.acwr ?? 0) - (b.acwr ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [athletes, searchQuery, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  if (!teamId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">
          チームを選択して選手一覧を表示してください
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="rounded-lg border border-border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
            >
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="flex-1" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
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
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="選手を検索..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filteredAthletes.length} 名
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <SortableHeader
                  label="名前"
                  field="name"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <SortableHeader
                  label="ポジション"
                  field="position"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <SortableHeader
                  label="番号"
                  field="number"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  ステータス
                </th>
                <SortableHeader
                  label="CS"
                  field="conditioningScore"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <SortableHeader
                  label="ACWR"
                  field="acwr"
                  currentField={sortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                  最終チェックイン
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAthletes.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    {searchQuery
                      ? '検索条件に一致する選手がいません'
                      : '選手データがありません'}
                  </td>
                </tr>
              ) : (
                filteredAthletes.map((athlete) => (
                  <tr
                    key={athlete.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/athletes/${athlete.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {athlete.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {athlete.position ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {athlete.number ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {athlete.hardLock && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-critical-100 px-2 py-0.5 text-xs font-medium text-critical-700">
                          <LockIcon />
                          ハードロック
                        </span>
                      )}
                      {athlete.softLock && !athlete.hardLock && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-watchlist-100 px-2 py-0.5 text-xs font-medium text-watchlist-700">
                          <LockIcon />
                          ソフトロック
                        </span>
                      )}
                      {!athlete.hardLock && !athlete.softLock && (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {athlete.conditioningScore !== null ? (
                        <span
                          className={`font-medium ${
                            athlete.conditioningScore >= 70
                              ? 'text-optimal-600'
                              : athlete.conditioningScore >= 40
                                ? 'text-watchlist-600'
                                : 'text-critical-600'
                          }`}
                        >
                          {athlete.conditioningScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {athlete.acwr !== null ? (
                        <span
                          className={`font-medium ${
                            athlete.acwr <= 1.3
                              ? 'text-optimal-600'
                              : athlete.acwr <= 1.5
                                ? 'text-watchlist-600'
                                : 'text-critical-600'
                          }`}
                        >
                          {athlete.acwr.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {athlete.lastCheckin ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onClick,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onClick: (field: SortField) => void;
}) {
  const isActive = field === currentField;
  return (
    <th className="px-4 py-2 text-left">
      <button
        type="button"
        onClick={() => onClick(field)}
        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
        {isActive && (
          <svg
            className={`h-3 w-3 transition-transform ${currentDir === 'desc' ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Lock icon
// ---------------------------------------------------------------------------

function LockIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}
