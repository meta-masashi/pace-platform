'use client';

/**
 * Layer 1: 生体ステータス・サマリー (The Bio-Overview)
 *
 * 3ブロック構成:
 *   左: Hero Metric（チーム戦力化スコア / ハーフドーナツゲージ）
 *   中: Vital Signs（CAT入力完了率 + チーム平均ACWR）
 *   右: Contextual Actions（要注意アラート + 動的アクションボタン）
 *
 * 監督が朝起きて0.1秒で「今日の戦力状況」を直感できるUI。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface BioOverviewData {
  /** チーム稼働率 (0-100) */
  teamReadiness: number;
  /** フルメニュー消化可能人数 */
  availableCount: number;
  /** チーム全体人数 */
  totalCount: number;
  /** 前日比 */
  trendDelta: number;
  /** CAT入力完了率 (0-100) */
  checkinRate: number;
  /** 未入力者数 */
  uncheckedCount: number;
  /** チーム平均ACWR */
  teamAcwr: number;
  /** 要注意人数 */
  watchCriticalCount: number;
}

interface BioOverviewProps {
  data: BioOverviewData;
  onAlertAction: () => void;
}

// ---------------------------------------------------------------------------
// ハーフドーナツゲージ
// ---------------------------------------------------------------------------

function HalfDonutGauge({ value, color }: { value: number; color: string }) {
  const SIZE = 160;
  const STROKE = 12;
  const R = (SIZE - STROKE) / 2;
  const C = Math.PI * R; // 半円の円周
  const offset = C - (Math.min(100, Math.max(0, value)) / 100) * C;

  const gaugeRef = useRef<SVGCircleElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <svg
      width={SIZE}
      height={SIZE / 2 + 10}
      viewBox={`0 0 ${SIZE} ${SIZE / 2 + 10}`}
      className="overflow-visible"
    >
      {/* 背景トラック */}
      <path
        d={`M ${STROKE / 2} ${SIZE / 2} A ${R} ${R} 0 0 1 ${SIZE - STROKE / 2} ${SIZE / 2}`}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      {/* 値ゲージ */}
      <path
        ref={gaugeRef}
        d={`M ${STROKE / 2} ${SIZE / 2} A ${R} ${R} 0 0 1 ${SIZE - STROKE / 2} ${SIZE / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={mounted ? offset : C}
        className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 左ブロック: Hero Metric
// ---------------------------------------------------------------------------

function HeroMetricBlock({
  teamReadiness,
  availableCount,
  totalCount,
  trendDelta,
}: {
  teamReadiness: number;
  availableCount: number;
  totalCount: number;
  trendDelta: number;
}) {
  const color =
    teamReadiness >= 80 ? '#10b981' : teamReadiness >= 60 ? '#FF9F29' : '#FF4B4B';

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <HalfDonutGauge value={teamReadiness} color={color} />
        {/* 中央テキスト */}
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p
            className="font-label text-kpi-lg font-bold tabular-nums"
            style={{ color }}
          >
            {teamReadiness}%
          </p>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        Team Readiness
      </p>
      <p className="text-[10px] text-muted-foreground">
        {availableCount}/{totalCount}名がフルメニュー消化可能
      </p>
      {trendDelta !== 0 && (
        <span
          className={`mt-0.5 text-[10px] font-medium ${
            trendDelta > 0 ? 'text-optimal-500' : 'text-critical-500'
          }`}
        >
          {trendDelta > 0 ? '\u2191' : '\u2193'} {trendDelta > 0 ? '+' : ''}
          {trendDelta}% (vs 昨晩)
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 中央ブロック: Vital Signs
// ---------------------------------------------------------------------------

function VitalSignsBlock({
  checkinRate,
  uncheckedCount,
  teamAcwr,
}: {
  checkinRate: number;
  uncheckedCount: number;
  teamAcwr: number;
}) {
  const checkinColor =
    checkinRate >= 100 ? 'text-optimal-500' : 'text-critical-500';
  const acwrColor =
    teamAcwr >= 0.8 && teamAcwr <= 1.3
      ? 'text-optimal-500'
      : teamAcwr > 1.5
        ? 'text-critical-500'
        : 'text-watchlist-500';

  return (
    <div className="flex flex-col gap-4">
      {/* CAT入力完了率 */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          CAT入力完了率（データ信頼度）
        </p>
        <p className={`mt-1 font-label text-kpi-md font-bold tabular-nums ${checkinColor}`}>
          {checkinRate}%
        </p>
        {uncheckedCount > 0 && (
          <p className="text-[10px] font-medium text-critical-500">
            未入力 {uncheckedCount}名
          </p>
        )}
      </div>

      {/* チーム平均ACWR */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          チーム平均 ACWR
        </p>
        <p className={`mt-1 font-label text-kpi-md font-bold tabular-nums ${acwrColor}`}>
          {teamAcwr.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 右ブロック: Contextual Actions
// ---------------------------------------------------------------------------

function ContextualActionsBlock({
  watchCriticalCount,
  onAlertAction,
}: {
  watchCriticalCount: number;
  onAlertAction: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-3">
      {/* アラートサマリー */}
      <div className="text-right">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          本日の要注意
        </p>
        <p className="mt-1 font-label text-kpi-md font-bold tabular-nums text-destructive">
          {watchCriticalCount}名
        </p>
      </div>

      {/* アクションボタン */}
      <button
        type="button"
        onClick={onAlertAction}
        disabled={watchCriticalCount === 0}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* カードスタックアイコン */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="16" height="14" rx="2" />
          <rect x="6" y="3" width="16" height="14" rx="2" opacity="0.6" />
        </svg>
        {watchCriticalCount > 0
          ? `要注意の${watchCriticalCount}名にメッセージ`
          : '異常なし'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export function BioOverview({ data, onAlertAction }: BioOverviewProps) {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* 左: Hero Metric */}
        <HeroMetricBlock
          teamReadiness={data.teamReadiness}
          availableCount={data.availableCount}
          totalCount={data.totalCount}
          trendDelta={data.trendDelta}
        />

        {/* 中央: Vital Signs */}
        <VitalSignsBlock
          checkinRate={data.checkinRate}
          uncheckedCount={data.uncheckedCount}
          teamAcwr={data.teamAcwr}
        />

        {/* 右: Contextual Actions */}
        <ContextualActionsBlock
          watchCriticalCount={data.watchCriticalCount}
          onAlertAction={onAlertAction}
        />
      </div>
    </div>
  );
}
