"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";
import type { RehabProgram, Workout, RehabPhase } from "@/types";

const phaseColors: Record<RehabPhase, string> = {
  1: "text-red-700 bg-red-50 border-red-200",
  2: "text-amber-700 bg-amber-50 border-amber-200",
  3: "text-blue-700 bg-blue-50 border-blue-200",
  4: "text-green-700 bg-green-50 border-green-200",
};

const phaseNames: Record<RehabPhase, string> = {
  1: "急性期管理",
  2: "組織修復",
  3: "機能回復",
  4: "スポーツ復帰",
};

interface RehabDetailClientProps {
  program: RehabProgram;
  athleteName: string;
  workout: Workout | null;
}

export function RehabDetailClient({ program, athleteName, workout }: RehabDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"status" | "menu">("status");
  const [openReasons, setOpenReasons] = useState<Record<string, boolean>>({});

  const startDate = new Date(program.start_date);
  const rtpDate = program.estimated_rtp_date ? new Date(program.estimated_rtp_date) : null;
  const elapsed = Math.floor((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = rtpDate
    ? Math.floor((rtpDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const remaining = rtpDate
    ? Math.max(0, Math.floor((rtpDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const rtpProgress = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;

  const toggleReason = (exId: string) => {
    setOpenReasons((prev) => ({ ...prev, [exId]: !prev[exId] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/rehabilitation" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{athleteName}</h1>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
                  phaseColors[program.current_phase]
                )}
              >
                Phase {program.current_phase}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {program.diagnosis_label}
              {rtpDate && (
                <>
                  {" "}/ RTP予定:{" "}
                  {rtpDate.toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["status", "menu"] as const).map((tab) => {
          const labels = { status: "傷害状況", menu: "リハビリメニュー承認" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {activeTab === "status" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              title="ROM（背屈）"
              value={program.rom != null ? String(program.rom) : "—"}
              unit="°"
              color={
                program.rom != null
                  ? program.rom < 10
                    ? "red"
                    : program.rom < 15
                    ? "amber"
                    : "green"
                  : "green"
              }
              trend="up"
              trendLabel="改善傾向"
            />
            <KpiCard
              title="腫脹グレード"
              value={program.swelling_grade != null ? String(program.swelling_grade) : "—"}
              color={
                program.swelling_grade != null
                  ? program.swelling_grade >= 2
                    ? "red"
                    : program.swelling_grade >= 1
                    ? "amber"
                    : "green"
                  : "green"
              }
              subtitle="0=正常 / 1=軽度 / 2=中等度 / 3=重度"
            />
            <KpiCard
              title="LSI"
              value={program.lsi_percent != null ? String(program.lsi_percent) : "—"}
              unit="%"
              color={
                program.lsi_percent != null
                  ? program.lsi_percent < 60
                    ? "red"
                    : program.lsi_percent < 80
                    ? "amber"
                    : "green"
                  : "green"
              }
              trend="up"
              trendLabel="RTP目標: 90%"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>RTP プログレス</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>開始: {startDate.toLocaleDateString("ja-JP")}</span>
                <span className="font-medium text-gray-700">残り {remaining} 日</span>
                <span>
                  RTP予定:{" "}
                  {rtpDate ? rtpDate.toLocaleDateString("ja-JP") : "未定"}
                </span>
              </div>
              <div className="relative">
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-green-500 transition-all"
                    style={{ width: `${rtpProgress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {([1, 2, 3, 4] as RehabPhase[]).map((phase) => (
                  <div
                    key={phase}
                    className={cn(
                      "rounded-lg border p-3 text-center",
                      program.current_phase === phase
                        ? phaseColors[phase]
                        : phase < program.current_phase
                        ? "bg-gray-50 border-gray-200 text-gray-400"
                        : "bg-white border-gray-100 text-gray-400"
                    )}
                  >
                    <p className="text-xs font-bold">Phase {phase}</p>
                    <p className="text-xs mt-0.5">{phaseNames[phase]}</p>
                    {phase < program.current_phase && (
                      <p className="text-xs mt-1 text-green-600">✓ 通過</p>
                    )}
                    {phase === program.current_phase && (
                      <p className="text-xs mt-1 font-semibold">現在</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "menu" && (
        <div className="space-y-4">
          {workout ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  AI生成メニュー — {workout.total_duration_min}分 / {workout.menu.length}種目
                </p>
                <Button variant="secondary">AIメニュー再生成</Button>
              </div>

              <div className="space-y-3">
                {workout.menu.map((item, i) => (
                  <Card key={item.exercise_id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{item.exercise_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.sets}セット × {item.reps_or_time}
                              {item.unit === "reps" ? "回" : item.unit === "sec" ? "秒" : "分"}
                              {item.rpe && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                  RPE {item.rpe}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleReason(item.exercise_id)}
                          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 flex-shrink-0 ml-4"
                        >
                          理由
                          {openReasons[item.exercise_id] ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {openReasons[item.exercise_id] && (
                        <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">{item.reason}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline">修正</Button>
                <Button variant="primary">承認・配信</Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-gray-400">
                {/* TODO: Fetch workout from `workouts` table when available for this rehab program */}
                AI生成メニューがまだありません
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
