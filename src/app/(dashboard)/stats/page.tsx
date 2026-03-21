"use client";

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { ShieldCheck, CheckCircle, Clock } from "lucide-react";
import { mockAthletes, mockAuditLogs, mockEscalations } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";

// ─── Mock stats data ─────────────────────────────────────────
const injuryByBodyPart = [
  { part: "下肢（足関節）", count: 4, color: "#ef4444" },
  { part: "下肢（膝関節）", count: 3, color: "#f97316" },
  { part: "下肢（股関節）", count: 2, color: "#f59e0b" },
  { part: "体幹・腰部", count: 2, color: "#84cc16" },
  { part: "上肢（肩）", count: 1, color: "#22c55e" },
  { part: "頭部・頸部", count: 1, color: "#06b6d4" },
];

const injuryByPosition = [
  { position: "FW", count: 4 },
  { position: "MF", count: 5 },
  { position: "DF", count: 3 },
  { position: "GK", count: 1 },
];

const teamACWRTrend = [
  { week: "2/23週", acwr: 1.02 },
  { week: "3/2週",  acwr: 1.18 },
  { week: "3/9週",  acwr: 1.28 },
  { week: "3/16週", acwr: 1.35 },
];

const rtpData = [
  { name: "田中 健太",  position: "FW", diagnosis: "足関節可動域制限", days: 12, phase: 1, status: "active" },
  { name: "鈴木 大輔",  position: "MF", diagnosis: "膝関節メカニカルストレスパターン", days: 28, phase: 3, status: "active" },
  { name: "山田 翔",    position: "DF", diagnosis: "腰部筋膜炎パターン", days: 7,  phase: 2, status: "active" },
  { name: "佐藤 雄太",  position: "MF", diagnosis: "股関節可動域制限", days: 21, phase: 4, status: "completed" },
  { name: "松本 涼",    position: "FW", diagnosis: "膝関節前方不安定性パターン", days: 45, phase: 3, status: "active" },
];

const monthlyActivity = [
  { date: "3/1",  assessments: 2, approvals: 3, notes: 2 },
  { date: "3/3",  assessments: 1, approvals: 2, notes: 1 },
  { date: "3/5",  assessments: 3, approvals: 4, notes: 3 },
  { date: "3/8",  assessments: 0, approvals: 2, notes: 1 },
  { date: "3/10", assessments: 2, approvals: 3, notes: 2 },
  { date: "3/12", assessments: 1, approvals: 1, notes: 1 },
  { date: "3/15", assessments: 2, approvals: 3, notes: 2 },
  { date: "3/17", assessments: 1, approvals: 2, notes: 2 },
  { date: "3/19", assessments: 0, approvals: 1, notes: 1 },
  { date: "3/21", assessments: 2, approvals: 2, notes: 3 },
];

const hpTrend = [
  { week: "2/23週", avg: 72 },
  { week: "3/2週",  avg: 68 },
  { week: "3/9週",  avg: 65 },
  { week: "3/16週", avg: 61 },
];

const criticalCount = mockAthletes.filter(a => a.status === "critical").length;
const watchlistCount = mockAthletes.filter(a => a.status === "watchlist").length;
const activeRTP = rtpData.filter(r => r.status === "active").length;
const avgRTPDays = Math.round(rtpData.filter(r => r.status === "active").reduce((s, r) => s + r.days, 0) / activeRTP);

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">コンディション統計</h1>
        <p className="text-sm text-gray-500 mt-0.5">チーム全体の傷害・負荷・パフォーマンスの可視化</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Critical" value={criticalCount} unit="名" color="red" trend="up" trendLabel="要即時対応" />
        <KpiCard title="Watchlist" value={watchlistCount} unit="名" color="amber" trend="stable" trendLabel="継続観察中" />
        <KpiCard title="介入中 RTP" value={activeRTP} unit="件" color="amber" trend="stable" trendLabel="平均" />
        <KpiCard title="平均 RTP日数" value={avgRTPDays} unit="日" color="amber" trend="stable" trendLabel="アクティブ" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Injury by body part */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>部位別傷害発生数（今季）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={injuryByBodyPart} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="part" tick={{ fontSize: 11 }} width={140} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {injuryByBodyPart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Injury by position */}
        <Card>
          <CardHeader>
            <CardTitle>ポジション別傷害</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={injuryByPosition}
                  dataKey="count"
                  nameKey="position"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  isAnimationActive={false}
                >
                  {injuryByPosition.map((_, i) => (
                    <Cell key={i} fill={["#ef4444","#f59e0b","#22c55e","#06b6d4"][i]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
                <Tooltip formatter={(v: unknown) => [`${v}件`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Team ACWR trend */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>チーム ACWR 週次推移</CardTitle>
              <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                現在 1.35 — 注意域
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={teamACWRTrend} margin={{ top: 4, right: 20, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0.8, 1.8]} />
                <Tooltip formatter={(v: unknown) => [`ACWR ${(v as number).toFixed(2)}`, ""]} />
                <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "1.5", fontSize: 9, fill: "#ef4444" }} />
                <ReferenceLine y={1.3} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "1.3", fontSize: 9, fill: "#f59e0b" }} />
                <Line type="monotone" dataKey="acwr" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4, fill: "#22c55e" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 mt-1">
              4週間でACWRが0.33上昇。直近2週のハードワーク集積に注意。
            </p>
          </CardContent>
        </Card>

        {/* Team HP trend */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>チーム平均 HP 推移</CardTitle>
              <span className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">
                4週で −11pt
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={hpTrend} margin={{ top: 4, right: 20, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[40, 100]} />
                <Tooltip formatter={(v: unknown) => [`HP ${v}pt`, ""]} />
                <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "注意", fontSize: 9, fill: "#f59e0b" }} />
                <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 mt-1">
              強化期の蓄積疲労と傷害者増加が要因。リカバリーウィーク検討を推奨。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* RTP tracker */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>復帰プロセス（RTP）トラッカー</CardTitle>
            <p className="text-xs text-gray-400">介入中 {activeRTP}件 / 今季完了 {rtpData.filter(r => r.status === "completed").length}件</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rtpData.map((r, i) => {
              const phasePct = (r.phase / 4) * 100;
              const phaseColors = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-green-400"];
              return (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-24 flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.position}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 truncate mb-1">{r.diagnosis}</p>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${phaseColors[r.phase]} ${r.status === "completed" ? "bg-green-500" : ""}`}
                        style={{ width: `${r.status === "completed" ? 100 : phasePct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-gray-400">Phase {r.phase}/4</span>
                      {r.status === "completed"
                        ? <span className="text-xs text-green-600 font-medium">復帰完了</span>
                        : <span className="text-xs text-gray-500">{r.days}日目</span>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* AT activity log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>AT 活動ログ（3月）</CardTitle>
            <p className="text-xs text-gray-400">アセスメント・承認・SOAPノートの記録</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyActivity} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="assessments" name="アセスメント" fill="#22c55e" radius={[2,2,0,0]} isAnimationActive={false} />
                  <Bar dataKey="approvals" name="承認" fill="#3b82f6" radius={[2,2,0,0]} isAnimationActive={false} />
                  <Bar dataKey="notes" name="SOAPノート" fill="#8b5cf6" radius={[2,2,0,0]} isAnimationActive={false} />
                  <Legend iconType="circle" iconSize={6} formatter={(v) => <span className="text-xs text-gray-600">{v}</span>} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">今月の実績サマリー</p>
              {[
                { label: "アセスメント実施", value: monthlyActivity.reduce((s, m) => s + m.assessments, 0), unit: "件", color: "text-green-700 bg-green-50" },
                { label: "メニュー承認", value: monthlyActivity.reduce((s, m) => s + m.approvals, 0), unit: "件", color: "text-blue-700 bg-blue-50" },
                { label: "SOAPノート記録", value: monthlyActivity.reduce((s, m) => s + m.notes, 0), unit: "件", color: "text-purple-700 bg-purple-50" },
                { label: "Hard Lock 発令", value: 2, unit: "件", color: "text-red-700 bg-red-50" },
              ].map(({ label, value, unit, color }) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className={`px-2 py-0.5 rounded text-sm font-bold ${color}`}>
                    {value}{unit}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 leading-relaxed">
                  このレポートはGM・コーチへの月次報告に使用できます。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CDS Audit Trail */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              免責証跡ログ（CDS Audit Trail）
            </CardTitle>
            <span className="text-xs text-gray-400">PACE-CDS-v1.2.0 / 自動記録</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockAuditLogs.map(log => {
              const actionLabels: Record<string, string> = {
                assessment_completed: "アセスメント完了",
                soap_saved: "SOAPノート保存",
                menu_approved: "メニュー承認",
                lock_issued: "Lock発令",
                escalation_sent: "エスカレーション",
                differential_viewed: "鑑別候補閲覧",
              };
              const actionColors: Record<string, string> = {
                assessment_completed: "bg-green-100 text-green-700",
                soap_saved: "bg-blue-100 text-blue-700",
                menu_approved: "bg-purple-100 text-purple-700",
                lock_issued: "bg-red-100 text-red-700",
                escalation_sent: "bg-orange-100 text-orange-700",
                differential_viewed: "bg-gray-100 text-gray-600",
              };
              return (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-shrink-0 w-36 text-xs text-gray-400 pt-0.5">{formatDateTime(log.timestamp)}</div>
                  <div className="flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${actionColors[log.action_type] ?? "bg-gray-100 text-gray-600"}`}>
                      {actionLabels[log.action_type] ?? log.action_type}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-800">{log.staff_name}</span>
                      <span className="text-xs text-gray-400">{log.staff_role}</span>
                      {log.athlete_name && (
                        <span className="text-xs text-gray-600">→ {log.athlete_name}</span>
                      )}
                    </div>
                    {log.notes && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{log.notes}</p>}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1.5 text-xs">
                    {log.ai_assisted && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">AI使用</span>
                    )}
                    {log.disclaimer_shown && (
                      <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">免責確認</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Escalation history */}
          {mockEscalations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-2">エスカレーション記録</p>
              {mockEscalations.map(esc => (
                <div key={esc.id} className="flex items-start gap-3 text-xs py-1.5">
                  <span className="text-gray-400 w-36 flex-shrink-0">{formatDateTime(esc.created_at)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium flex-shrink-0">緊急</span>
                  <span className="text-gray-700 flex-1 truncate">{esc.from_staff_name} → {esc.to_roles.join("・")} / {esc.athlete_name}</span>
                  {esc.acknowledged_at ? (
                    <div className="flex items-center gap-1 text-green-600 flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> 既読
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600 flex-shrink-0">
                      <Clock className="w-3 h-3" /> 未読
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4 leading-relaxed border-t border-gray-50 pt-3">
            全ログはタイムスタンプ・スタッフID・CDSバージョンとともに保存されます。免責証跡はコンプライアンス対応・インシデント調査に使用できます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
