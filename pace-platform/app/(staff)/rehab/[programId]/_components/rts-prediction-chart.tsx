'use client';

/**
 * RTS 予測チャートコンポーネント
 *
 * シグモイド回復モデルに基づく予測カーブと実績をオーバーレイ表示する。
 * Recharts の AreaChart を使用し、マイルストーンとスレッショルドを可視化。
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

/**
 * Recharts チャート描画部（SSR 無効の動的インポート）
 */
const RecoveryCurveChart = dynamic(
  () => import('./recovery-curve-chart').then((m) => ({ default: m.RecoveryCurveChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CurveDataPoint {
  date: string;
  predictedProgress: number;
  actualProgress?: number;
  phase: number;
}

interface MilestoneData {
  phase: number;
  gateName: string;
  targetDate: string;
  currentProgress: number;
  isOnTrack: boolean;
  daysRemaining: number;
}

interface PredictionData {
  athleteId: string;
  programId: string;
  currentPhase: number;
  estimatedRTSDate: string;
  confidence: number;
  milestones: MilestoneData[];
  dailyRecoveryRate: number;
  riskFactors: Array<{
    nodeId: string;
    description: string;
    impact: string;
    estimatedDaysImpact: number;
  }>;
}

interface RTSResponse {
  success: boolean;
  data?: {
    prediction: PredictionData;
    curve: CurveDataPoint[];
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * RTS 予測チャート
 *
 * 復帰予測のシグモイドカーブと実績データを重ねて表示する。
 */
export function RTSPredictionChart({ programId }: { programId: string }) {
  const [data, setData] = useState<RTSResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rts/predict?programId=${programId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: RTSResponse = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error ?? '予測データの取得に失敗しました');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '予測データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchPrediction();
  }, [fetchPrediction]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-sm text-muted-foreground">復帰予測を計算中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          復帰予測の取得に失敗しました: {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { prediction, curve } = data;
  const rtsDate = new Date(prediction.estimatedRTSDate);
  const today = new Date();
  const daysToRTS = Math.ceil(
    (rtsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 現在日の文字列
  const todayStr = formatDate(today);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">復帰予測タイムライン</h2>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            信頼度 {prediction.confidence}%
          </span>
          <span className="text-sm text-muted-foreground">
            回復率 {prediction.dailyRecoveryRate.toFixed(1)}%/日
          </span>
        </div>
      </div>

      {/* RTS 予測サマリー */}
      <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/10">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">
          現在のペースであと
          <span className="mx-1 text-lg font-bold">{daysToRTS}</span>
          日で合流可能確率90%に到達
        </p>
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-500">
          予測復帰日: {formatDateJP(rtsDate)}
        </p>
      </div>

      {/* チャート */}
      <RecoveryCurveChart curve={curve} todayStr={todayStr} />

      {/* マイルストーン */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">フェーズマイルストーン</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {prediction.milestones.map((ms) => (
            <div
              key={ms.phase}
              className={`rounded-lg border p-3 ${
                ms.currentProgress >= 100
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10'
                  : ms.isOnTrack
                    ? 'border-border bg-background'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  Phase {ms.phase}: {ms.gateName}
                </span>
                {ms.currentProgress >= 100 ? (
                  <span className="text-xs text-emerald-600">完了</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    残り{ms.daysRemaining}日
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-1.5 rounded-full ${
                    ms.currentProgress >= 100
                      ? 'bg-emerald-500'
                      : ms.isOnTrack
                        ? 'bg-blue-500'
                        : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, ms.currentProgress)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateJP(new Date(ms.targetDate))} まで
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* リスク要因 */}
      {prediction.riskFactors.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">リスク要因</h3>
          <div className="space-y-1">
            {prediction.riskFactors.map((rf, i) => (
              <div
                key={`${rf.nodeId}-${i}`}
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/10"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-xs text-red-700 dark:text-red-400">
                    {rf.description}
                  </p>
                  <p className="mt-0.5 text-xs text-red-500">
                    影響: +{rf.estimatedDaysImpact}日
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** YYYY-MM-DD 形式にフォーマットする */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 日本語の日付表示にフォーマットする */
function formatDateJP(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
