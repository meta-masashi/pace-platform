"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { GripVertical, Clock, Dumbbell, Zap, Shield, Wind, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { mockTeamWorkout } from "@/lib/mock-data";
import type { WorkoutItem } from "@/types";

const weeklyData = [
  { day: "月", acwr: 1.05 },
  { day: "火", acwr: 1.12 },
  { day: "水", acwr: 1.28 },
  { day: "木", acwr: 1.35 },
  { day: "金", acwr: 1.42 },
  { day: "土", acwr: 1.38 },
  { day: "日", acwr: 1.1 },
];

const BLOCK_META: Record<string, { icon: React.ReactNode; color: string; headerColor: string; duration: string }> = {
  "ウォームアップ・コレクティブ": {
    icon: <Wind className="w-4 h-4" />,
    color: "bg-blue-50 border-blue-100",
    headerColor: "bg-blue-100 text-blue-800",
    duration: "25分",
  },
  "ストレングス": {
    icon: <Dumbbell className="w-4 h-4" />,
    color: "bg-purple-50 border-purple-100",
    headerColor: "bg-purple-100 text-purple-800",
    duration: "40分",
  },
  "プライオメトリクス": {
    icon: <Zap className="w-4 h-4" />,
    color: "bg-amber-50 border-amber-100",
    headerColor: "bg-amber-100 text-amber-800",
    duration: "20分",
  },
  "コアスタビリティ": {
    icon: <Shield className="w-4 h-4" />,
    color: "bg-green-50 border-green-100",
    headerColor: "bg-green-100 text-green-800",
    duration: "20分",
  },
  "クールダウン": {
    icon: <Clock className="w-4 h-4" />,
    color: "bg-gray-50 border-gray-100",
    headerColor: "bg-gray-100 text-gray-700",
    duration: "15分",
  },
};

function rpeColor(rpe?: number): string {
  if (!rpe) return "bg-gray-100 text-gray-500";
  if (rpe >= 17) return "bg-red-100 text-red-700";
  if (rpe >= 15) return "bg-orange-100 text-orange-700";
  if (rpe >= 13) return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-600";
}

function rpeLabel(rpe?: number): string {
  if (!rpe) return "";
  if (rpe >= 17) return `RPE ${rpe} 高強度`;
  if (rpe >= 15) return `RPE ${rpe} 中〜高`;
  if (rpe >= 13) return `RPE ${rpe} 中強度`;
  return `RPE ${rpe} 低〜中`;
}

// ─── Periodization config ─────────────────────────────────────
type MesocyclePhase = "accumulation" | "intensification" | "realization" | "taper";

const MESO_CONFIG: Record<MesocyclePhase, {
  label: string; labelJa: string; weeks: string;
  emphasis: Record<string, number>; acwrTarget: string; volumePct: number; description: string;
}> = {
  accumulation: {
    label: "蓄積期", labelJa: "蓄積期（Accumulation）", weeks: "W1-W3",
    emphasis: { ウォームアップ: 15, ストレングス: 40, プライオメトリクス: 15, コアスタビリティ: 20, クールダウン: 10 },
    acwrTarget: "0.8–1.1", volumePct: 85,
    description: "基礎筋力と動作パターンの構築。量多め・強度低め。",
  },
  intensification: {
    label: "強化期", labelJa: "強化期（Intensification）", weeks: "W4-W6",
    emphasis: { ウォームアップ: 12, ストレングス: 35, プライオメトリクス: 28, コアスタビリティ: 18, クールダウン: 7 },
    acwrTarget: "1.1–1.3", volumePct: 100,
    description: "最大筋力と爆発力の向上。量やや下げ・強度アップ。",
  },
  realization: {
    label: "実現期", labelJa: "実現期（Realization）", weeks: "W7-W8",
    emphasis: { ウォームアップ: 20, ストレングス: 25, プライオメトリクス: 30, コアスタビリティ: 15, クールダウン: 10 },
    acwrTarget: "1.2–1.5", volumePct: 110,
    description: "スポーツ特異性とパワー発揮の最大化。試合へのピーク期。",
  },
  taper: {
    label: "テーパリング", labelJa: "テーパリング（Taper）", weeks: "W9-W10",
    emphasis: { ウォームアップ: 25, ストレングス: 20, プライオメトリクス: 15, コアスタビリティ: 25, クールダウン: 15 },
    acwrTarget: "0.8–1.0", volumePct: 60,
    description: "疲労除去・コンディション最適化。量大幅減・強度維持。",
  },
};

export default function TeamTrainingPage() {
  const [approved, setApproved] = useState(false);
  const [showPeriodization, setShowPeriodization] = useState(false);
  const [mesophase, setMesophase] = useState<MesocyclePhase>("intensification");

  // Group menu items by block
  const blocks = mockTeamWorkout.menu.reduce<Record<string, WorkoutItem[]>>((acc, item) => {
    const blockName = item.block ?? "その他";
    if (!acc[blockName]) acc[blockName] = [];
    acc[blockName].push(item);
    return acc;
  }, {});

  const blockOrder = ["ウォームアップ・コレクティブ", "ストレングス", "プライオメトリクス", "コアスタビリティ", "クールダウン"];

  let globalIndex = 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">チームトレーニング</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {mockTeamWorkout.total_duration_min}分 / {mockTeamWorkout.menu.length}種目 —
            ACWR 1.35（注意域・通常比90%負荷設定）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPeriodization(v => !v)}>
            <Settings2 className="w-4 h-4 mr-1" />
            期分け設定
          </Button>
          <Button variant="outline" onClick={() => window.open('/print/training', '_blank')}>PDF出力</Button>
          <Button variant="secondary">AIメニュー再生成</Button>
          <Button variant="primary" onClick={() => setApproved(true)} disabled={approved}>
            {approved ? "✓ 配信済み" : "承認・配信"}
          </Button>
        </div>
      </div>

      {/* Periodization panel */}
      {showPeriodization && (() => {
        const meso = MESO_CONFIG[mesophase];
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-gray-500" />
                期分け・カテゴリ設定
              </h2>
              <span className="text-xs text-gray-400">AIメニュー再生成時に反映されます</span>
            </div>

            {/* Phase selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">メソサイクルフェーズ</p>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(MESO_CONFIG) as [MesocyclePhase, typeof MESO_CONFIG[MesocyclePhase]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setMesophase(key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      mesophase === key
                        ? "bg-green-600 text-white border-green-600 shadow-sm"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-semibold">{cfg.label}</p>
                    <p className={`text-xs mt-0.5 ${mesophase === key ? "text-green-100" : "text-gray-400"}`}>{cfg.weeks}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">{meso.description}</p>
            </div>

            {/* Category emphasis */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">カテゴリ比重</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>総量: 通常比 <span className={`font-semibold ${meso.volumePct >= 100 ? "text-amber-600" : meso.volumePct < 80 ? "text-blue-600" : "text-green-600"}`}>{meso.volumePct}%</span></span>
                  <span>ACWR目標: <span className="font-semibold text-gray-700">{meso.acwrTarget}</span></span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(meso.emphasis).map(([block, pct]) => {
                  const colors: Record<string, string> = {
                    ウォームアップ: "bg-blue-400", ストレングス: "bg-purple-400",
                    プライオメトリクス: "bg-amber-400", コアスタビリティ: "bg-green-400", クールダウン: "bg-gray-300",
                  };
                  return (
                    <div key={block} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-36 flex-shrink-0">{block}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${colors[block] ?? "bg-gray-400"} transition-all duration-300`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ACWR warning banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">ACWR 1.35 — 注意域：</span>
          急性負荷が慢性負荷を上回っています。総量を増やさず、強度管理を徹底してください。
          プライオメトリクス台高は低めに設定済みです。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">

          {blockOrder.map((blockName) => {
            const items = blocks[blockName];
            if (!items || items.length === 0) return null;
            const meta = BLOCK_META[blockName];

            return (
              <div key={blockName} className="space-y-2">
                {/* Block header */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${meta.headerColor}`}>
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {meta.icon}
                    {blockName}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium opacity-80">
                    <span>{items.length}種目</span>
                    <span>{meta.duration}</span>
                  </div>
                </div>

                {/* Block items */}
                <div className={`rounded-lg border ${meta.color} divide-y divide-gray-100`}>
                  {items.map((item) => {
                    globalIndex++;
                    return (
                      <div
                        key={item.exercise_id}
                        className="flex items-start gap-3 px-3 py-3"
                      >
                        <button className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab flex-shrink-0">
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <div className="w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {globalIndex}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 text-sm">{item.exercise_name}</p>
                            {item.rpe && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${rpeColor(item.rpe)}`}>
                                {rpeLabel(item.rpe)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.sets}セット ×{" "}
                            {item.reps_or_time}
                            {item.unit === "reps" ? "回" : item.unit === "sec" ? "秒" : "分"}
                          </p>
                          {item.cues && (
                            <p className="text-xs text-gray-500 italic mt-1">💡 {item.cues}</p>
                          )}
                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                            {item.reason}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {mockTeamWorkout.notes && (
            <Card>
              <CardHeader>
                <CardTitle>ハードロック除外 / 個別調整</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed">{mockTeamWorkout.notes}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                    田中 健太 — ankle_impact HARD LOCK
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                    田中 健太 — bilateral_jump HARD LOCK
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                    鈴木 大輔 — スクワット荷重50% SOFT LOCK
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                    山田 翔 — RPE上限14（HRV低下）
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>週次 ACWR 推移</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 2]} />
                  <Tooltip formatter={(v: unknown) => [`ACWR ${(v as number).toFixed(2)}`, ""]} />
                  <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "1.5", fontSize: 10, fill: "#ef4444" }} />
                  <ReferenceLine y={0.8} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "0.8", fontSize: 10, fill: "#f59e0b" }} />
                  <Bar
                    dataKey="acwr"
                    radius={[3, 3, 0, 0]}
                    fill="#22c55e"
                    label={false}
                    // Color each bar based on zone
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-red-400 inline-block" />
                  <span>1.5以上 — 高負荷リスク域（傷害リスク増大）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-400 inline-block" />
                  <span>0.8未満 — 低負荷注意（フィットネス低下）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2 bg-green-400 inline-block rounded" />
                  <span>0.8〜1.5 — 最適域</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>今日のセッション設計</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                {blockOrder.map((name) => {
                  const meta = BLOCK_META[name];
                  const count = blocks[name]?.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${meta.headerColor}`}>
                          {name}
                        </span>
                      </div>
                      <span className="text-gray-500">{count}種目 / {meta.duration}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t pt-2 flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>合計</span>
                <span>{mockTeamWorkout.menu.length}種目 / {mockTeamWorkout.total_duration_min}分</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>負荷配分目標（sRPE法）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: "ACWR 0.8–1.3（最適）", pct: 65, color: "bg-green-400" },
                { label: "ACWR 1.3–1.5（注意）", pct: 25, color: "bg-amber-400" },
                { label: "ACWR 1.5+（高リスク）", pct: 10, color: "bg-red-400" },
              ].map(({ label, pct, color }) => (
                <div key={label} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{label}</span>
                    <span className="text-gray-500">{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-1 leading-relaxed">
                推定セッションRPE: 13.8 × 120分 = 1,656 AU
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
