"use client";

/**
 * KpiBreakdownRow — 3大サブ指標の横並び表示
 *
 * ConditionCircleRing の下に配置し、
 * 残り体力(HP), 疲労の状態, 負荷バランス を一目で把握できるようにする。
 */

import { getConditionZone } from "./conditioning-ring";

interface KpiBreakdownRowProps {
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
}

/** ACWR のゾーン判定 */
function getAcwrZone(acwr: number): { label: string; emoji: string; color: string } {
  if (acwr >= 0.8 && acwr <= 1.3) return { label: "最適", emoji: "🟢", color: "text-emerald-600" };
  if (acwr > 1.3 && acwr <= 1.5) return { label: "注意", emoji: "🟡", color: "text-amber-600" };
  if (acwr > 1.5) return { label: "過負荷", emoji: "🔴", color: "text-red-600" };
  return { label: "低負荷", emoji: "🔵", color: "text-blue-600" };
}

/** 疲労度 → 回復度に反転して表示 */
function getFatigueZone(fatigue: number): { label: string; emoji: string; color: string } {
  if (fatigue <= 30) return { label: "回復済み", emoji: "🟢", color: "text-emerald-600" };
  if (fatigue <= 60) return { label: "普通", emoji: "🟡", color: "text-amber-600" };
  return { label: "疲労蓄積", emoji: "🔴", color: "text-red-600" };
}

function KpiCard({
  title,
  value,
  emoji,
  label,
  color,
}: {
  title: string;
  value: string;
  emoji: string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-3">
      <span className="text-[10px] font-medium text-muted-foreground">{title}</span>
      <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
      <span className={`text-xs font-medium ${color}`}>
        {emoji} {label}
      </span>
    </div>
  );
}

export function KpiBreakdownRow({ fitnessEwma, fatigueEwma, acwr }: KpiBreakdownRowProps) {
  const acwrZone = getAcwrZone(acwr);
  const fatigueZone = getFatigueZone(fatigueEwma);

  // 残り体力は fitnessEwma をそのまま表示（高い方が良い）
  const fitnessColor = fitnessEwma >= 60 ? "text-emerald-600" : fitnessEwma >= 30 ? "text-amber-600" : "text-red-600";
  const fitnessLabel = fitnessEwma >= 60 ? "充実" : fitnessEwma >= 30 ? "標準" : "不足";
  const fitnessEmoji = fitnessEwma >= 60 ? "🟢" : fitnessEwma >= 30 ? "🟡" : "🔴";

  return (
    <div className="flex gap-2">
      <KpiCard
        title="残り体力 / HP"
        value={`${Math.round(fitnessEwma)}`}
        emoji={fitnessEmoji}
        label={fitnessLabel}
        color={fitnessColor}
      />
      <KpiCard
        title="疲労の状態"
        value={`${Math.round(100 - fatigueEwma)}%`}
        emoji={fatigueZone.emoji}
        label={fatigueZone.label}
        color={fatigueZone.color}
      />
      <KpiCard
        title="負荷バランス"
        value={acwr.toFixed(2)}
        emoji={acwrZone.emoji}
        label={acwrZone.label}
        color={acwrZone.color}
      />
    </div>
  );
}
