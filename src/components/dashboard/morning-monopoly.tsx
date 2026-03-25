"use client";

import { AlertTriangle, Shield, ChevronDown, Sparkles } from "lucide-react";
import { ApprovalAction } from "./approval-action";

interface AthleteAlert {
  id: string;
  name: string;
  position: string | null;
  status: "critical" | "watchlist" | "normal" | "zone";
  readiness_score: number;
  acwr: number;
  acwr_zone: string;
  fitness_score: number;
  fatigue_score: number;
  nlg_summary?: string;
  recommendation?: string;
  evidence_text?: string;
  risk_score?: number;
}

interface MorningMonopolyProps {
  athletes: AthleteAlert[];
  teamReadinessAvg: number;
  criticalCount: number;
  watchlistCount: number;
  onExitMonopoly: () => void;
}

function AlertIcon({ status }: { status: string }) {
  if (status === "critical") {
    return (
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 text-red-600" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
      <Shield className="w-4 h-4 text-amber-600" />
    </div>
  );
}

function readinessColor(score: number): string {
  if (score >= 80) return "text-brand-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

export function MorningMonopoly({
  athletes,
  teamReadinessAvg,
  criticalCount,
  watchlistCount,
  onExitMonopoly,
}: MorningMonopolyProps) {
  const alertAthletes = athletes.filter(
    (a) => a.status === "critical" || a.status === "watchlist"
  );

  return (
    <div className="space-y-4">
      {/* Morning Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold">おはようございます</h2>
          </div>
          <button
            onClick={onExitMonopoly}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            全データを見る <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xs text-slate-400">チーム Readiness</p>
            <p className="text-2xl font-bold font-numeric text-brand-400">
              {Math.round(teamReadinessAvg)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-slate-400">Critical</p>
            <p className="text-2xl font-bold font-numeric text-red-400">
              {criticalCount}
            </p>
          </div>
          <div>
            <p className="text-2xs text-slate-400">Watchlist</p>
            <p className="text-2xl font-bold font-numeric text-amber-400">
              {watchlistCount}
            </p>
          </div>
        </div>
      </div>

      {/* Alert Cards */}
      {alertAthletes.length === 0 ? (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-6 text-center">
          <Shield className="w-8 h-8 text-brand-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-brand-700">
            本日の要対応選手はいません
          </p>
          <p className="text-xs text-brand-500 mt-1">
            全選手が良好なコンディションです
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertAthletes.map((athlete) => (
            <div
              key={athlete.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                athlete.status === "critical"
                  ? "border-red-200"
                  : "border-amber-200"
              }`}
            >
              {/* Athlete Header */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertIcon status={athlete.status} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {athlete.name}
                    </p>
                    <p className="text-2xs text-slate-500">{athlete.position}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-bold font-numeric ${readinessColor(
                      athlete.readiness_score
                    )}`}
                  >
                    {Math.round(athlete.readiness_score)}
                  </p>
                  <p className="text-2xs text-slate-400">Readiness</p>
                </div>
              </div>

              {/* NLG Summary */}
              {athlete.nlg_summary && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {athlete.nlg_summary}
                  </p>
                </div>
              )}

              {/* Recommendation + Approval */}
              {athlete.recommendation && (
                <div className="px-4 py-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">
                    <span className="font-medium text-slate-700">推奨: </span>
                    {athlete.recommendation}
                  </p>
                  <ApprovalAction
                    athleteId={athlete.id}
                    athleteName={athlete.name}
                    recommendation={athlete.recommendation}
                    evidenceText={athlete.evidence_text}
                    riskScore={athlete.risk_score}
                  />
                </div>
              )}

              {/* Quick Metrics */}
              <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-100 flex gap-4 text-2xs text-slate-500">
                <span>
                  ACWR: <span className="font-medium text-slate-700">{athlete.acwr.toFixed(2)}</span>
                </span>
                <span>
                  Fitness: <span className="font-medium text-slate-700">{Math.round(athlete.fitness_score)}</span>
                </span>
                <span>
                  Fatigue: <span className="font-medium text-slate-700">{Math.round(athlete.fatigue_score)}</span>
                </span>
              </div>

              {/* Legal Disclaimer */}
              <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100">
                <p className="text-2xs text-slate-400">
                  ※ 臨床判断の補助ツールです。最終判断は有資格者が行ってください。
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
