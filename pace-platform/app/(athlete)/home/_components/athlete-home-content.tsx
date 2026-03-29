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

import { useEffect, useState } from "react";
import { GlowingCore } from "./glowing-core";
import type { GlowingCoreProps } from "./glowing-core";
import { PerformanceCompass } from "./performance-compass";
import type { PerformanceCompassProps } from "./performance-compass";
import { InsightCard } from "./insight-card";
import { BreakdownCard } from "./breakdown-card";

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
// ステータス判定（既存 API フォールバック用）
// ---------------------------------------------------------------------------

function scoreToStatus(
  score: number
): GlowingCoreProps["status"] {
  if (score >= 70) return "GREEN";
  if (score >= 50) return "YELLOW";
  if (score >= 30) return "ORANGE";
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
  const [data, setData] = useState<ConditioningData | null>(null);
  const [v6Data, setV6Data] = useState<V6PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // v6 パイプライン API を試行
        let v6Result: V6PipelineResult | null = null;
        try {
          const v6Res = await fetch(`/api/v6/inference/${athleteId}`);
          if (v6Res.ok) {
            const v6Json = await v6Res.json();
            if (v6Json.success && v6Json.data) {
              v6Result = v6Json.data as V6PipelineResult;
              setV6Data(v6Result);
            }
          }
        } catch {
          // v6 API 未実装の場合は無視
        }

        // 既存 API（フォールバック / ブレークダウン用データ）
        const res = await fetch(`/api/conditioning/${athleteId}`);
        const json = await res.json();

        if (!json.success) {
          // v6 データがあれば既存 API エラーは許容
          if (!v6Result) {
            setError(json.error ?? "データの取得に失敗しました。");
            return;
          }
        } else {
          const d = json.data;
          setData({
            athleteId: d.athlete_id,
            date: d.latest_date,
            conditioningScore: d.current.conditioningScore,
            fitnessEwma: d.current.fitnessEwma,
            fatigueEwma: d.current.fatigueEwma,
            acwr: d.current.acwr,
            fitnessTrend: d.fitnessTrend,
            fatigueTrend: d.fatigueTrend,
            insight: d.insight,
          });
        }
      } catch {
        setError("ネットワークエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [athleteId]);

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

      {/* ═══ Layer 1: ステータス一目把握 ═══ */}
      <div className="info-layer-status flex justify-center">
        <GlowingCore
          score={score}
          status={status}
          actionOfDay={actionOfDay}
          primaryTrigger={primaryTrigger}
        />
      </div>

      {/* ═══ Layer 2: ナラティブ ═══ */}
      <div className="info-layer-narrative flex flex-col gap-4">
        {/* パフォーマンスコンパス */}
        <div className="flex justify-center">
          <PerformanceCompass {...compassProps} />
        </div>

        {/* AI インサイト */}
        {insight && <InsightCard insight={insight} />}
      </div>

      {/* ═══ Layer 3: エビデンス（ブレークダウン） ═══ */}
      {data && (
        <div className="info-layer-evidence flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            詳細データ
          </h3>

          <BreakdownCard
            label="フィットネス蓄積"
            value={data.fitnessEwma}
            unit="42日 EWMA"
            trend={data.fitnessTrend}
            status={fitnessStatus}
            type="sparkline"
            delay={100}
          />

          <BreakdownCard
            label="疲労負荷"
            value={data.fatigueEwma}
            unit="7日 EWMA"
            trend={data.fatigueTrend}
            status={fatigueStatus}
            type="sparkline"
            delay={200}
          />

          <BreakdownCard
            label="ACWR"
            value={data.acwr}
            status={acwrStatus}
            type="gauge"
            gaugeValue={data.acwr}
            delay={300}
          />
        </div>
      )}
    </div>
  );
}
