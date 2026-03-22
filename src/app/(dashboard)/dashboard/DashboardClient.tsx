"use client";

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
} from "recharts";
import { Bell } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { TriageEntry } from "@/types";

interface ChartDataPoint {
  date: string;
  ACWR: number;
  NRS: number;
  HRV: number;
}

interface DashboardClientProps {
  chartData: ChartDataPoint[];
  triageEntries: TriageEntry[];
  criticalCount: number;
  watchlistCount: number;
  avgHp: number;
  totalAthletes: number;
  todayLabel: string;
}

export function DashboardClient({
  chartData,
  triageEntries,
  criticalCount,
  watchlistCount,
  avgHp,
  totalAthletes,
  todayLabel,
}: DashboardClientProps) {
  const alertCount = criticalCount + watchlistCount;
  const criticalEntries = triageEntries.filter((e) => e.priority === "critical");
  const watchlistEntries = triageEntries.filter((e) => e.priority === "watchlist");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-md">
            選手数: {totalAthletes}名
          </span>
          <Button variant="primary">
            <Bell className="w-4 h-4 mr-1.5" />
            一括配信
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="登録選手数"
          value={String(totalAthletes)}
          unit="名"
          trend="stable"
          trendLabel="アクティブ"
          color="green"
        />
        <KpiCard
          title="At-Risk 選手"
          value={String(alertCount)}
          unit="名"
          color="red"
          subtitle={`Critical ${criticalCount}名 / Watchlist ${watchlistCount}名`}
          trend="stable"
          trendLabel="要確認"
        />
        <KpiCard
          title="チーム平均 HP"
          value={String(avgHp)}
          unit=""
          trend="stable"
          trendLabel="14日平均"
          color={avgHp < 50 ? "red" : avgHp < 70 ? "amber" : "green"}
        />
        <KpiCard
          title="重要アラート"
          value={String(criticalCount)}
          unit="件"
          color="red"
          trend="up"
          trendLabel="Critical件数"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>14日間トレンド（チーム平均 HP・ACWR・NRS）</CardTitle>
            <span className="text-xs text-gray-400">HRV は ÷10 スケール表示</span>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 2.5]} />
              <Tooltip />
              <Legend />
              <ReferenceLine
                y={1.5}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: "ACWR 1.5", fill: "#ef4444", fontSize: 10 }}
              />
              <Line type="monotone" dataKey="ACWR" stroke="#f59e0b" strokeWidth={2} dot={false} name="ACWR" />
              <Line type="monotone" dataKey="NRS" stroke="#ef4444" strokeWidth={2} dot={false} name="NRS" />
              <Line type="monotone" dataKey="HRV" stroke="#3b82f6" strokeWidth={2} dot={false} name="HRV (÷10)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {(criticalEntries.length > 0 || watchlistEntries.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>本日のアクション</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {[...criticalEntries, ...watchlistEntries].map((entry) => (
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
                        {entry.pace_inference_label}{" "}
                        {entry.pace_inference_confidence != null && (
                          <span className="text-gray-400">{entry.pace_inference_confidence}%</span>
                        )}
                      </span>
                    )}
                    <div className="flex gap-2">
                      <a
                        href={`/players/${entry.athlete_id}`}
                        className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        詳細
                      </a>
                      <a
                        href={`/assessment/${entry.athlete_id}`}
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                      >
                        アセスメント開始
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
