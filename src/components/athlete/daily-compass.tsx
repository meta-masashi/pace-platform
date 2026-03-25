"use client";

/**
 * Daily Compass — "The Action Screen"
 * チェックイン完了直後に表示される「今日の行動指針」
 * Bio-Cybernetic Icon System: Target / Zap / RefreshCw
 */

import { type LucideIcon, Target, Zap, RefreshCw, ShieldCheck, AlertTriangle, Ban } from "lucide-react";

interface Prescription {
  icon: "target" | "zap" | "recovery" | "warning";
  text: string;
}

const PRESCRIPTION_ICONS: Record<Prescription["icon"], { Icon: LucideIcon; color: string }> = {
  target:   { Icon: Target,        color: "text-brand-400" },
  zap:      { Icon: Zap,           color: "text-amber-400" },
  recovery: { Icon: RefreshCw,     color: "text-blue-400" },
  warning:  { Icon: AlertTriangle, color: "text-red-400" },
};

interface DailyCompassProps {
  status: "CLEAR" | "ADJUSTED" | "CRITICAL";
  readinessScore: number;
  prescriptions: Prescription[];
  coachApproved: boolean;
}

function statusConfig(status: DailyCompassProps["status"]) {
  switch (status) {
    case "CLEAR":
      return {
        label: "CLEAR",
        bg: "bg-brand-500",
        ring: "ring-brand-400/30",
        text: "text-brand-50",
        subtext: "フルメニュー消化可能",
        Icon: ShieldCheck,
      };
    case "ADJUSTED":
      return {
        label: "ADJUSTED",
        bg: "bg-amber-500",
        ring: "ring-amber-400/30",
        text: "text-amber-50",
        subtext: "メニューが調整されています",
        Icon: AlertTriangle,
      };
    case "CRITICAL":
      return {
        label: "REST",
        bg: "bg-red-500",
        ring: "ring-red-400/30",
        text: "text-red-50",
        subtext: "本日は休養が推奨されています",
        Icon: Ban,
      };
  }
}

export function DailyCompass({
  status,
  readinessScore,
  prescriptions,
  coachApproved,
}: DailyCompassProps) {
  const cfg = statusConfig(status);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center px-6 py-12">
      {/* The Status Circle */}
      <div className="relative mb-8">
        <div
          className={`w-48 h-48 rounded-full ${cfg.bg} ring-8 ${cfg.ring} flex flex-col items-center justify-center shadow-2xl`}
        >
          <cfg.Icon className={`w-8 h-8 ${cfg.text} mb-1`} strokeWidth={1.5} />
          <span className={`text-5xl font-bold font-numeric ${cfg.text}`}>
            {Math.round(readinessScore)}
          </span>
          <span className={`text-xs font-bold ${cfg.text} tracking-[0.15em] uppercase`}>
            {cfg.label}
          </span>
        </div>
        {/* Pulse animation for CLEAR */}
        {status === "CLEAR" && (
          <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
        )}
      </div>

      <p className="text-slate-500 text-sm mb-8">{cfg.subtext}</p>

      {/* Prescriptions */}
      {prescriptions.length > 0 && (
        <div className="w-full max-w-sm space-y-3 mb-8">
          <h3 className="text-xs text-slate-600 uppercase tracking-[0.15em] font-semibold">
            本日のアクション
          </h3>
          {prescriptions.map((p, i) => {
            const iconCfg = PRESCRIPTION_ICONS[p.icon] ?? PRESCRIPTION_ICONS.target;
            return (
              <div
                key={i}
                className="flex items-start gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
              >
                <div className="mt-0.5">
                  <iconCfg.Icon
                    className={`w-5 h-5 ${iconCfg.color}`}
                    strokeWidth={1.5}
                  />
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {p.text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Coach approval badge */}
      {coachApproved && (
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-4 py-2">
          <ShieldCheck className="w-4 h-4 text-brand-500" />
          <span className="text-xs text-slate-400">コーチ承認済み</span>
        </div>
      )}

      {/* Legal */}
      <p className="text-2xs text-slate-700 mt-8 text-center max-w-xs">
        ※ 本表示は意思決定支援の参考情報であり、医療行為に該当する診断ではありません。
      </p>
    </div>
  );
}
