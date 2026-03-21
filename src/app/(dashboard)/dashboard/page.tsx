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
import { mockMetrics, mockTriageEntries } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

function buildChartData() {
  const metrics = mockMetrics["athlete-1"];
  return metrics.map((m) => ({
    date: formatDate(m.date),
    ACWR: parseFloat(m.acwr.toFixed(2)),
    NRS: parseFloat(m.nrs.toFixed(1)),
    HRV: parseFloat((m.hrv / 10).toFixed(2)),
  }));
}

export default function DashboardPage() {
  const chartData = buildChartData();
  const criticalEntries = mockTriageEntries.filter((e) => e.priority === "critical");
  const watchlistEntries = mockTriageEntries.filter((e) => e.priority === "watchlist");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-0.5">2026年3月21日（土）</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-md">
            本日のチェックイン: 16/18名 (09:30時点)
          </span>
          <Button variant="primary">
            <Bell className="w-4 h-4 mr-1.5" />
            一括配信
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="チェックイン率"
          value="89"
          unit="%"
          trend="up"
          trendLabel="前日比 +3%"
          color="green"
        />
        <KpiCard
          title="At-Risk 選手"
          value="3"
          unit="名"
          color="red"
          subtitle="Critical 1名 / Watchlist 2名"
          trend="stable"
          trendLabel="変化なし"
        />
        <KpiCard
          title="チーム平均 HP"
          value="72"
          unit=""
          trend="stable"
          trendLabel="先週比 ±0"
          color="amber"
        />
        <KpiCard
          title="重要アラート"
          value="2"
          unit="件"
          color="red"
          trend="up"
          trendLabel="本日新規"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>14日間トレンド（田中 健太 / チーム平均）</CardTitle>
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
              <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "ACWR 1.5", fill: "#ef4444", fontSize: 10 }} />
              <Line type="monotone" dataKey="ACWR" stroke="#f59e0b" strokeWidth={2} dot={false} name="ACWR" />
              <Line type="monotone" dataKey="NRS" stroke="#ef4444" strokeWidth={2} dot={false} name="NRS" />
              <Line type="monotone" dataKey="HRV" stroke="#3b82f6" strokeWidth={2} dot={false} name="HRV (÷10)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
                  <span className="text-xs text-gray-600">
                    {entry.pace_inference_label}{" "}
                    <span className="text-gray-400">{entry.pace_inference_confidence}%</span>
                  </span>
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
    </div>
  );
}
