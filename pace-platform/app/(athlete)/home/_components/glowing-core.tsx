"use client";

/**
 * Glowing Core — v6.0 コンディショニングステータス表示
 *
 * ステータスに応じた脈動アニメーション付き SVG リング。
 * GREEN: 穏やかな緑パルス (core-pulse-healthy)
 * YELLOW: ゆっくりしたアンバーパルス (core-pulse-warning)
 * ORANGE: 速めのアンバーパルス
 * RED: 緊急アラートフラッシュ (core-alert)
 *
 * prefers-reduced-motion 対応。
 */

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface GlowingCoreProps {
  /** コンディショニングスコア 0-100 */
  score: number;
  /** 5段階ステータス */
  status: "TEAL" | "GREEN" | "YELLOW" | "ORANGE" | "RED";
  /** 本日のアクション（日本語） */
  actionOfDay: string;
  /** 最優先トリガー P1-P5 */
  primaryTrigger: string | undefined;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const SIZE = 240;
const STROKE_WIDTH = 16;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

// ---------------------------------------------------------------------------
// ステータス設定
// ---------------------------------------------------------------------------

interface StatusConfig {
  label: string;
  glowClass: string;
  animationClass: string;
  strokeColor: string;
  gradientColors: [string, string];
  textColor: string;
}

function getStatusConfig(status: GlowingCoreProps["status"]): StatusConfig {
  switch (status) {
    case "TEAL":
      return {
        label: "絶好調",
        glowClass: "glow-core-healthy",
        animationClass: "animate-core-pulse-healthy",
        strokeColor: "#0d9488",
        gradientColors: ["#0d9488", "#2dd4bf"],
        textColor: "text-teal-600",
      };
    case "GREEN":
      return {
        label: "好調",
        glowClass: "glow-core-healthy",
        animationClass: "animate-core-pulse-healthy",
        strokeColor: "#10b981",
        gradientColors: ["#10b981", "#34d399"],
        textColor: "text-optimal-500",
      };
    case "YELLOW":
      return {
        label: "まあまあ",
        glowClass: "glow-core-caution",
        animationClass: "animate-core-pulse-warning",
        strokeColor: "#d97706",
        gradientColors: ["#d97706", "#fbbf24"],
        textColor: "text-amber-caution-500",
      };
    case "ORANGE":
      return {
        label: "やや不調",
        glowClass: "glow-core-caution",
        animationClass: "animate-core-pulse-warning",
        strokeColor: "#ea580c",
        gradientColors: ["#ea580c", "#fb923c"],
        textColor: "text-orange-600",
      };
    case "RED":
      return {
        label: "要注意",
        glowClass: "glow-core-critical",
        animationClass: "animate-core-alert",
        strokeColor: "#dc2626",
        gradientColors: ["#dc2626", "#f87171"],
        textColor: "text-pulse-red-500",
      };
  }
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function GlowingCore({
  score,
  status,
  actionOfDay,
  primaryTrigger,
}: GlowingCoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [mounted, setMounted] = useState(false);

  const clampedScore = Math.max(0, Math.min(100, score));
  const config = getStatusConfig(status);
  const targetOffset = CIRCUMFERENCE - (clampedScore / 100) * CIRCUMFERENCE;

  // グラデーション ID（インスタンスごとにユニーク）
  const gradientId = `core-gradient-${status}`;

  useEffect(() => {
    setMounted(true);

    const duration = 1200;
    const start = performance.now();

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * clampedScore));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [clampedScore]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Glowing Core リング */}
      <div
        className={`relative rounded-full ${config.glowClass} ${config.animationClass} motion-reduce:animate-none`}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="drop-shadow-lg"
          role="img"
          aria-label={`コンディションスコア ${clampedScore} - ${config.label}`}
        >
          <defs>
            {/* ラジアルグラデーション（グロウエフェクト） */}
            <radialGradient id={`${gradientId}-bg`} cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                stopColor={config.gradientColors[0]}
                stopOpacity="0.08"
              />
              <stop
                offset="70%"
                stopColor={config.gradientColors[0]}
                stopOpacity="0.03"
              />
              <stop
                offset="100%"
                stopColor={config.gradientColors[0]}
                stopOpacity="0"
              />
            </radialGradient>

            {/* ストロークグラデーション */}
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={config.gradientColors[0]} />
              <stop offset="100%" stopColor={config.gradientColors[1]} />
            </linearGradient>
          </defs>

          {/* 背景グロウ円 */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS + STROKE_WIDTH / 2}
            fill={`url(#${gradientId}-bg)`}
          />

          {/* 背景リング */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            className="text-muted/30"
          />

          {/* プログレスリング */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            stroke={`url(#${gradientId})`}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={mounted ? targetOffset : CIRCUMFERENCE}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{
              transition: "stroke-dashoffset 1.2s ease-out",
            }}
          />
        </svg>

        {/* 中央のスコア表示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            コンディション
          </span>
          <span
            className={`font-label text-score-hero font-bold tabular-nums ${config.textColor} ${
              mounted ? "opacity-100 scale-100" : "opacity-0 scale-75"
            } transition-all duration-500 delay-300 motion-reduce:transition-none`}
          >
            {animatedScore}
          </span>
          <span
            className={`mt-1 rounded-full px-3 py-0.5 text-xs font-semibold ${config.textColor}`}
            style={{
              backgroundColor: `${config.strokeColor}15`,
            }}
          >
            {config.label}
          </span>
        </div>
      </div>

      {/* プライマリトリガー */}
      {primaryTrigger && (
        <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span className="text-2xs text-muted-foreground">
            優先: {primaryTrigger}
          </span>
        </div>
      )}

      {/* Action of the Day */}
      <div className="w-full max-w-[320px] rounded-xl border border-border bg-card p-3 text-center shadow-sm">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          今日のアクション
        </p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">
          {actionOfDay}
        </p>
      </div>
    </div>
  );
}
