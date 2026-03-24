"use client";

/**
 * コンディショニングスコア リング表示コンポーネント
 *
 * SVG ベースの円形プログレスリング。マウント時に 0 からアニメーション。
 * スコア範囲に応じて色が変化: teal(70-100), amber(40-69), red(0-39)
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

function getStatusConfig(score: number) {
  if (score >= 70) {
    return {
      label: "最適",
      strokeColor: "stroke-optimal-400",
      textColor: "text-optimal-500",
      bgGlow: "text-optimal-400/20",
    };
  }
  if (score >= 40) {
    return {
      label: "注意",
      strokeColor: "stroke-watchlist-400",
      textColor: "text-watchlist-500",
      bgGlow: "text-watchlist-400/20",
    };
  }
  return {
    label: "回復優先",
    strokeColor: "stroke-critical-400",
    textColor: "text-critical-500",
    bgGlow: "text-critical-400/20",
  };
}

export function ConditioningRing({ score }: ConditioningRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [mounted, setMounted] = useState(false);

  const clampedScore = Math.max(0, Math.min(100, score));
  const config = getStatusConfig(clampedScore);
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
            className={`${config.strokeColor} transition-all duration-300`}
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
            className={`text-5xl font-bold tabular-nums ${config.textColor} ${
              mounted ? "opacity-100 scale-100" : "opacity-0 scale-75"
            } transition-all duration-500 delay-300`}
          >
            {animatedScore}
          </span>
        </div>
      </div>

      {/* ステータスラベル */}
      <span
        className={`rounded-full px-4 py-1 text-sm font-semibold ${config.textColor} bg-current/10`}
      >
        <span className="relative text-inherit">{config.label}</span>
      </span>
    </div>
  );
}
