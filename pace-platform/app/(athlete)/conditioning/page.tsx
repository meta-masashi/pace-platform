'use client';

/**
 * アスリート コンディショニング詳細ページ
 *
 * Strava の「週間サマリー」風のフルページ表示。
 * 週間平均スコア、最高/最低日、トレンド分類、
 * Fitness-Fatigue バランスチャート（30日間）を表示。
 */

import { useAthleteHome } from '@/hooks/use-athlete-home';
import { useEffect, useState } from 'react';
import { ConditioningTrendAthlete } from '../home/_components/conditioning-trend-athlete';
import type { TrendDataPoint } from '../home/_components/conditioning-trend-athlete';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface WeeklySummary {
  avgScore: number;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  avgAcwr: number;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function computeWeeklySummary(
  data: Array<{ date: string; conditioning_score: number | null; acwr: number | null }>,
): WeeklySummary {
  const recent7 = data.slice(-7);
  const validScores = recent7.filter(
    (d) => d.conditioning_score !== null,
  ) as Array<{ date: string; conditioning_score: number; acwr: number | null }>;

  if (validScores.length === 0) {
    return { avgScore: 0, bestDay: null, worstDay: null, avgAcwr: 0 };
  }

  const sum = validScores.reduce((s, d) => s + d.conditioning_score, 0);
  const avg = Math.round((sum / validScores.length) * 10) / 10;

  const sorted = [...validScores].sort(
    (a, b) => b.conditioning_score - a.conditioning_score,
  );
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;

  const acwrValues = validScores
    .map((d) => d.acwr)
    .filter((v): v is number => v !== null);
  const avgAcwr =
    acwrValues.length > 0
      ? Math.round((acwrValues.reduce((s, v) => s + v, 0) / acwrValues.length) * 100) / 100
      : 0;

  return {
    avgScore: avg,
    bestDay: { date: best.date, score: best.conditioning_score },
    worstDay: { date: worst.date, score: worst.conditioning_score },
    avgAcwr,
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-optimal-500';
  if (score >= 40) return 'text-watchlist-500';
  return 'text-critical-500';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-emerald-100';
  if (score >= 40) return 'bg-amber-100';
  return 'bg-red-100';
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export default function ConditioningPage() {
  const [athleteId, setAthleteId] = useState<string | null>(null);

  // アスリート ID を取得（ローカルストレージ or URL）
  useEffect(() => {
    // Next.js App Router ではルートパラメータを使うが、
    // ここではアスリート側なので自分の ID をセッションから取得
    const stored = localStorage.getItem('athlete_id');
    if (stored) setAthleteId(stored);
  }, []);

  const { data: homeData, isLoading } = useAthleteHome(athleteId ?? '');

  if (!athleteId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">アスリート情報を読み込んでいます...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-[200px] animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  const trendRaw = homeData?.conditioning?.trendData ?? [];
  const trendData: TrendDataPoint[] = trendRaw.map((t) => ({
    date: t.date,
    conditioningScore: t.conditioning_score,
    fitnessEwma: t.fitness_ewma,
    fatigueEwma: t.fatigue_ewma,
    acwr: t.acwr,
  }));
  const trendDirection = homeData?.conditioning?.trendDirection ?? 'stable';
  const summary = computeWeeklySummary(trendRaw);

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* ヘッダー */}
      <div>
        <h1 className="text-lg font-bold">コンディション詳細</h1>
        <p className="text-xs text-muted-foreground">直近の推移と週間サマリー</p>
      </div>

      {/* 週間サマリー（Strava風） */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          今週のサマリー
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {/* 平均スコア */}
          <div className={`rounded-lg p-3 text-center ${scoreBg(summary.avgScore)}`}>
            <p className="text-[10px] font-medium text-muted-foreground">平均スコア</p>
            <p className={`text-2xl font-bold tabular-nums ${scoreColor(summary.avgScore)}`}>
              {summary.avgScore}
            </p>
            <p className={`text-[10px] font-medium ${
              trendDirection === 'improving'
                ? 'text-emerald-600'
                : trendDirection === 'declining'
                  ? 'text-red-600'
                  : 'text-muted-foreground'
            }`}>
              {trendDirection === 'improving' && '\u2191 改善中'}
              {trendDirection === 'declining' && '\u2193 低下傾向'}
              {trendDirection === 'stable' && '\u2192 安定'}
            </p>
          </div>

          {/* ベストデー */}
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground">ベストデー</p>
            {summary.bestDay ? (
              <>
                <p className="text-2xl font-bold tabular-nums text-optimal-500">
                  {summary.bestDay.score}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(summary.bestDay.date)}
                </p>
              </>
            ) : (
              <p className="text-lg text-muted-foreground">--</p>
            )}
          </div>

          {/* 平均ACWR */}
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground">平均ACWR</p>
            <p className={`text-2xl font-bold tabular-nums ${
              summary.avgAcwr >= 0.8 && summary.avgAcwr <= 1.3
                ? 'text-optimal-500'
                : summary.avgAcwr > 1.3 && summary.avgAcwr <= 1.5
                  ? 'text-watchlist-500'
                  : 'text-critical-500'
            }`}>
              {summary.avgAcwr}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {summary.avgAcwr >= 0.8 && summary.avgAcwr <= 1.3
                ? '安全ゾーン'
                : summary.avgAcwr > 1.5
                  ? '過負荷リスク'
                  : '注意ゾーン'}
            </p>
          </div>
        </div>
      </div>

      {/* トレンドチャート */}
      {trendData.length > 0 && (
        <ConditioningTrendAthlete data={trendData} />
      )}

      {/* Pro Mode: HRV 情報（利用可能な場合） */}
      {homeData?.conditioning && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fitness-Fatigue バランス
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-500 font-medium">Fitness</span>
                <span className="font-bold tabular-nums">{homeData.conditioning.fitnessEwma.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.min(100, homeData.conditioning.fitnessEwma)}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-400 font-medium">Fatigue</span>
                <span className="font-bold tabular-nums">{homeData.conditioning.fatigueEwma.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-red-400 transition-all"
                  style={{ width: `${Math.min(100, homeData.conditioning.fatigueEwma)}%` }}
                />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            {homeData.conditioning.fitnessEwma > homeData.conditioning.fatigueEwma
              ? 'フィットネスが疲労を上回っています。良好な状態です。'
              : '疲労がフィットネスを上回っています。リカバリーを意識してください。'}
          </p>
        </div>
      )}
    </div>
  );
}
