'use client';

/**
 * ScoreBucketBar — YouTube Analytics「視聴者層」風水平スタックバー
 *
 * Optimal / Caution / Recovery / No Data の4セグメントで
 * チームの選手分布を可視化する。
 */

import { useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface ScoreBucketBarProps {
  optimal: number;
  caution: number;
  recovery: number;
  noData: number;
  /** ホバー時に表示する選手名リスト */
  athleteNames?: {
    optimal: string[];
    caution: string[];
    recovery: string[];
    noData: string[];
  };
  /** 前日比の変動 */
  previousBuckets?: {
    optimal: number;
    caution: number;
    recovery: number;
  };
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function deltaArrow(current: number, previous: number): string {
  if (current > previous) return '\u2191';
  if (current < previous) return '\u2193';
  return '';
}

function deltaClass(current: number, previous: number, isPositive: boolean): string {
  if (current > previous) return isPositive ? 'text-emerald-500' : 'text-red-500';
  if (current < previous) return isPositive ? 'text-red-500' : 'text-emerald-500';
  return 'text-muted-foreground';
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function ScoreBucketBar({
  optimal,
  caution,
  recovery,
  noData,
  athleteNames,
  previousBuckets,
}: ScoreBucketBarProps) {
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);
  const total = optimal + caution + recovery + noData;

  if (total === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">選手データがありません</p>
      </div>
    );
  }

  const segments = [
    {
      key: 'optimal',
      label: '最適',
      count: optimal,
      color: 'bg-emerald-400',
      textColor: 'text-emerald-700',
      bgHover: 'bg-emerald-50',
    },
    {
      key: 'caution',
      label: '注意',
      count: caution,
      color: 'bg-amber-400',
      textColor: 'text-amber-700',
      bgHover: 'bg-amber-50',
    },
    {
      key: 'recovery',
      label: '回復',
      count: recovery,
      color: 'bg-red-400',
      textColor: 'text-red-700',
      bgHover: 'bg-red-50',
    },
    {
      key: 'noData',
      label: 'データなし',
      count: noData,
      color: 'bg-muted',
      textColor: 'text-muted-foreground',
      bgHover: 'bg-muted/50',
    },
  ].filter((s) => s.count > 0);

  const hoveredNames = hoveredBucket && athleteNames
    ? (athleteNames as Record<string, string[]>)[hoveredBucket] ?? []
    : [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        選手コンディション分布
      </h4>

      {/* スタックバー */}
      <div className="flex h-6 overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} relative cursor-pointer transition-opacity hover:opacity-80`}
            style={{ width: `${(seg.count / total) * 100}%` }}
            onMouseEnter={() => setHoveredBucket(seg.key)}
            onMouseLeave={() => setHoveredBucket(null)}
          >
            {seg.count / total >= 0.12 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {seg.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 凡例 + 前日比 */}
      <div className="mt-2 flex flex-wrap gap-3">
        {segments.map((seg) => {
          const prev = previousBuckets
            ? (previousBuckets as Record<string, number>)[seg.key]
            : undefined;
          const isPositiveDirection = seg.key === 'optimal';
          return (
            <div key={seg.key} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${seg.color}`} />
              <span className="text-[10px] text-muted-foreground">
                {seg.label}: {seg.count}
              </span>
              {prev !== undefined && (
                <span className={`text-[10px] font-medium ${deltaClass(seg.count, prev, isPositiveDirection)}`}>
                  {deltaArrow(seg.count, prev)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ホバー時の選手名リスト */}
      {hoveredBucket && hoveredNames.length > 0 && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            {segments.find((s) => s.key === hoveredBucket)?.label}:
          </p>
          <p className="text-xs text-foreground">
            {hoveredNames.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
