'use client';

import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from './kpi-card';
import { AlertActionHub } from './alert-action-hub';
import type { AlertItem, RiskPreventionReport } from './alert-action-hub';
import type { AcwrDataPoint } from './acwr-trend-chart';
import type { ConditioningDataPoint } from './conditioning-trend-chart';
import type { ClassifiedEvent, LoadPrediction, CalendarSyncStatus } from '@/lib/calendar/types';

// Dynamic imports for Recharts components (SSR disabled)
const AcwrTrendChart = dynamic(
  () => import('./acwr-trend-chart').then((mod) => ({ default: mod.AcwrTrendChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border bg-card">
        <span className="text-sm text-muted-foreground">チャート読み込み中...</span>
      </div>
    ),
  },
);

const ConditioningTrendChart = dynamic(
  () =>
    import('./conditioning-trend-chart').then((mod) => ({
      default: mod.ConditioningTrendChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border bg-card">
        <span className="text-sm text-muted-foreground">チャート読み込み中...</span>
      </div>
    ),
  },
);

const CalendarOverlayChart = dynamic(
  () =>
    import('./calendar-overlay-chart').then((mod) => ({
      default: mod.CalendarOverlayChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border bg-card">
        <span className="text-sm text-muted-foreground">カレンダーチャート読み込み中...</span>
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardData {
  kpi: {
    criticalAlerts: number;
    availability: string;
    conditioningScore: number;
    watchlistCount: number;
  };
  acwrTrend: AcwrDataPoint[];
  conditioningTrend: ConditioningDataPoint[];
  alerts: AlertItem[];
  riskReports: RiskPreventionReport[];
}

interface DashboardContentProps {
  searchParamsPromise: Promise<{ team?: string }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardContent({ searchParamsPromise }: DashboardContentProps) {
  const searchParams = use(searchParamsPromise);
  const teamId = searchParams.team;

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Calendar integration state
  const [calendarPredictions, setCalendarPredictions] = useState<LoadPrediction[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>('disconnected');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      setData(null);
      return;
    }

    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/team/dashboard?team_id=${encodeURIComponent(teamId!)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  // Fetch calendar events separately
  useEffect(() => {
    if (!teamId) {
      setCalendarPredictions([]);
      setCalendarStatus('disconnected');
      return;
    }

    let cancelled = false;

    async function fetchCalendar() {
      setCalendarLoading(true);
      try {
        const res = await fetch(
          `/api/calendar/events?team_id=${encodeURIComponent(teamId!)}`,
        );
        if (!res.ok) {
          if (!cancelled) setCalendarStatus('error');
          return;
        }
        const json = await res.json();
        if (!cancelled && json.success) {
          setCalendarPredictions(json.data.predictions ?? []);
          setCalendarStatus(json.data.syncStatus ?? 'disconnected');
        }
      } catch {
        if (!cancelled) setCalendarStatus('error');
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }

    fetchCalendar();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  /** Google Calendar 接続を開始する */
  const handleConnectCalendar = useCallback(async () => {
    setConnectingCalendar(true);
    try {
      const res = await fetch('/api/calendar/connect');
      if (!res.ok) {
        console.error('カレンダー接続 URL の取得に失敗しました');
        return;
      }
      const json = await res.json();
      if (json.success && json.data?.authUrl) {
        window.location.href = json.data.authUrl;
      }
    } catch (err) {
      console.error('カレンダー接続エラー:', err);
    } finally {
      setConnectingCalendar(false);
    }
  }, []);

  // No team selected
  if (!teamId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">
          チームを選択してダッシュボードを表示してください
        </p>
      </div>
    );
  }

  // Loading
  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div className="rounded-lg border border-critical-200 bg-critical-50 p-6">
        <p className="text-sm font-medium text-critical-700">
          エラーが発生しました: {error}
        </p>
      </div>
    );
  }

  // No data
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <p className="text-sm text-muted-foreground">データがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row (4 cards) */}
      <div className="kpi-row-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Critical アラート"
          value={data.kpi.criticalAlerts}
          color="red"
          subtext="要介入"
        />
        <KpiCard
          label="プレー可能率"
          value={data.kpi.availability}
          color="default"
          subtext="Availability"
        />
        <KpiCard
          label="コンディション・スコア"
          value={data.kpi.conditioningScore}
          color="green"
          subtext="Team Peaking (0-100)"
        />
        <KpiCard
          label="Watchlist（隠れリスク）"
          value={data.kpi.watchlistCount}
          color="amber"
          subtext="主観-客観乖離"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AcwrTrendChart data={data.acwrTrend} />
        <ConditioningTrendChart data={data.conditioningTrend} />
      </div>

      {/* Calendar Overlay */}
      <CalendarSection
        calendarStatus={calendarStatus}
        calendarLoading={calendarLoading}
        calendarPredictions={calendarPredictions}
        currentAvailability={parseAvailabilityPercent(data.kpi.availability)}
        connectingCalendar={connectingCalendar}
        onConnectCalendar={handleConnectCalendar}
      />

      {/* Alert Action Hub */}
      <AlertActionHub alerts={data.alerts} riskReports={data.riskReports} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (used during data fetch)
// ---------------------------------------------------------------------------

/**
 * プレー可能率文字列（"18/25" 形式）からパーセンテージを算出する。
 */
function parseAvailabilityPercent(availability: string): number {
  const parts = availability.split('/');
  if (parts.length !== 2) return 75;
  const [available, total] = parts as [string, string];
  const num = parseInt(available, 10);
  const den = parseInt(total, 10);
  if (isNaN(num) || isNaN(den) || den === 0) return 75;
  return Math.round((num / den) * 100 * 10) / 10;
}

// ---------------------------------------------------------------------------
// Calendar section
// ---------------------------------------------------------------------------

interface CalendarSectionProps {
  calendarStatus: CalendarSyncStatus;
  calendarLoading: boolean;
  calendarPredictions: LoadPrediction[];
  currentAvailability: number;
  connectingCalendar: boolean;
  onConnectCalendar: () => void;
}

function CalendarSection({
  calendarStatus,
  calendarLoading,
  calendarPredictions,
  currentAvailability,
  connectingCalendar,
  onConnectCalendar,
}: CalendarSectionProps) {
  // 未接続: 接続ボタンを表示
  if (calendarStatus === 'disconnected' || calendarStatus === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-8">
        <svg
          className="h-8 w-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">
          {calendarStatus === 'expired'
            ? 'Google Calendar の接続期限が切れました。再接続してください。'
            : 'Google Calendar を接続してスケジュール負荷予測を表示'}
        </p>
        <button
          type="button"
          onClick={onConnectCalendar}
          disabled={connectingCalendar}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {connectingCalendar ? '接続中...' : 'Google カレンダーを接続'}
        </button>
      </div>
    );
  }

  // 読み込み中
  if (calendarLoading) {
    return (
      <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
    );
  }

  // エラー
  if (calendarStatus === 'error') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-700">
          カレンダーデータの取得中にエラーが発生しました。しばらく後に再試行してください。
        </p>
      </div>
    );
  }

  // 接続済み: チャート表示
  return (
    <CalendarOverlayChart
      predictions={calendarPredictions}
      currentAvailability={currentAvailability}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (used during data fetch)
// ---------------------------------------------------------------------------

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-border bg-card"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
