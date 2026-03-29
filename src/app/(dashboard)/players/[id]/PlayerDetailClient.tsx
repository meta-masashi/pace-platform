"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { CalibrationUpdateLog } from "@/components/athlete/calibration-update-toast";
import { PredictionHorizon } from "@/components/athlete/prediction-horizon";
import { TruthValidation } from "@/components/athlete/truth-validation";
import { AiProficiencyRadar } from "@/components/athlete/ai-proficiency-radar";
import type { Athlete, Workout, DiagnosisResult, Priority } from "@/types";

const statusLabel: Record<Priority, string> = {
  critical: "Critical",
  watchlist: "Watchlist",
  normal: "Normal",
};

interface ChartDataPoint {
  date: string;
  NRS: number;
  HRV: number;
  ACWR: number;
}

interface PlayerDetailClientProps {
  athlete: Athlete;
  chartData: ChartDataPoint[];
  differentials: DiagnosisResult[];
  workout: Workout | null;
}

export function PlayerDetailClient({
  athlete,
  chartData,
  differentials,
  workout,
}: PlayerDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"status" | "program" | "soap" | "ai">("status");
  const [openReasons, setOpenReasons] = useState<Record<string, boolean>>({});
  const [soapS, setSoapS] = useState("");
  const [soapO, setSoapO] = useState("");
  const [soapA, setSoapA] = useState("");
  const [soapP, setSoapP] = useState("");

  const toggleReason = (exId: string) => {
    setOpenReasons((prev) => ({ ...prev, [exId]: !prev[exId] }));
  };

  const initials = athlete.name
    .split(" ")
    .map((s) => s.charAt(0))
    .join("");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/players" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-green-700 font-bold text-sm">{initials}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{athlete.name}</h1>
              <Badge variant={athlete.status}>{statusLabel[athlete.status]}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {athlete.position} / #{athlete.number} / {athlete.age}歳
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["status", "program", "soap", "ai"] as const).map((tab) => {
          const labels = { status: "ステータス", program: "個別プログラム承認", soap: "SOAPノート", ai: "AI習熟度" };
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
        <Link
          href={`/players/${athlete.id}/karte`}
          className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-indigo-700 hover:border-indigo-400 transition-colors"
        >
          カルテ
        </Link>
      </div>

      {activeTab === "status" && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              title="HP"
              value={athlete.hp}
              color={athlete.hp < 50 ? "red" : athlete.hp < 75 ? "amber" : "green"}
              trend="down"
              trendLabel="低下傾向"
            />
            <KpiCard
              title="NRS"
              value={athlete.nrs}
              unit="/10"
              color={athlete.nrs >= 7 ? "red" : athlete.nrs >= 4 ? "amber" : "green"}
              trend="up"
              trendLabel="前日比 +1"
            />
            <KpiCard
              title="HRV"
              value={athlete.hrv.toFixed(1)}
              unit="ms"
              color="red"
              trend="down"
              trendLabel="ベースライン比"
            />
            <KpiCard
              title="ACWR"
              value={athlete.acwr.toFixed(2)}
              color={athlete.acwr > 1.5 ? "red" : athlete.acwr > 1.3 ? "amber" : "green"}
              trend="up"
              trendLabel="リスクゾーン"
            />
          </div>

          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>14日間個別トレンド</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="NRS" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ACWR" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {differentials.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PACE推論</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {differentials[0] && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-900">{differentials[0].label}</span>
                      <span className="text-amber-700 font-bold text-lg">
                        {Math.round(differentials[0].probability * 100)}pt
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">最有力評価候補（AI補助）</p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">鑑別候補（AI補助）</p>
                  {differentials.slice(1).map((d) => (
                    <div key={d.diagnosis_code} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-48 truncate">{d.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-blue-400"
                          style={{ width: `${Math.round(d.probability * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">
                        {Math.round(d.probability * 100)}pt
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>ハードロック / ソフトロック</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 border border-red-200">
                  ankle_impact — HARD LOCK
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700 border border-amber-200">
                  bilateral_jump — SOFT LOCK
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Link href={`/assessment/${athlete.id}`}>
              <Button variant="primary">アセスメント開始</Button>
            </Link>
          </div>
        </div>
      )}

      {activeTab === "program" && (
        <div className="space-y-4">
          {workout ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  AI生成メニュー — {workout.total_duration_min}分 / {workout.menu.length}種目
                </p>
                <span className="text-xs text-gray-400">
                  生成: {new Date(workout.generated_at).toLocaleString("ja-JP")}
                </span>
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
                            {item.cues && (
                              <p className="text-xs text-gray-500 mt-1 italic">{item.cues}</p>
                            )}
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

              {workout.notes && (
                <Card>
                  <CardContent>
                    <p className="text-xs font-medium text-gray-500 mb-1">注意事項</p>
                    <p className="text-sm text-gray-700">{workout.notes}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline">修正</Button>
                <Button variant="primary">承認・配信</Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-gray-400">
                AI生成メニューがまだありません
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "ai" && (
        <div className="space-y-4">
          {/* 精度アップデートログ */}
          <CalibrationUpdateLog
            events={[
              {
                feature: "ハムストリングスの回復速度",
                improvementPct: 12,
                dataDays: 21,
                updatedAt: new Date(Date.now() - 3600000).toISOString(),
              },
              {
                feature: "ACWR感受性",
                improvementPct: 8,
                dataDays: 21,
                updatedAt: new Date(Date.now() - 7200000).toISOString(),
              },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 予測の視界 */}
            <PredictionHorizon
              streakDays={5}
              lastCheckinDate={new Date(Date.now() - 86400000).toISOString()}
              fullHorizonDays={14}
            />

            {/* AI習熟度マップ */}
            <AiProficiencyRadar
              dataDays={21}
              metrics={[
                { label: "リカバリー特性", value: 90 },
                { label: "インテンシティ耐性", value: 65 },
                { label: "スプリント相関", value: 40 },
                { label: "睡眠感度", value: 55 },
                { label: "心理的負荷", value: 30 },
              ]}
            />
          </div>

          {/* 答え合わせ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TruthValidation
              athleteId={athlete.id}
              target="damage_prediction"
              predictedValue={68}
              predictionDate={new Date().toISOString()}
            />
            <TruthValidation
              athleteId={athlete.id}
              target="readiness_score"
              predictedValue={74}
              predictionDate={new Date().toISOString()}
            />
          </div>

          <p className="text-2xs text-slate-400 text-center">
            ※ AI習熟度はチェックインデータの蓄積とともに向上します
          </p>
        </div>
      )}

      {activeTab === "soap" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => window.open(`/print/soap/soap-1`, "_blank")}
            >
              PDF出力
            </Button>
          </div>
          {[
            { key: "S", label: "S（主観的情報）", value: soapS, setter: setSoapS },
            { key: "O", label: "O（客観的情報）", value: soapO, setter: setSoapO },
            { key: "A", label: "A（評価）", value: soapA, setter: setSoapA },
            { key: "P", label: "P（計画）", value: soapP, setter: setSoapP },
          ].map(({ key, label, value, setter }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <textarea
                value={value}
                onChange={(e) => setter(e.target.value)}
                rows={3}
                placeholder={`${key}セクションを入力...`}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
          ))}
          <div className="flex justify-end gap-3">
            <Button variant="secondary">AI補助入力</Button>
            <Button variant="primary">保存</Button>
          </div>
        </div>
      )}
    </div>
  );
}
