"use client";

import { useMemo } from "react";

interface GlowingCoreProps {
  score: number; // 0-100
  label?: string;
  size?: number; // px, default 240
}

function getScoreColor(score: number): {
  stroke: string;
  glow: string;
  text: string;
  label: string;
  bg: string;
} {
  if (score >= 80)
    return {
      stroke: "#10b981",
      glow: "rgba(16,185,129,0.3)",
      text: "text-brand-500",
      label: "絶好調",
      bg: "bg-brand-500/10",
    };
  if (score >= 60)
    return {
      stroke: "#059669",
      glow: "rgba(5,150,105,0.25)",
      text: "text-brand-600",
      label: "良好",
      bg: "bg-brand-600/10",
    };
  if (score >= 40)
    return {
      stroke: "#f59e0b",
      glow: "rgba(245,158,11,0.25)",
      text: "text-amber-500",
      label: "注意",
      bg: "bg-amber-500/10",
    };
  return {
    stroke: "#ef4444",
    glow: "rgba(239,68,68,0.3)",
    text: "text-red-500",
    label: "回復優先",
    bg: "bg-red-500/10",
  };
}

export function GlowingCore({ score, label, size = 240 }: GlowingCoreProps) {
  const color = useMemo(() => getScoreColor(score), [score]);
  const clampedScore = Math.max(0, Math.min(100, score));

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (clampedScore / 100) * circumference;
  const center = size / 2;

  const animationClass =
    score >= 60 ? "animate-core-pulse-healthy" : "animate-core-alert";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${animationClass}`} style={{ width: size, height: size }}>
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-40"
          style={{ backgroundColor: color.glow }}
        />

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="relative z-10 -rotate-90"
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className={`text-score-hero font-bold font-numeric ${color.text}`}>
            {clampedScore}
          </span>
          <span className={`text-xs font-medium ${color.text} mt-[-4px]`}>
            {label ?? color.label}
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-500 font-medium">コンディション・スコア</p>
    </div>
  );
}
