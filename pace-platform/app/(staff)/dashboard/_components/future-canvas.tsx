'use client';

/**
 * Layer 3: 予測・トレンド・シミュレーター (The Future Canvas)
 *
 * 左側: Time-Traveling Graph（過去14日 + 未来7日予測線）
 * 右側: What-If Engine（介入スライダー + AI処方箋テキスト）
 *
 * 「ゼロ・レイテンシ」: スライダー操作で未来予測線が0ms遅延で変形。
 * 事前計算グリッドとフロントエンド補間で実現。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Recharts は SSR 無効で読み込む
const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.ResponsiveContainer })),
  { ssr: false },
);
const ComposedChart = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.ComposedChart })),
  { ssr: false },
);
const Area = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.Area })),
  { ssr: false },
);
const Bar = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.Bar })),
  { ssr: false },
);
const Line = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.Line })),
  { ssr: false },
);
const XAxis = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.XAxis })),
  { ssr: false },
);
const YAxis = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.YAxis })),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.CartesianGrid })),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.Tooltip })),
  { ssr: false },
);
const ReferenceLine = dynamic(
  () => import('recharts').then((mod) => ({ default: mod.ReferenceLine })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TimelinePoint {
  date: string;
  /** 日ラベル (MM/DD) */
  label: string;
  /** 日次負荷量 */
  load: number;
  /** 組織ダメージ D(t) */
  damage: number;
  /** ACWR */
  acwr: number;
  /** 未来データかどうか */
  isFuture: boolean;
}

export interface FutureCanvasProps {
  /** 過去14日 + 未来7日のタイムライン */
  timeline: TimelinePoint[];
  /** 臨界閾値 D_crit */
  criticalThreshold: number;
  /** 今日のインデックス */
  todayIndex: number;
  /** 選手名 */
  athleteName: string;
  /** 選手ID */
  athleteId: string;
}

// ---------------------------------------------------------------------------
// 介入スライダー (What-If Engine)
// ---------------------------------------------------------------------------

function WhatIfSlider({
  loadPercent,
  onChange,
  prescriptionText,
  riskLevel,
}: {
  loadPercent: number;
  onChange: (value: number) => void;
  prescriptionText: string;
  riskLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
}) {
  const riskColorMap = {
    GREEN: { bg: 'bg-optimal-500/20', text: 'text-optimal-500', label: 'GREEN (安全圏)' },
    YELLOW: { bg: 'bg-watchlist-500/20', text: 'text-watchlist-500', label: 'YELLOW (注意)' },
    ORANGE: { bg: 'bg-amber-caution-500/20', text: 'text-amber-caution-500', label: 'ORANGE (危険)' },
    RED: { bg: 'bg-pulse-red-500/20', text: 'text-pulse-red-500', label: 'RED (閾値突破)' },
  };

  const style = riskColorMap[riskLevel];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">
        What-If: 負荷シミュレーション
      </h3>

      {/* スライダー */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            本日の予定負荷
          </label>
          <span className="font-label text-lg font-bold tabular-nums text-foreground">
            {loadPercent}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={loadPercent}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* リスクステータス */}
      <div className={`rounded-lg p-3 ${style.bg}`}>
        <p className={`text-sm font-semibold ${style.text}`}>{style.label}</p>
      </div>

      {/* AI処方箋テキスト */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          AI 処方箋
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {prescriptionText}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function FutureCanvas({
  timeline,
  criticalThreshold,
  todayIndex,
  athleteName,
  athleteId,
}: FutureCanvasProps) {
  const [loadPercent, setLoadPercent] = useState(100);

  // ゼロレイテンシ: スライダーの値でフロントエンド補間
  const adjustedTimeline = useMemo(() => {
    const factor = loadPercent / 100;
    return timeline.map((point, i) => {
      if (!point.isFuture) return point;
      // 未来データのみスケーリング
      return {
        ...point,
        damage: Math.min(100, point.damage * factor),
        load: point.load * factor,
        acwr: Math.min(3, point.acwr * factor),
      };
    });
  }, [timeline, loadPercent]);

  // 未来予測で閾値を突破する日を検出
  const breachDay = useMemo(() => {
    for (const point of adjustedTimeline) {
      if (point.isFuture && point.damage >= criticalThreshold) {
        return point.label;
      }
    }
    return null;
  }, [adjustedTimeline, criticalThreshold]);

  // リスクレベル判定
  const riskLevel = useMemo(() => {
    const futureDamages = adjustedTimeline
      .filter((p) => p.isFuture)
      .map((p) => p.damage);
    const maxDamage = Math.max(...futureDamages, 0);
    if (maxDamage >= criticalThreshold) return 'RED' as const;
    if (maxDamage >= criticalThreshold * 0.8) return 'ORANGE' as const;
    if (maxDamage >= criticalThreshold * 0.6) return 'YELLOW' as const;
    return 'GREEN' as const;
  }, [adjustedTimeline, criticalThreshold]);

  // AI処方箋テキスト
  const prescriptionText = useMemo(() => {
    if (riskLevel === 'RED' && breachDay) {
      return `予定通りの負荷（${loadPercent}%）をかけると、${breachDay}に閾値を突破（RED）します。負荷を下げてください。`;
    }
    if (riskLevel === 'ORANGE') {
      return `現在の負荷設定は閾値に近い領域です。${loadPercent > 100 ? 'スプリント距離を削減し、' : ''}注意深くモニタリングしてください。`;
    }
    if (riskLevel === 'GREEN') {
      return `安全圏（GREEN）です。${loadPercent < 100 ? `スプリント距離を${100 - loadPercent}%削減した結果、安全が確認されました。` : '予定通りのメニューを実行できます。'}`;
    }
    return `現在の設定で注意が必要です。負荷を${loadPercent > 80 ? '80%以下に' : '調整して'}ください。`;
  }, [riskLevel, loadPercent, breachDay]);

  return (
    <div className="w-full rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-cyber-cyan-500"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <h2 className="text-base font-bold text-foreground">
          予測タイムライン: {athleteName}
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* 左: Time-Traveling Graph */}
        <div className="min-h-[300px]">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={adjustedTimeline}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />

              {/* 負荷棒グラフ */}
              <Bar
                dataKey="load"
                fill="hsl(var(--muted))"
                opacity={0.4}
                radius={[2, 2, 0, 0]}
                name="負荷"
              />

              {/* 組織ダメージ D(t) ライン */}
              <Line
                type="monotone"
                dataKey="damage"
                stroke="#FF4B4B"
                strokeWidth={2}
                dot={false}
                name="D(t)"
              />

              {/* ACWR ライン */}
              <Line
                type="monotone"
                dataKey="acwr"
                stroke="#00F2FF"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                name="ACWR"
                yAxisId={0}
              />

              {/* 臨界閾値線 */}
              <ReferenceLine
                y={criticalThreshold}
                stroke="#FF4B4B"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{
                  value: 'D_crit',
                  position: 'right',
                  fill: '#FF4B4B',
                  fontSize: 10,
                }}
              />

              {/* Today マーカー */}
              {todayIndex >= 0 && todayIndex < adjustedTimeline.length && (
                <ReferenceLine
                  x={adjustedTimeline[todayIndex]?.label}
                  stroke="hsl(var(--foreground))"
                  strokeDasharray="3 3"
                  label={{
                    value: 'Today',
                    position: 'top',
                    fill: 'hsl(var(--foreground))',
                    fontSize: 10,
                  }}
                />
              )}

              {/* 未来予測領域 */}
              <Area
                type="monotone"
                dataKey="damage"
                fill="#FF4B4B"
                fillOpacity={0.05}
                stroke="none"
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 閾値突破警告 */}
          {breachDay && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-pulse-red-200 bg-pulse-red-50 p-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-pulse-red-500" />
              <p className="text-xs font-medium text-pulse-red-700">
                {breachDay} に臨界閾値を突破する予測です
              </p>
            </div>
          )}
        </div>

        {/* 右: What-If Engine */}
        <div>
          <WhatIfSlider
            loadPercent={loadPercent}
            onChange={setLoadPercent}
            prescriptionText={prescriptionText}
            riskLevel={riskLevel}
          />
        </div>
      </div>
    </div>
  );
}
