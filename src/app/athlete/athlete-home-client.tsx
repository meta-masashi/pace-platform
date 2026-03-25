"use client";

import { useEffect, useState, useCallback } from "react";
import { GlowingCore } from "@/components/athlete/glowing-core";
import { SubMetricCards } from "@/components/athlete/sub-metric-cards";
import { InsightCard } from "@/components/athlete/insight-card";
import { CalibrationBanner } from "@/components/athlete/calibration-banner";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import Link from "next/link";

interface ConditionData {
  readiness_score: number;
  fitness_score: number;
  fatigue_score: number;
  acwr: number;
  acwr_zone: string;
  level: number;
  hrv_baseline_delta: number | null;
  first_data_date: string | null;
  trend_14d: Array<{
    date: string;
    readiness: number;
    fitness: number;
    fatigue: number;
  }>;
}

interface CoachData {
  greeting: string;
  focus_point: string;
  advice: string;
  readiness_label: string;
  cached: boolean;
}

function computeTrend(
  trend: ConditionData["trend_14d"],
  key: "fitness" | "fatigue"
): "up" | "down" | "stable" {
  if (!trend || trend.length < 3) return "stable";
  const recent = trend.slice(-3);
  const first = recent[0][key];
  const last = recent[recent.length - 1][key];
  const diff = last - first;
  if (Math.abs(diff) < 2) return "stable";
  return diff > 0 ? "up" : "down";
}

export function AthleteHomeClient() {
  const [condition, setCondition] = useState<ConditionData | null>(null);
  const [coach, setCoach] = useState<CoachData | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [condRes, coachRes, checkinRes] = await Promise.all([
        fetch("/api/athlete/condition-score"),
        fetch("/api/athlete/daily-coach"),
        fetch("/api/athlete/checkin"),
      ]);

      if (condRes.ok) {
        const data = await condRes.json();
        setCondition(data);
      }
      if (coachRes.ok) {
        const data = await coachRes.json();
        setCoach(data);
      }
      if (checkinRes.ok) {
        const data = await checkinRes.json();
        setCheckedIn(data.submitted === true);
      }
    } catch {
      // Use cached data via service worker
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const score = condition?.readiness_score ?? 0;
  const fitness = condition?.fitness_score ?? 0;
  const fatigue = condition?.fatigue_score ?? 0;
  const acwr = condition?.acwr ?? 0;
  const trend = condition?.trend_14d ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">PACE</h1>
          <p className="text-2xs text-slate-500">アスリートホーム</p>
        </div>
        <Link
          href="/athlete/history"
          className="text-xs text-brand-600 font-medium flex items-center gap-0.5"
        >
          履歴 <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <main className="max-w-[430px] mx-auto px-4 py-6 space-y-6">
        {/* Check-in CTA */}
        {!checkedIn && (
          <Link
            href="/athlete/checkin"
            className="flex items-center gap-3 bg-brand-600 text-white rounded-xl p-4 shadow-md hover:bg-brand-700 transition-colors"
          >
            <ClipboardCheck className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">朝のチェックインを完了しましょう</p>
              <p className="text-2xs text-brand-100">睡眠・疲労・トレーニング強度を入力</p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
          </Link>
        )}

        {/* Calibration Banner */}
        <CalibrationBanner firstDataDate={condition?.first_data_date ?? null} />

        {/* GlowingCore */}
        <div className="flex justify-center pt-2">
          <GlowingCore score={score} size={240} />
        </div>

        {/* Sub Metric Cards */}
        <SubMetricCards
          fitness={fitness}
          fatigue={fatigue}
          acwr={acwr}
          fitnessTrend={computeTrend(trend, "fitness")}
          fatigueTrend={computeTrend(trend, "fatigue")}
        />

        {/* AI Insight Card */}
        <InsightCard
          greeting={coach?.greeting}
          focusPoint={coach?.focus_point}
          advice={coach?.advice}
          readinessLabel={coach?.readiness_label}
          isLoading={!coach && loading}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/athlete/checkin"
            className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow"
          >
            <ClipboardCheck className="w-5 h-5 text-brand-600 mx-auto mb-1" />
            <p className="text-xs font-medium text-slate-700">チェックイン</p>
          </Link>
          <Link
            href="/athlete/history"
            className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 text-center hover:shadow-md transition-shadow"
          >
            <svg className="w-5 h-5 text-brand-600 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-xs font-medium text-slate-700">推移を見る</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
