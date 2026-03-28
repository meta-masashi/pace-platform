"use client";

/**
 * DashboardClient v4.0
 * - Layer 1: Bio-Overview (Hero Metric + Vital Signs + Contextual Actions)
 * - Layer 2: 3タブチャート (ACWR / Readiness / Fitness vs Fatigue)
 * - Layer 3: Future Canvas (時系列予測 + What-If シミュレーター)
 * - Today's Action: Critical(赤) / Watchlist(amber) / Normal(緑) / Zone(青)
 */

import { useState, useMemo, useEffect } from "react";
import { MorningMonopoly } from "@/components/dashboard/morning-monopoly";
import { BioOverview } from "@/components/dashboard/bio-overview";
import { FutureCanvas } from "@/components/dashboard/future-canvas";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
} from "recharts";
import { Bell } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { TriageEntry } from "@/types";

// ─── 型定義 ───────────────────────────────────────────────────────────────

interface ChartDataPoint {
  date: string;
  ACWR: number;
  NRS: number;
  HRV: number;
  readiness?: number;
  fitness?: number;
  fatigue?: number;
}

interface AthleteCondition {
  id: string;
  name: string;
  position: string | null;
  readiness_score: number;
  acwr: number;
  acwr_zone: string;
  fitness_score: number;
  fatigue_score: number;
  status: "critical" | "watchlist" | "normal" | "zone";
  hrv_baseline_delta: number | null;
  checkin_submitted: boolean;
}

interface DashboardClientProps {
  chartData: ChartDataPoint[];
  triageEntries: TriageEntry[];
  criticalCount: number;
  watchlistCount: number;
  avgHp: number;
  totalAthletes: number;
  todayLabel: string;
  // v3.2 追加
  teamCondition?: {
    team_readiness_avg: number;
    normal_count: number;
    zone_count: number;
    checkin_rate: number;
    athletes: AthleteCondition[];
  } | null;
}

// ─── ステータス設定 ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  critical:  { label: "Critical",  bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500"    },
  watchlist: { label: "Watchlist", bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500"  },
  normal:    { label: "Normal",    bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500"  },
  zone:      { label: "Zone",      bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"   },
};

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── ACWR ゾーンバッジ ────────────────────────────────────────────────────

function AcwrBadge({ zone, value }: { zone: string; value: number }) {
  const cfg = {
    safe:    { label: "低負荷",  cls: "bg-blue-50 text-blue-700" },
    optimal: { label: "適正",    cls: "bg-green-50 text-green-700" },
    caution: { label: "注意",    cls: "bg-amber-50 text-amber-700" },
    danger:  { label: "過負荷", cls: "bg-red-50 text-red-700" },
  }[zone] ?? { label: zone, cls: "bg-gray-50 text-gray-600" };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.cls}`}>
      {value.toFixed(2)} {cfg.label}
    </span>
  );
}

// ─── Readiness カラー ─────────────────────────────────────────────────────

function readinessColor(score: number): string {
  if (score >= 85) return "text-teal-600";
  if (score >= 70) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

// ─── チャートタブ ─────────────────────────────────────────────────────────

type ChartTab = "acwr" | "readiness" | "fitness_fatigue";

const CHART_TABS: { key: ChartTab; label: string }[] = [
  { key: "acwr",           label: "負荷バランス（急性 / 慢性）" },
  { key: "readiness",      label: "出場可能スコア" },
  { key: "fitness_fatigue", label: "コンディション推移（体力 vs 疲労）" },
];

function TeamChart({ data, tab }: { data: ChartDataPoint[]; tab: ChartTab }) {
  if (tab === "acwr") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 2.5]} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "過負荷ライン 1.5", fill: "#ef4444", fontSize: 10 }} />
          <ReferenceLine y={1.3} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "注意ライン 1.3", fill: "#f59e0b", fontSize: 10 }} />
          <Line type="monotone" dataKey="ACWR" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="負荷バランス（チーム平均）" />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (tab === "readiness") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="readinessGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip />
          <ReferenceLine y={60} stroke="#d97706" strokeDasharray="4 4" label={{ value: "注意ライン", fill: "#d97706", fontSize: 10 }} />
          <Area type="monotone" dataKey="readiness" stroke="#16a34a" strokeWidth={2.5} fill="url(#readinessGrad)" name="出場可能度" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Fitness vs Fatigue
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="fatigue" fill="#ef444422" stroke="#ef4444" strokeWidth={1} name="疲労" radius={[2,2,0,0]} />
        <Line type="monotone" dataKey="fitness" stroke="#16a34a" strokeWidth={2.5} dot={false} name="体力（フィットネス）" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── メインコンポーネント ──────────────────────────────────────────────────

export function DashboardClient({
  chartData,
  triageEntries,
  criticalCount,
  watchlistCount,
  avgHp,
  totalAthletes,
  todayLabel,
  teamCondition,
}: DashboardClientProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>("acwr");

  // 7AM Monopoly mode: activate client-side only to avoid hydration mismatch
  const [monopolyMode, setMonopolyMode] = useState(false);
  useEffect(() => {
    const isBeforeTen = new Date().getHours() < 10;
    if (isBeforeTen && (criticalCount + watchlistCount) > 0) {
      setMonopolyMode(true);
    }
  }, [criticalCount, watchlistCount]);

  const alertCount = criticalCount + watchlistCount;
  const normalCount = teamCondition?.normal_count ?? 0;
  const zoneCount   = teamCondition?.zone_count   ?? 0;
  const avgReadiness = teamCondition?.team_readiness_avg ?? 0;
  const checkinRate  = teamCondition?.checkin_rate ?? 0;

  // Today's Action: teamCondition から取得、なければ triageEntries にフォールバック
  const actionAthletes: AthleteCondition[] = teamCondition?.athletes ?? [];
  const criticalAthletes  = actionAthletes.filter((a) => a.status === "critical");
  const watchlistAthletes = actionAthletes.filter((a) => a.status === "watchlist");
  const actionList = [...criticalAthletes, ...watchlistAthletes].slice(0, 10);

  // 7AM Monopoly View
  if (monopolyMode) {
    return (
      <MorningMonopoly
        athletes={actionAthletes.map((a) => ({
          ...a,
          nlg_summary: undefined,
          recommendation: undefined,
          evidence_text: undefined,
          risk_score: undefined,
        }))}
        teamReadinessAvg={avgReadiness}
        criticalCount={criticalCount}
        watchlistCount={watchlistCount}
        onExitMonopoly={() => setMonopolyMode(false)}
      />
    );
  }

  // Future Canvas data: past 14 + future 7 days
  // Deterministic seed to avoid SSR/CSR hydration mismatch (no Math.random)
  const futureCanvasData = useMemo(() => {
    const past = chartData.map((d) => ({
      date: d.date,
      load: Math.round(d.NRS * 10),
      damage: Math.round(d.readiness ? 100 - d.readiness : 50),
      acwr: d.ACWR * 20,
      isFuture: false,
    }));
    // Generate 7 future days with deterministic projected trend
    const lastLoad = past.length > 0 ? past[past.length - 1]!.load : 50;
    const lastDmg = past.length > 0 ? past[past.length - 1]!.damage : 40;
    const seeds = [0.12, 0.08, -0.05, 0.15, -0.02, 0.10, 0.06]; // fixed offsets
    for (let i = 1; i <= 7; i++) {
      const offset = seeds[i - 1]!;
      // Use todayLabel as date anchor instead of new Date() to keep SSR/CSR consistent
      past.push({
        date: `+${i}日`,
        load: Math.round(lastLoad * (1 + offset)),
        damage: Math.min(100, Math.round(lastDmg + i * 3 * (0.5 + offset))),
        acwr: 22 + i * 0.8,
        isFuture: true,
      });
    }
    return past;
  }, [chartData]);

  return (
    <div className="space-y-6">
      {/* ── ヘッダー ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ダッシュボード</h1>
          <p className="text-sm text-slate-500 mt-0.5">{todayLabel}</p>
        </div>
        <span className="text-sm text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-md font-medium">
          選手数: {totalAthletes}名
        </span>
      </div>

      {/* ── Layer 1: Bio-Overview ── */}
      <BioOverview
        teamReadiness={avgReadiness}
        fullMenuCount={normalCount + zoneCount}
        totalAthletes={totalAthletes}
        readinessDelta={0}
        checkinRate={checkinRate}
        missingCheckinCount={totalAthletes - Math.round(totalAthletes * checkinRate / 100)}
        teamAcwr={chartData.length > 0 ? chartData[chartData.length - 1]!.ACWR : 1.0}
        criticalCount={criticalCount}
        watchlistCount={watchlistCount}
      />

      {/* ── KPI Row (retained as secondary detail) ── */}
      <div className="kpi-row-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="即時対応"
          value={String(criticalCount)}
          unit="名"
          color="red"
          emphasis
          trend={criticalCount > 0 ? "up" : "stable"}
          trendLabel="要即対応"
          subtitle="高負荷 または 痛み強度6以上"
        />
        <KpiCard
          title="チェックイン率"
          value={`${checkinRate}`}
          unit="%"
          color={checkinRate >= 80 ? "green" : checkinRate >= 60 ? "amber" : "red"}
          trend="stable"
          trendLabel="本日提出"
          subtitle={`${totalAthletes}名中`}
        />
        <KpiCard
          title="チーム出場可能度"
          value={String(Math.round(avgReadiness))}
          unit=""
          color={avgReadiness >= 70 ? "green" : avgReadiness >= 50 ? "amber" : "red"}
          trend="stable"
          trendLabel={`フル稼働 ${normalCount}名 / 別メニュー ${zoneCount}名`}
          subtitle="チーム平均スコア"
        />
        <KpiCard
          title="要注意"
          value={String(watchlistCount)}
          unit="名"
          color="amber"
          emphasis
          trend={watchlistCount > 0 ? "up" : "stable"}
          trendLabel="経過観察中"
          subtitle="負荷バランス注意 or 痛み4〜5"
        />
      </div>

      {/* ── .yt-chart-wrap: 3タブチャート ── */}
      <Card className="yt-chart-wrap">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>チームトレンド（14日間）</CardTitle>
            {/* タブ切り替え */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {CHART_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[32px]
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1
                    ${
                      activeTab === t.key
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  aria-pressed={activeTab === t.key}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TeamChart data={chartData} tab={activeTab} />
        </CardContent>
      </Card>

      {/* ── Today's Action ── */}
      {actionList.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>本日のアクション</CardTitle>
              <span className="text-xs text-gray-400">{actionList.length}名 要対応</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {actionList.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.status} />
                    <span className="font-medium text-sm text-gray-900">{a.name}</span>
                    {a.position && <span className="text-xs text-gray-400">{a.position}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className={`text-sm font-bold ${readinessColor(a.readiness_score)}`}>
                        {Math.round(a.readiness_score)}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">RDN</span>
                    </div>
                    <AcwrBadge zone={a.acwr_zone} value={a.acwr} />
                    {!a.checkin_submitted && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">未提出</span>
                    )}
                    <div className="flex gap-1.5">
                      <a
                        href={`/players/${a.id}`}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        詳細
                      </a>
                      <a
                        href={`/assessment/${a.id}`}
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                      >
                        アセスメント
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* triageEntries フォールバック（teamCondition なし時） */}
      {actionList.length === 0 && triageEntries.length > 0 && (
        <Card>
          <CardHeader><CardTitle>本日のアクション</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {triageEntries.map((entry) => (
                <div key={entry.athlete_id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={entry.priority}>
                      {entry.priority === "critical" ? "Critical" : "Watchlist"}
                    </Badge>
                    <span className="font-medium text-sm text-gray-900">{entry.athlete_name}</span>
                    <span className="text-xs text-gray-500">{entry.position}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {entry.pace_inference_label && (
                      <span className="text-xs text-gray-600">
                        {entry.pace_inference_label}
                        {entry.pace_inference_confidence != null && (
                          <span className="text-gray-400 ml-1">{entry.pace_inference_confidence}%</span>
                        )}
                      </span>
                    )}
                    <div className="flex gap-2">
                      <a href={`/players/${entry.athlete_id}`} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">詳細</a>
                      <a href={`/assessment/${entry.athlete_id}`} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors">アセスメント開始</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Layer 3: Future Canvas (予測 + What-If シミュレーター) ── */}
      <FutureCanvas pastData={futureCanvasData} />
    </div>
  );
}
