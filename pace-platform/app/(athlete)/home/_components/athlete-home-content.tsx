"use client";

/**
 * アスリートホーム画面のクライアントコンテンツ
 *
 * /api/conditioning/[athleteId] からデータを取得し、
 * リング、インサイトカード、ブレークダウンカードを描画。
 */

import { useEffect, useState } from "react";
import { ConditioningRing } from "./conditioning-ring";
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

interface AthleteHomeContentProps {
  athleteId: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// ACWR ステータス判定
// ---------------------------------------------------------------------------

function getAcwrStatus(acwr: number): "good" | "caution" | "warning" {
  if (acwr >= 0.8 && acwr <= 1.3) return "good";
  if (acwr > 1.3 && acwr <= 1.5) return "caution";
  if (acwr > 1.5) return "warning";
  return "good"; // 低負荷は問題なし
}

function getScoreStatus(score: number): "good" | "caution" | "warning" {
  if (score >= 70) return "good";
  if (score >= 40) return "caution";
  return "warning";
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function AthleteHomeContent({
  athleteId,
  displayName,
}: AthleteHomeContentProps) {
  const [data, setData] = useState<ConditioningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/conditioning/${athleteId}`);
        const json = await res.json();

        if (!json.success) {
          setError(json.error ?? "データの取得に失敗しました。");
          return;
        }

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
      } catch {
        setError("ネットワークエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [athleteId]);

  // ローディング表示
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20">
        <div className="h-[220px] w-[220px] animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-20 w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid w-full grid-cols-1 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  // エラー表示
  if (error || !data) {
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

  const fitnessStatus = getScoreStatus(data.conditioningScore);
  const fatigueStatus: "good" | "caution" | "warning" =
    data.fatigueEwma > data.fitnessEwma ? "warning" : "good";
  const acwrStatus = getAcwrStatus(data.acwr);

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {displayName ? `${displayName} さん` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {data.date} 時点
        </p>
      </div>

      {/* コンディショニングスコアリング */}
      <div className="flex justify-center">
        <ConditioningRing score={data.conditioningScore} />
      </div>

      {/* AI インサイト */}
      <InsightCard insight={data.insight} />

      {/* ブレークダウンカード */}
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
