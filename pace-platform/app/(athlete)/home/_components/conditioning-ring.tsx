"use client";

/**
 * コンディショニングスコア リング表示コンポーネント
 *
 * SVG ベースの円形プログレスリング。マウント時に 0 からアニメーション。
 * 5ゾーン制: 絶好調(≥85), 好調(70-84), まあまあ(60-69), やや不調(40-59), 要注意(<40)
 */

import { useEffect, useState } from "react";

interface ConditioningRingProps {
  score: number;
}

// リングの定数
const SIZE = 220;
const STROKE_WIDTH = 14;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// ---------------------------------------------------------------------------
// 5ゾーン判定（PC-001 仕様準拠）
// ---------------------------------------------------------------------------

export interface ConditionZone {
  label: string;
  emoji: string;
  hex: string;
  strokeColor: string;
  textColor: string;
}

/** スコアから5ゾーンを判定する */
export function getConditionZone(score: number): ConditionZone {
  if (score >= 85) {
    return {
      label: "絶好調",
      emoji: "🔵",
      hex: "#0d9488",
      strokeColor: "stroke-teal-500",
      textColor: "text-teal-600",
    };
  }
  if (score >= 70) {
    return {
      label: "好調",
      emoji: "🟢",
      hex: "#10b981",
      strokeColor: "stroke-optimal-400",
      textColor: "text-optimal-500",
    };
  }
  if (score >= 60) {
    return {
      label: "まあまあ",
      emoji: "🟡",
      hex: "#d97706",
      strokeColor: "stroke-watchlist-400",
      textColor: "text-watchlist-500",
    };
  }
  if (score >= 40) {
    return {
      label: "やや不調",
      emoji: "🟠",
      hex: "#ea580c",
      strokeColor: "stroke-orange-500",
      textColor: "text-orange-600",
    };
  }
  return {
    label: "要注意",
    emoji: "🔴",
    hex: "#dc2626",
    strokeColor: "stroke-critical-400",
    textColor: "text-critical-500",
  };
}

export function ConditioningRing({ score }: ConditioningRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [mounted, setMounted] = useState(false);

  const clampedScore = Math.max(0, Math.min(100, score));
  const zone = getConditionZone(clampedScore);
  const targetOffset = CIRCUMFERENCE - (clampedScore / 100) * CIRCUMFERENCE;

  useEffect(() => {
    // Trigger mount animation
    setMounted(true);

    // Animate score number
    const duration = 1200;
    const start = performance.now();

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * clampedScore));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [clampedScore]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* リング SVG */}
      <div className="relative">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="drop-shadow-lg"
        >
          {/* 背景リング */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            className="text-muted/50"
          />

          {/* プログレスリング */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            stroke={zone.hex}
            className="transition-all duration-300"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={mounted ? targetOffset : CIRCUMFERENCE}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{
              transition: "stroke-dashoffset 1.2s ease-out",
            }}
          />
        </svg>

        {/* 中央のスコア表示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">
            コンディション
          </span>
          <span
            className={`text-5xl font-bold tabular-nums ${zone.textColor} ${
              mounted ? "opacity-100 scale-100" : "opacity-0 scale-75"
            } transition-all duration-500 delay-300`}
          >
            {animatedScore}
          </span>
        </div>
      </div>

      {/* ステータスラベル + 絵文字 */}
      <span
        className={`rounded-full px-4 py-1 text-sm font-semibold ${zone.textColor}`}
        style={{ backgroundColor: `${zone.hex}15` }}
      >
        {zone.emoji} {zone.label}
      </span>
    </div>
  );
}
