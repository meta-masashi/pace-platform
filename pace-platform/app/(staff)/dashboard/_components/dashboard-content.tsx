'use client';

import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { KpiCard } from './kpi-card';
import { BioOverview, type BioOverviewData } from './bio-overview';
import { AlertActionHub } from './alert-action-hub';
import { AlertCardApproval, type AlertCardData } from './alert-card-approval';
import { KineticHeatmap } from './kinetic-heatmap';
import { DecouplingIndicator } from './decoupling-indicator';
import { WhatIfSimulator } from './what-if-simulator';
import { EvidenceVault } from './evidence-vault';
import type { AlertItem, RiskPreventionReport } from './alert-action-hub';
import type { AcwrDataPoint } from './acwr-trend-chart';
import type { ConditioningDataPoint } from './conditioning-trend-chart';
import type { ClassifiedEvent, LoadPrediction, CalendarSyncStatus } from '@/lib/calendar/types';
import type { ChainReaction } from './kinetic-heatmap';
import type { InnovationPoint } from './decoupling-indicator';
import type { SimulationParams, SimulationResult } from './what-if-simulator';
import type { InferenceTraceLog } from '@/lib/engine/v6/types';

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

/** v6 推論パイプラインから取得される選手別データ */
interface V6AthleteInference {
  athleteId: string;
  athleteName?: string;
  tissueStress: Record<string, number>;
  chainReactions: ChainReaction[];
  decouplingScore: number;
  innovationHistory: InnovationPoint[];
  severity: 'none' | 'mild' | 'moderate' | 'severe';
  currentLoad: number;
  currentDamage: Record<string, number>;
  traceLog: InferenceTraceLog;
}

/** v6 チーム全体の推論結果 */
interface V6TeamData {
  athletes: V6AthleteInference[];
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

  // Morning agenda state (7 AM Monopoly)
  const [agendaCards, setAgendaCards] = useState<AlertCardData[]>([]);
  const [agendaSummary, setAgendaSummary] = useState<{
    totalAthletes: number;
    criticalCount: number;
    watchlistCount: number;
    normalCount: number;
  } | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);

  // Calendar integration state
  const [calendarPredictions, setCalendarPredictions] = useState<LoadPrediction[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>('disconnected');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  // v6 Bio-War Room state
  const [v6Data, setV6Data] = useState<V6TeamData | null>(null);
  const [v6Loading, setV6Loading] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

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

  // Fetch morning agenda (7 AM Monopoly)
  useEffect(() => {
    if (!teamId) {
      setAgendaCards([]);
      setAgendaSummary(null);
      return;
    }

    let cancelled = false;

    async function fetchMorningAgenda() {
      setAgendaLoading(true);
      try {
        const res = await fetch(
          `/api/morning-agenda?teamId=${encodeURIComponent(teamId!)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) {
          setAgendaCards(json.data.alertCards ?? []);
          setAgendaSummary(json.data.teamSummary ?? null);
        }
      } catch {
        // Morning agenda の取得失敗はダッシュボード全体をブロックしない
        console.warn('[dashboard] 介入アジェンダの取得に失敗しました');
      } finally {
        if (!cancelled) setAgendaLoading(false);
      }
    }

    fetchMorningAgenda();
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

  // Fetch v6 inference data for Bio-War Room
  useEffect(() => {
    if (!teamId) {
      setV6Data(null);
      return;
    }

    let cancelled = false;

    async function fetchV6Data() {
      setV6Loading(true);
      try {
        const res = await fetch(
          `/api/v6/inference/team/${encodeURIComponent(teamId!)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) {
          setV6Data(json.data ?? null);
        }
      } catch {
        // v6 データの取得失敗はダッシュボード全体をブロックしない
        console.warn('[dashboard] v6 推論データの取得に失敗しました');
      } finally {
        if (!cancelled) setV6Loading(false);
      }
    }

    fetchV6Data();
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

  /** アラートカードのアクション完了時のコールバック */
  const handleAgendaAction = useCallback(
    (athleteId: string, action: string, logId: string) => {
      console.info(
        `[dashboard] 介入アジェンダ: athleteId=${athleteId} action=${action} logId=${logId}`,
      );
    },
    [],
  );

  /** Bio-War Room: region click → select athlete */
  const handleRegionClick = useCallback((_regionId: string) => {
    // Region click is primarily handled within KineticHeatmap popup
  }, []);

  /** Bio-War Room: What-If simulation */
  const handleSimulate = useCallback(
    async (params: SimulationParams): Promise<SimulationResult> => {
      try {
        const res = await fetch('/api/v6/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            athleteId: selectedAthleteId,
            ...params,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) return json.data;
        }
      } catch {
        console.warn('[dashboard] シミュレーション API 呼び出し失敗、ローカルフォールバック使用');
      }
      // Client-side fallback estimation
      const selectedAthlete = v6Data?.athletes.find(
        (a) => a.athleteId === selectedAthleteId,
      );
      const baseDamage = selectedAthlete?.currentDamage ?? {};
      const loadFactor = params.loadPercent / 100;
      const interventionReduction =
        (params.excludeSprints ? 0.15 : 0) +
        (params.applyTaping ? 0.05 : 0) +
        (params.switchToLowIntensity ? 0.25 : 0);
      const predicted: Record<string, number> = {};
      for (const [k, v] of Object.entries(baseDamage)) {
        predicted[k] = Math.max(0, Math.min(100, v * loadFactor * (1 - interventionReduction)));
      }
      const maxPredicted = Math.max(...Object.values(predicted), 0);
      const margin = Math.max(0, 100 - maxPredicted);
      const riskBefore: SimulationResult['riskBefore'] =
        Math.max(...Object.values(baseDamage), 0) > 80
          ? 'RED'
          : Math.max(...Object.values(baseDamage), 0) > 60
            ? 'ORANGE'
            : Math.max(...Object.values(baseDamage), 0) > 40
              ? 'YELLOW'
              : 'GREEN';
      const riskAfter: SimulationResult['riskAfter'] =
        maxPredicted > 80
          ? 'RED'
          : maxPredicted > 60
            ? 'ORANGE'
            : maxPredicted > 40
              ? 'YELLOW'
              : 'GREEN';
      return {
        predictedDamage: predicted,
        marginToCritical: margin,
        riskBefore,
        riskAfter,
        evidenceMessage: `負荷を${params.loadPercent}%に設定した場合、${
          params.excludeSprints ? 'スプリントを除外し、' : ''
        }${params.switchToLowIntensity ? '低強度メニューに変更すると、' : ''}予測最大ダメージは${Math.round(maxPredicted)}%です。臨界点までの余裕は${Math.round(margin)}%です。`,
      };
    },
    [selectedAthleteId, v6Data],
  );

  // Derive selected athlete data for Bio-War Room detail view
  const selectedAthlete = v6Data?.athletes.find(
    (a) => a.athleteId === selectedAthleteId,
  );

  // Auto-select first athlete from alert hub when v6 data arrives
  useEffect(() => {
    if (v6Data && v6Data.athletes.length > 0 && !selectedAthleteId) {
      const firstAthlete = v6Data.athletes[0];
      if (firstAthlete) setSelectedAthleteId(firstAthlete.athleteId);
    }
  }, [v6Data, selectedAthleteId]);

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
      {/* Layer 1: Bio-Overview (生体ステータス・サマリー) */}
      <BioOverview
        data={{
          teamReadiness: data.kpi.conditioningScore,
          availableCount: parseInt(data.kpi.availability.split('/')[0] ?? '0', 10),
          totalCount: parseInt(data.kpi.availability.split('/')[1] ?? '0', 10),
          trendDelta: 0,
          checkinRate: 100,
          uncheckedCount: 0,
          teamAcwr: 1.15,
          watchCriticalCount: data.kpi.criticalAlerts + data.kpi.watchlistCount,
        }}
        onAlertAction={() => {
          // スクロールしてアジェンダセクションへ
          document.getElementById('morning-agenda')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* 本日の介入アジェンダ (7 AM Monopoly) */}
      <div id="morning-agenda">
        <MorningAgendaSection
          cards={agendaCards}
          summary={agendaSummary}
          loading={agendaLoading}
          onActionComplete={handleAgendaAction}
        />
      </div>

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

      {/* v6.0 Bio-War Room */}
      <BioWarRoomSection
        v6Data={v6Data}
        v6Loading={v6Loading}
        selectedAthleteId={selectedAthleteId}
        selectedAthlete={selectedAthlete ?? null}
        onSelectAthlete={setSelectedAthleteId}
        onRegionClick={handleRegionClick}
        onSimulate={handleSimulate}
      />
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
        {calendarStatus === 'expired' ? (
          <a
            href="/settings/integrations"
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            設定ページで再接続
          </a>
        ) : (
        <button
          type="button"
          onClick={onConnectCalendar}
          disabled={connectingCalendar}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {connectingCalendar ? '接続中...' : 'Google カレンダーを接続'}
        </button>
        )}
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

// ---------------------------------------------------------------------------
// Morning Agenda section (7 AM Monopoly)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 一括承認ヘルパー（M11）
// ---------------------------------------------------------------------------

async function batchApproveCards(
  cards: AlertCardData[],
  action: 'approve' | 'reject'
): Promise<{ processed: number; failed: number }> {
  // P1/P2 は M20 により個別承認必須 — normal のみ対象
  const normalCards = cards.filter((c) => c.riskLevel === 'normal');
  if (normalCards.length === 0) return { processed: 0, failed: 0 };

  const res = await fetch('/api/approval/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      items: normalCards.map((c) => ({
        athleteId: c.athleteId,
        evidenceText: c.nlgText,
        nlgText: c.nlgText,
        riskScore: c.riskMultiplier,
      })),
    }),
  });

  if (!res.ok) return { processed: 0, failed: normalCards.length };
  const json = (await res.json()) as { success: boolean; data?: { processed: number; failed: number } };
  return json.data ?? { processed: 0, failed: normalCards.length };
}

interface MorningAgendaSectionProps {
  cards: AlertCardData[];
  summary: {
    totalAthletes: number;
    criticalCount: number;
    watchlistCount: number;
    normalCount: number;
  } | null;
  loading: boolean;
  onActionComplete: (athleteId: string, action: string, logId: string) => void;
}

function MorningAgendaSection({
  cards,
  summary,
  loading,
  onActionComplete,
}: MorningAgendaSectionProps) {
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  // ローディング中
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    );
  }

  // カードなし
  if (cards.length === 0) {
    return null;
  }

  const normalCards = cards.filter(
    (c) => c.riskLevel === 'normal' && !completedIds.has(c.athleteId)
  );
  const highRiskCards = cards.filter((c) => c.riskLevel !== 'normal');

  const handleBatch = async (action: 'approve' | 'reject') => {
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const result = await batchApproveCards(normalCards, action);
      normalCards.forEach((c) => {
        setCompletedIds((prev) => new Set([...prev, c.athleteId]));
        onActionComplete(c.athleteId, action, 'batch');
      });
      setBatchResult(
        `${result.processed} 件を${action === 'approve' ? '承認' : '却下'}しました。${
          result.failed > 0 ? ` (${result.failed} 件失敗)` : ''
        }`
      );
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* セクションヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500" />
          <h2 className="text-base font-bold">本日の介入アジェンダ</h2>
          {summary && (
            <span className="text-xs text-muted-foreground">
              ({summary.totalAthletes}名中{' '}
              {summary.criticalCount > 0 && (
                <span className="font-medium text-red-600">
                  Critical {summary.criticalCount}
                </span>
              )}
              {summary.criticalCount > 0 && summary.watchlistCount > 0 && ' / '}
              {summary.watchlistCount > 0 && (
                <span className="font-medium text-amber-600">
                  Watchlist {summary.watchlistCount}
                </span>
              )}
              )
            </span>
          )}
        </div>

        {/* M11: 通常アラートの一括承認ボタン（P1/P2 は M20 により除外） */}
        {normalCards.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Normal {normalCards.length}件を一括:
            </span>
            <button
              type="button"
              disabled={batchLoading}
              onClick={() => handleBatch('approve')}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {batchLoading ? '処理中...' : '全て承認'}
            </button>
            <button
              type="button"
              disabled={batchLoading}
              onClick={() => handleBatch('reject')}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              全て却下
            </button>
          </div>
        )}
      </div>

      {/* 一括処理結果 */}
      {batchResult && (
        <div className="rounded-md border border-optimal-200 bg-optimal-50 px-3 py-2 text-xs text-optimal-700">
          {batchResult}
        </div>
      )}

      {/* P1/P2 は個別承認必須バナー */}
      {highRiskCards.length > 0 && normalCards.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ※ Critical/Watchlist ({highRiskCards.length}件) は M20 により個別承認が必要です。
        </p>
      )}

      {/* アラートカード一覧 */}
      <div className="space-y-3">
        {cards
          .filter((c) => !completedIds.has(c.athleteId))
          .map((card) => (
            <AlertCardApproval
              key={card.athleteId}
              alertCard={card}
              onActionComplete={(athleteId, action, logId) => {
                setCompletedIds((prev) => new Set([...prev, athleteId]));
                onActionComplete(athleteId, action, logId);
              }}
            />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bio-War Room section (v6.0)
// ---------------------------------------------------------------------------

interface BioWarRoomSectionProps {
  v6Data: V6TeamData | null;
  v6Loading: boolean;
  selectedAthleteId: string | null;
  selectedAthlete: V6AthleteInference | null;
  onSelectAthlete: (id: string) => void;
  onRegionClick: (regionId: string) => void;
  onSimulate: (params: SimulationParams) => Promise<SimulationResult>;
}

function BioWarRoomSection({
  v6Data,
  v6Loading,
  selectedAthleteId,
  selectedAthlete,
  onSelectAthlete,
  onRegionClick,
  onSimulate,
}: BioWarRoomSectionProps) {
  // Loading
  if (v6Loading) {
    return (
      <div className="theme-deep-space rounded-xl bg-deep-space-600 p-4">
        <div className="mb-4 h-6 w-48 animate-skeleton-dark rounded" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-80 animate-skeleton-dark rounded-lg" />
          <div className="h-80 animate-skeleton-dark rounded-lg" />
        </div>
      </div>
    );
  }

  // No v6 data
  if (!v6Data || v6Data.athletes.length === 0) {
    return null;
  }

  return (
    <div className="theme-deep-space rounded-xl bg-[hsl(216,28%,7%)] p-4 md:p-6">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BioScanIcon className="h-5 w-5 text-cyber-cyan-500" />
          <h2 className="text-base font-bold text-[hsl(210,14%,93%)]">
            Bio-War Room
          </h2>
          <span className="text-xs text-deep-space-200">v6.0 推論パイプライン</span>
        </div>

        {/* Athlete selector */}
        {v6Data.athletes.length > 1 && (
          <select
            value={selectedAthleteId ?? ''}
            onChange={(e) => onSelectAthlete(e.target.value)}
            className="rounded-md border border-deep-space-300 bg-deep-space-500 px-3 py-1 text-xs text-deep-space-100 focus:outline-none focus:ring-1 focus:ring-cyber-cyan-500"
          >
            {v6Data.athletes.map((a) => (
              <option key={a.athleteId} value={a.athleteId}>
                {a.athleteName ?? a.athleteId.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main grid: Heatmap + Decoupling side by side */}
      {selectedAthlete && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <KineticHeatmap
              tissueStress={selectedAthlete.tissueStress}
              chainReactions={selectedAthlete.chainReactions}
              onRegionClick={onRegionClick}
            />
            <DecouplingIndicator
              decouplingScore={selectedAthlete.decouplingScore}
              innovationHistory={selectedAthlete.innovationHistory}
              severity={selectedAthlete.severity}
            />
          </div>

          {/* What-If Simulator + Evidence Vault */}
          <div className="grid gap-4 md:grid-cols-2">
            <WhatIfSimulator
              athleteId={selectedAthlete.athleteId}
              currentLoad={selectedAthlete.currentLoad}
              currentDamage={selectedAthlete.currentDamage}
              onSimulate={onSimulate}
            />
            <EvidenceVault traceLog={selectedAthlete.traceLog} />
          </div>
        </div>
      )}
    </div>
  );
}

function BioScanIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20" opacity="0.5" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
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
