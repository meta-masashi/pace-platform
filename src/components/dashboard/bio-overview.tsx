"use client";

import { useMemo } from "react";
import { AlertTriangle, ListChecks, TrendingUp } from "lucide-react";

// ─── Half-donut gauge (SVG) ───────────────────────────────────────────────

function HalfDonutGauge({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  // Arc: 180° half-circle, radius 80, center at (100,90)
  const R = 80;
  const startAngle = Math.PI; // left
  const endAngle = startAngle - (pct / 100) * Math.PI;
  const x1 = 100 + R * Math.cos(startAngle);
  const y1 = 90 + R * Math.sin(startAngle);
  const x2 = 100 + R * Math.cos(endAngle);
  const y2 = 90 + R * Math.sin(endAngle);
  const largeArc = pct > 50 ? 1 : 0;

  const color =
    pct >= 80
      ? "#FC4C02"  // Strava Orange — 良好
      : pct >= 60
        ? "#f59e0b"
        : "#ef4444";

  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
      {/* Background arc (full) */}
      <path
        d={`M ${100 - R} 90 A ${R} ${R} 0 0 1 ${100 + R} 90`}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="16"
        strokeLinecap="round"
      />
      {/* Value arc — always render with transition */}
      <path
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 0 ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
        style={{ transition: "d 0.6s ease, stroke 0.4s ease" }}
      />
    </svg>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface BioOverviewProps {
  teamReadiness: number; // 0-100
  fullMenuCount: number;
  totalAthletes: number;
  readinessDelta: number; // vs yesterday
  checkinRate: number; // 0-100
  missingCheckinCount: number;
  teamAcwr: number;
  criticalCount: number;
  watchlistCount: number;
}

export function BioOverview({
  teamReadiness,
  fullMenuCount,
  totalAthletes,
  readinessDelta,
  checkinRate,
  missingCheckinCount,
  teamAcwr,
  criticalCount,
  watchlistCount,
}: BioOverviewProps) {
  const alertCount = criticalCount + watchlistCount;

  const acwrColor = useMemo(() => {
    if (teamAcwr > 1.5) return "text-red-600";
    if (teamAcwr > 1.3) return "text-amber-600";
    return "text-brand-600";
  }, [teamAcwr]);

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* ─── 左: Hero Metric (Team Readiness) ─── */}
        <div className="p-5 flex flex-col items-center justify-center">
          <HalfDonutGauge value={teamReadiness} />
          <div className="text-center -mt-2">
            <span
              className={`text-5xl font-bold font-numeric tracking-tight ${
                teamReadiness >= 80
                  ? "text-brand-600"
                  : teamReadiness >= 60
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {Math.round(teamReadiness)}
              <span className="text-2xl">%</span>
            </span>
            {readinessDelta !== 0 && (
              <span
                className={`ml-2 text-sm font-medium ${
                  readinessDelta > 0 ? "text-brand-500" : "text-red-500"
                }`}
              >
                {readinessDelta > 0 ? "↑" : "↓"}{" "}
                {Math.abs(readinessDelta)}%
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            チーム稼働率
          </p>
          <p className="text-xs text-slate-500">
            {fullMenuCount}/{totalAthletes}名がフルメニュー消化可能
          </p>
        </div>

        {/* ─── 中央: Vital Signs ─── */}
        <div className="p-5 flex flex-col justify-center gap-5">
          {/* CAT入力完了率 */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">
              CAT入力完了率（データ信頼度）
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-numeric ${
                  checkinRate >= 100
                    ? "text-brand-600"
                    : checkinRate >= 80
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {checkinRate}%
              </span>
              {missingCheckinCount > 0 && (
                <span className="text-xs text-red-500 font-medium">
                  未入力{missingCheckinCount}名
                </span>
              )}
            </div>
          </div>

          {/* チーム平均ACWR */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">
              チーム負荷バランス（急性 / 慢性）
            </p>
            <span className={`text-3xl font-bold font-numeric ${acwrColor}`}>
              {teamAcwr.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ─── 右: Contextual Actions ─── */}
        <div className="p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-xs text-slate-500 font-medium">
              本日の要注意（Watch/Critical）
            </p>
          </div>
          <span className="text-4xl font-bold font-numeric text-red-600 mb-3">
            {alertCount}
            <span className="text-lg text-slate-400 ml-1">名</span>
          </span>

          {alertCount > 0 ? (
            <a
              href="/dashboard/triage"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
            >
              <ListChecks className="w-4 h-4" />
              要注意の{alertCount}名をトリアージ
            </a>
          ) : (
            <div className="flex items-center gap-2 text-brand-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">
                全員グリーン — 追い込めます
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
