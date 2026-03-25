"use client";

/**
 * パフォーマンス・コンパス — v6.0 4象限ステータス表示
 *
 * 4つの象限でアスリートの状態を直感的に可視化:
 *   North: 回復品質（組織崩壊度）
 *   East:  動作精度（神経筋スコア）
 *   South: 負荷容量（ACWR/フィットネス）
 *   West:  メンタル準備度（主観スコア）
 *
 * モバイルファースト。SVG ベース、コンパクトデザイン。
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface CompassQuadrant {
  /** スコア (0-100)。undefined なら「入力待ち」表示 */
  score: number | undefined;
}

export interface PerformanceCompassProps {
  /** 回復品質 */
  recovery: CompassQuadrant;
  /** 動作精度 */
  movement: CompassQuadrant;
  /** 負荷容量 */
  loadCapacity: CompassQuadrant;
  /** メンタル準備度 */
  mentalReadiness: CompassQuadrant;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const SVG_SIZE = 280;
const CENTER = SVG_SIZE / 2;
const WEDGE_INNER = 32;
const WEDGE_OUTER = 110;

interface QuadrantConfig {
  label: string;
  angle: number; // 開始角度（12時=0, 時計回り）
  direction: "N" | "E" | "S" | "W";
}

const QUADRANTS: QuadrantConfig[] = [
  { label: "回復品質", angle: -90, direction: "N" },
  { label: "動作精度", angle: 0, direction: "E" },
  { label: "負荷容量", angle: 90, direction: "S" },
  { label: "メンタル", angle: 180, direction: "W" },
];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function getScoreColor(score?: number): string {
  if (score === undefined) return "rgba(139, 149, 163, 0.15)";
  if (score >= 75) return "rgba(16, 185, 129, 0.6)";
  if (score >= 50) return "rgba(255, 159, 41, 0.5)";
  if (score >= 25) return "rgba(255, 75, 75, 0.4)";
  return "rgba(255, 75, 75, 0.6)";
}

function getScoreTextColor(score?: number): string {
  if (score === undefined) return "text-muted-foreground";
  if (score >= 75) return "text-optimal-600";
  if (score >= 50) return "text-amber-caution-600";
  return "text-pulse-red-500";
}

/** 極座標から SVG 座標に変換 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/** 扇型（ウェッジ）の SVG パスを生成 */
function wedgePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function PerformanceCompass({
  recovery,
  movement,
  loadCapacity,
  mentalReadiness,
}: PerformanceCompassProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const quadrantData: (CompassQuadrant & QuadrantConfig)[] = [
    { ...recovery, ...QUADRANTS[0]! },
    { ...movement, ...QUADRANTS[1]! },
    { ...loadCapacity, ...QUADRANTS[2]! },
    { ...mentalReadiness, ...QUADRANTS[3]! },
  ];

  return (
    <div className="flex flex-col items-center gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        パフォーマンスコンパス
      </h3>

      <div className="relative">
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className={`transition-opacity duration-700 ${mounted ? "opacity-100" : "opacity-0"} motion-reduce:transition-none`}
          role="img"
          aria-label="パフォーマンスコンパス: 4象限ステータス"
        >
          {/* 象限ウェッジ */}
          {quadrantData.map((q, i) => {
            const startAngle = q.angle;
            const endAngle = q.angle + 90;
            const gap = 2; // 隙間

            // スコアに応じた外径（スコアが高いほど大きい）
            const effectiveOuter =
              q.score !== undefined
                ? WEDGE_INNER +
                  ((WEDGE_OUTER - WEDGE_INNER) * q.score) / 100
                : WEDGE_INNER + 10;

            const path = wedgePath(
              CENTER,
              CENTER,
              WEDGE_INNER,
              effectiveOuter,
              startAngle + gap,
              endAngle - gap
            );

            // 背景（最大範囲）
            const bgPath = wedgePath(
              CENTER,
              CENTER,
              WEDGE_INNER,
              WEDGE_OUTER,
              startAngle + gap,
              endAngle - gap
            );

            return (
              <g key={q.direction}>
                {/* 背景ウェッジ */}
                <path
                  d={bgPath}
                  fill="rgba(139, 149, 163, 0.08)"
                  stroke="rgba(139, 149, 163, 0.15)"
                  strokeWidth="0.5"
                />
                {/* スコアウェッジ */}
                <path
                  d={path}
                  fill={getScoreColor(q.score)}
                  className="transition-all duration-700 motion-reduce:transition-none"
                  style={{
                    transitionDelay: `${i * 150}ms`,
                  }}
                />
              </g>
            );
          })}

          {/* 中心円 */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={WEDGE_INNER - 2}
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
            strokeWidth="1"
          />

          {/* 十字線 */}
          <line
            x1={CENTER}
            y1={CENTER - WEDGE_OUTER - 5}
            x2={CENTER}
            y2={CENTER + WEDGE_OUTER + 5}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            strokeDasharray="4 3"
          />
          <line
            x1={CENTER - WEDGE_OUTER - 5}
            y1={CENTER}
            x2={CENTER + WEDGE_OUTER + 5}
            y2={CENTER}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            strokeDasharray="4 3"
          />
        </svg>

        {/* ラベル（SVG の外側に配置） */}
        {/* North: 回復品質 */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 text-center">
          <span className="text-2xs font-medium text-muted-foreground">
            {QUADRANTS[0]!.label}
          </span>
          <p className={`text-sm font-bold tabular-nums ${getScoreTextColor(recovery.score)}`}>
            {recovery.score !== undefined ? recovery.score : "—"}
          </p>
        </div>

        {/* East: 動作精度 */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 text-center">
          <span className="text-2xs font-medium text-muted-foreground">
            {QUADRANTS[1]!.label}
          </span>
          <p className={`text-sm font-bold tabular-nums ${getScoreTextColor(movement.score)}`}>
            {movement.score !== undefined ? movement.score : "入力待ち"}
          </p>
        </div>

        {/* South: 負荷容量 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-2xs font-medium text-muted-foreground">
            {QUADRANTS[2]!.label}
          </span>
          <p className={`text-sm font-bold tabular-nums ${getScoreTextColor(loadCapacity.score)}`}>
            {loadCapacity.score !== undefined ? loadCapacity.score : "—"}
          </p>
        </div>

        {/* West: メンタル */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 text-center">
          <span className="text-2xs font-medium text-muted-foreground">
            {QUADRANTS[3]!.label}
          </span>
          <p className={`text-sm font-bold tabular-nums ${getScoreTextColor(mentalReadiness.score)}`}>
            {mentalReadiness.score !== undefined ? mentalReadiness.score : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
