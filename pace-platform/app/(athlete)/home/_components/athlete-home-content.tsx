"use client";

/**
 * アスリートホーム画面のクライアントコンテンツ — v6.0
 *
 * 3-Layer Information Architecture:
 *   Layer 1: GlowingCore + Action of the Day（1秒で把握）
 *   Layer 2: PerformanceCompass + InsightCard（なぜそうなったか）
 *   Layer 3: BreakdownCards（数理証跡）
 *
 * v6 パイプライン API を優先的に使用し、フォールバックで既存 API を利用。
 */

import { useAthleteHome } from "@/hooks/use-athlete-home";
import { MetricLabel } from "@/app/_components/metric-label";
import { GlowingCore } from "./glowing-core";
import type { GlowingCoreProps } from "./glowing-core";
import { PerformanceCompass } from "./performance-compass";
import type { PerformanceCompassProps } from "./performance-compass";
import { InsightCard } from "./insight-card";
import { BreakdownCard } from "./breakdown-card";
import { KpiBreakdownRow } from "./kpi-breakdown-row";
import { DailyCoachCard } from "./daily-coach-card";
import { ConditioningFeed } from "./conditioning-feed";
import type { DailyFeedEntry } from "./conditioning-feed";
import { ConditioningTrendAthlete } from "./conditioning-trend-athlete";
import type { TrendDataPoint } from "./conditioning-trend-athlete";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ConditioningData {
  athleteId: string;
  date: string;
  conditioningScore: number;
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
  fitnessTrend: number[];
  fatigueTrend: number[];
  insight: string;
}

/** v6 パイプライン結果（利用可能な場合） */
interface V6PipelineResult {
  status: GlowingCoreProps["status"];
  score: number;
  actionOfDay: string;
  primaryTrigger?: string;
  compass: {
    recovery?: number;
    movement?: number;
    loadCapacity?: number;
    mentalReadiness?: number;
  };
  insight: string;
}

interface AthleteHomeContentProps {
  athleteId: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// コールドスタート期プログレスバー
// ---------------------------------------------------------------------------

function ColdStartProgress({ validDataDays }: { validDataDays: number }) {
  if (validDataDays >= 28) return null;

  const percent = Math.min(100, Math.round((validDataDays / 28) * 100));
  const isSafetyMode = validDataDays < 14;
  const daysRemaining = isSafetyMode ? 14 - validDataDays : 28 - validDataDays;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {isSafetyMode ? "パーソナライズ学習中" : "Z-Scoreエンジン稼働中"}
        </span>
        <span className="text-xs font-bold tabular-nums text-primary">
          {validDataDays}/28日
        </span>
      </div>

      {/* プログレスバー */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 説明文 */}
      <p className="mt-2 text-xs text-muted-foreground">
        {isSafetyMode
          ? `セーフティモードで動作中です。あと ${daysRemaining} 日で学習フェーズに移行します。`
          : `あと ${daysRemaining} 日で全推論エンジンがアンロックされます。`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ステータス判定（既存 API フォールバック用）
// ---------------------------------------------------------------------------

function scoreToStatus(
  score: number
): GlowingCoreProps["status"] {
  if (score >= 85) return "TEAL";
  if (score >= 70) return "GREEN";
  if (score >= 60) return "YELLOW";
  if (score >= 40) return "ORANGE";
  return "RED";
}

// MASTER-SPEC M4: safe(<0.8)/optimal(0.8-1.3)/caution(1.3-1.5)/danger(>1.5)
function getAcwrStatus(acwr: number): "good" | "caution" | "danger" {
  if (acwr >= 0.8 && acwr <= 1.3) return "good";
  if (acwr > 1.3 && acwr <= 1.5) return "caution";
  if (acwr > 1.5) return "danger";
  return "good";
}

function getScoreStatus(score: number): "good" | "caution" | "danger" {
  if (score >= 70) return "good";
  if (score >= 40) return "caution";
  return "danger";
}

function generateDefaultAction(score: number): string {
  if (score >= 80) return "通常トレーニングを継続してください";
  if (score >= 60) return "ウォーミングアップを入念に行い、負荷を調整してください";
  if (score >= 40) return "軽めのリカバリーセッションを推奨します";
  return "完全休養を取り、スタッフに報告してください";
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function AthleteHomeContent({
  athleteId,
  displayName,
}: AthleteHomeContentProps) {
  // React Query でデータ取得（キャッシュ有効、ページ遷移時の再fetch排除）
  const { data: homeData, isLoading: loading, error: queryError } = useAthleteHome(athleteId);

  const v6Data = homeData?.v6 as V6PipelineResult | undefined ?? null;
  const data: ConditioningData | null = homeData?.conditioning
    ? {
        athleteId,
        date: homeData.conditioning.latestDate,
        conditioningScore: homeData.conditioning.conditioningScore,
        fitnessEwma: homeData.conditioning.fitnessEwma,
        fatigueEwma: homeData.conditioning.fatigueEwma,
        acwr: homeData.conditioning.acwr,
        fitnessTrend: homeData.conditioning.fitnessTrend,
        fatigueTrend: homeData.conditioning.fatigueTrend,
        insight: homeData.conditioning.insight,
      }
    : null;
  const trendDirection = homeData?.conditioning?.trendDirection ?? null;
  const trendData: TrendDataPoint[] = (homeData?.conditioning?.trendData ?? []).map((t) => ({
    date: t.date,
    conditioningScore: t.conditioning_score,
    fitnessEwma: t.fitness_ewma,
    fatigueEwma: t.fatigue_ewma,
    acwr: t.acwr,
  }));
  const feedEntries: DailyFeedEntry[] = homeData?.conditioning?.feedEntries ?? [];
  const validDataDays = homeData?.validDataDays ?? null;
  const error = queryError ? "データの取得に失敗しました。" : null;

  // ──────── ローディング ────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20">
        <div className="h-[240px] w-[240px] animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-16 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-[280px] w-[280px] animate-pulse rounded-full bg-muted" />
        <div className="mt-2 h-20 w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid w-full grid-cols-1 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  // ──────── エラー ────────

  if (error || (!data && !v6Data)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20">
        <div className="rounded-xl border border-critical-200 bg-critical-50 p-4 text-center">
          <p className="text-sm text-critical-700">
            {error ?? "データを取得できませんでした。"}
          </p>
          <p className="mt-2 text-xs text-critical-500">
            チェックインデータがない場合は、まずチェックインを行ってください。
          </p>
        </div>
      </div>
    );
  }

  // ──────── データ解決 ────────

  const score = v6Data?.score ?? data?.conditioningScore ?? 0;
  const status = v6Data?.status ?? scoreToStatus(score);
  const actionOfDay =
    v6Data?.actionOfDay ?? generateDefaultAction(score);
  const primaryTrigger = v6Data?.primaryTrigger;
  const insight = v6Data?.insight ?? data?.insight ?? "";

  // Compass データ（v6 があれば使用、なければ既存データから推定）
  const compassProps: PerformanceCompassProps = {
    recovery: {
      score: v6Data?.compass.recovery ?? (data ? Math.round(100 - data.fatigueEwma) : undefined),
    },
    movement: {
      score: v6Data?.compass.movement,
    },
    loadCapacity: {
      score:
        v6Data?.compass.loadCapacity ??
        (data
          ? Math.round(
              Math.max(
                0,
                Math.min(100, (1 - Math.abs(data.acwr - 1.1) / 0.9) * 100)
              )
            )
          : undefined),
    },
    mentalReadiness: {
      score: v6Data?.compass.mentalReadiness,
    },
  };

  // BreakdownCard 用ステータス
  const fitnessStatus = data ? getScoreStatus(data.conditioningScore) : "good";
  const fatigueStatus: "good" | "caution" | "danger" =
    data && data.fatigueEwma > data.fitnessEwma ? "danger" : "good";
  const acwrStatus = data ? getAcwrStatus(data.acwr) : "good";

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {displayName ? `${displayName} さん` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {data?.date ?? new Date().toISOString().split("T")[0]} 時点
        </p>
      </div>

      {/* コールドスタート期プログレスバー */}
      {validDataDays !== null && <ColdStartProgress validDataDays={validDataDays} />}

      {/* Strava風 コンディションサマリ + トレンド */}
      {data && (
        <div className="rounded-xl bg-primary/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground">
              {data.conditioningScore >= 70
                ? `${displayName || 'あなた'}のコンディションは良好です。計画通りのトレーニングを実施できます。`
                : data.conditioningScore >= 50
                  ? `やや疲労が見られます。ウォーミングアップを入念に行い、強度を調整してください。`
                  : data.conditioningScore >= 30
                    ? `回復が追いついていません。リカバリーメニューへの切り替えを推奨します。`
                    : `休養が必要です。スタッフに報告してください。`}
            </p>
            {trendDirection && (
              <span
                className={`ml-2 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  trendDirection === 'improving'
                    ? 'bg-emerald-100 text-emerald-700'
                    : trendDirection === 'declining'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {trendDirection === 'improving' && '\u2191'}
                {trendDirection === 'declining' && '\u2193'}
                {trendDirection === 'stable' && '\u2192'}
                {trendDirection === 'improving'
                  ? '改善中'
                  : trendDirection === 'declining'
                    ? '低下傾向'
                    : '安定'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ Layer 1: ステータス一目把握 ═══ */}
      <div className="info-layer-status flex justify-center">
        <GlowingCore
          score={score}
          status={status}
          actionOfDay={actionOfDay}
          primaryTrigger={primaryTrigger}
        />
      </div>

      {/* KPI サブ指標（3カード横並び） */}
      {data && (
        <KpiBreakdownRow
          fitnessEwma={data.fitnessEwma}
          fatigueEwma={data.fatigueEwma}
          acwr={data.acwr}
        />
      )}

      {/* ═══ Layer 2: ナラティブ ═══ */}
      <div className="info-layer-narrative flex flex-col gap-4">
        {/* M5: AI デイリーコーチ */}
        <DailyCoachCard
          score={score}
          displayName={displayName}
          actionOfDay={actionOfDay}
        />

        {/* パフォーマンスコンパス */}
        <div className="flex justify-center">
          <PerformanceCompass {...compassProps} />
        </div>

        {/* AI インサイト（insight がなくてもフォールバックテンプレートを表示） */}
        <InsightCard insight={insight || undefined} score={score} />
      </div>

      {/* ═══ Layer 3: わかりやすい指標（二層表現） ═══ */}
      {data && (
        <div className="info-layer-evidence flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            あなたの数値
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <MetricLabel metricId="readiness" value={data.conditioningScore} mode="athlete" />
            <MetricLabel metricId="acwr" value={data.acwr} mode="athlete" />
            <MetricLabel metricId="fitness" value={data.fitnessEwma} mode="athlete" />
            <MetricLabel metricId="fatigue" value={data.fatigueEwma} mode="athlete" />
          </div>

          {/* 詳細チャート */}
          <BreakdownCard
            label="残り体力 / HP"
            value={data.fitnessEwma}
            unit="42日 EWMA"
            trend={data.fitnessTrend}
            status={fitnessStatus}
            type="sparkline"
            delay={100}
          />

          <BreakdownCard
            label="疲労の推移"
            value={data.fatigueEwma}
            unit="7日 EWMA"
            trend={data.fatigueTrend}
            status={fatigueStatus}
            type="sparkline"
            delay={200}
          />

          <BreakdownCard
            label="負荷バランス"
            value={data.acwr}
            status={acwrStatus}
            type="gauge"
            gaugeValue={data.acwr}
            delay={300}
          />
        </div>
      )}

      {/* ═══ Layer 4: Strava風コンディショニングトレンド ═══ */}
      {trendData.length > 0 && (
        <ConditioningTrendAthlete data={trendData} />
      )}

      {/* ═══ Layer 5: Strava風デイリーフィード ═══ */}
      {feedEntries.length > 0 && (
        <ConditioningFeed entries={feedEntries} />
      )}
    </div>
  );
}
