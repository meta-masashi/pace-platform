"use client";

/**
 * ACWR ミニゲージ
 *
 * 半円形ゲージで ACWR 値を表示。
 * 緑(0.8-1.3), 黄(1.3-1.5), 赤(>1.5) のゾーン分け。
 */

import { useEffect, useState } from "react";

interface AcwrGaugeProps {
  value: number;
}

// ゲージの定数
const GAUGE_WIDTH = 120;
const GAUGE_HEIGHT = 70;
const CENTER_X = 60;
const CENTER_Y = 60;
const RADIUS = 48;
const STROKE_WIDTH = 10;

// ACWR の表示範囲（0 から 2.0）
const MAX_ACWR = 2.0;

function getAcwrStatus(value: number) {
  if (value >= 0.8 && value <= 1.3) {
    return { color: "text-optimal-500", label: "安全" };
  }
  if (value > 1.3 && value <= 1.5) {
    return { color: "text-watchlist-500", label: "注意" };
  }
  if (value > 1.5) {
    return { color: "text-critical-500", label: "過負荷" };
  }
  return { color: "text-muted-foreground", label: "低負荷" };
}

export function AcwrGauge({ value }: AcwrGaugeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clampedValue = Math.min(Math.max(value, 0), MAX_ACWR);
  const status = getAcwrStatus(value);

  // 半円（180度）でのアーク
  const halfCircumference = Math.PI * RADIUS;

  // ゾーンの角度計算（全体を180度=MAX_ACWR として）
  const safeStart = (0.8 / MAX_ACWR) * 180;
  const safeEnd = (1.3 / MAX_ACWR) * 180;
  const cautionEnd = (1.5 / MAX_ACWR) * 180;

  // ニードルの角度 (0=左端=-90deg, MAX_ACWR=右端=90deg)
  const needleAngle = -90 + (clampedValue / MAX_ACWR) * 180;

  // SVG アーク描画ヘルパー
  function describeArc(startAngle: number, endAngle: number): string {
    // 角度を -90度オフセット（12時方向が0）
    const startRad = ((startAngle - 180) * Math.PI) / 180;
    const endRad = ((endAngle - 180) * Math.PI) / 180;

    const x1 = CENTER_X + RADIUS * Math.cos(startRad);
    const y1 = CENTER_Y + RADIUS * Math.sin(startRad);
    const x2 = CENTER_X + RADIUS * Math.cos(endRad);
    const y2 = CENTER_Y + RADIUS * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={GAUGE_WIDTH}
        height={GAUGE_HEIGHT}
        viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`}
      >
        {/* 背景アーク（灰色） */}
        <path
          d={describeArc(0, 180)}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          className="text-muted/30"
        />

        {/* 低負荷ゾーン（灰色） */}
        <path
          d={describeArc(0, safeStart)}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="butt"
          className="text-muted-foreground/30"
        />

        {/* 安全ゾーン（緑） */}
        <path
          d={describeArc(safeStart, safeEnd)}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="butt"
          className="text-optimal-400"
        />

        {/* 注意ゾーン（黄） */}
        <path
          d={describeArc(safeEnd, cautionEnd)}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="butt"
          className="text-watchlist-400"
        />

        {/* 過負荷ゾーン（赤） */}
        <path
          d={describeArc(cautionEnd, 180)}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          className="text-critical-400"
        />

        {/* ニードル */}
        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={CENTER_X}
          y2={CENTER_Y - RADIUS + STROKE_WIDTH + 2}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`${status.color} origin-center`}
          style={{
            transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
            transform: `rotate(${mounted ? needleAngle : -90}deg)`,
            transition: "transform 1s ease-out 0.3s",
          }}
        />

        {/* ニードル中心点 */}
        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r="4"
          fill="currentColor"
          className={status.color}
        />
      </svg>

      {/* 値とステータス */}
      <div className="flex items-baseline gap-1 -mt-1">
        <span className={`text-lg font-bold tabular-nums ${status.color}`}>
          {value.toFixed(2)}
        </span>
      </div>
      <span className={`text-[10px] font-medium ${status.color}`}>
        {status.label}
      </span>
    </div>
  );
}
