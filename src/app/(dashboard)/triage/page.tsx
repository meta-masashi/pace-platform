"use client";

import { useState } from "react";
import { RefreshCw, Send, X, ShieldAlert, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mockTriageEntries, mockStaff, mockEscalations } from "@/lib/mock-data";
import { getACWRColor, getNRSColor, getHRVColor, formatDateTime } from "@/lib/utils";
import type { TriggerType, Priority, Role, EscalationRecord, EscalationSeverity } from "@/types";

const triggerLabels: Record<TriggerType, string> = {
  nrs_spike: "NRS急上昇",
  hrv_drop: "HRV低下",
  acwr_exceeded: "ACWR超過",
  subjective_objective_discrepancy: "主客観乖離",
  baseline_deviation: "ベースライン乖離",
};

const priorityLabel: Record<Priority, string> = { critical: "Critical", watchlist: "Watchlist", normal: "Normal" };

const severityStyle: Record<EscalationSeverity, { bg: string; text: string; label: string }> = {
  urgent:  { bg: "bg-red-50 border-red-200",   text: "text-red-700",   label: "緊急" },
  high:    { bg: "bg-amber-50 border-amber-200",text: "text-amber-700", label: "高" },
  routine: { bg: "bg-gray-50 border-gray-200",  text: "text-gray-600",  label: "通常" },
};

interface EscalationTarget {
  athleteId: string;
  athleteName: string;
}

export default function TriagePage() {
  const [escalationTarget, setEscalationTarget] = useState<EscalationTarget | null>(null);
  const [escalations, setEscalations] = useState<EscalationRecord[]>(mockEscalations);
  const [toRoles, setToRoles] = useState<Role[]>(["PT"]);
  const [severity, setSeverity] = useState<EscalationSeverity>("urgent");
  const [sent, setSent] = useState(false);

  const critical = mockTriageEntries.filter((e) => e.priority === "critical").length;
  const watchlist = mockTriageEntries.filter((e) => e.priority === "watchlist").length;
  const normal = 15;

  function handleSendEscalation() {
    if (!escalationTarget) return;
    const newEsc: EscalationRecord = {
      id: `esc-${Date.now()}`,
      created_at: new Date().toISOString(),
      from_staff_id: "staff-2",
      from_staff_name: "鈴木 花子",
      from_role: "AT",
      to_roles: toRoles,
      athlete_id: escalationTarget.athleteId,
      athlete_name: escalationTarget.athleteName,
      severity,
      message: `【${severity === "urgent" ? "緊急" : "高優先"}エスカレーション】${escalationTarget.athleteName} — トリアージにてCritical判定。詳細確認をお願いします。※PACE判断支援補助情報。最終判断は有資格者が行ってください。`,
      audit_log_id: `audit-${Date.now()}`,
    };
    setEscalations(prev => [newEsc, ...prev]);
    setSent(true);
  }

  function closeModal() {
    setEscalationTarget(null);
    setSent(false);
    setToRoles(["PT"]);
    setSeverity("urgent");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">トリアージリスト</h1>
        <Button variant="outline">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          更新
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-red-700 font-bold text-lg">{critical}</span>
          <span className="text-red-600 text-sm font-medium">件 Critical</span>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <span className="text-amber-700 font-bold text-lg">{watchlist}</span>
          <span className="text-amber-600 text-sm font-medium">件 Watchlist</span>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <span className="text-green-700 font-bold text-lg">{normal}</span>
          <span className="text-green-600 text-sm font-medium">件 Normal</span>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">優先度</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">選手名</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ポジション</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">トリガー</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">NRS</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">HRV</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">ACWR</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">PACE推論</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">アクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockTriageEntries.map((entry) => {
                const hasEscalated = escalations.some(e => e.athlete_id === entry.athlete_id);
                return (
                  <tr key={entry.athlete_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant={entry.priority}>{priorityLabel[entry.priority]}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{entry.athlete_name}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.position}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {entry.triggers.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                          >
                            {triggerLabels[t]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${getNRSColor(entry.nrs)}`}>
                      {entry.nrs}
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${getHRVColor(entry.hrv)}`}>
                      {entry.hrv}
                    </td>
                    <td className={`px-4 py-3 text-center font-semibold ${getACWRColor(entry.acwr)}`}>
                      {entry.acwr.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.pace_inference_label && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-800">{entry.pace_inference_label}</span>
                          <span className="text-xs text-gray-400">{entry.pace_inference_confidence}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/players/${entry.athlete_id}`}
                          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          詳細
                        </a>
                        {entry.priority !== "normal" && (
                          <a
                            href={`/assessment/${entry.athlete_id}`}
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            アセスメント
                          </a>
                        )}
                        {entry.priority === "critical" && (
                          <button
                            onClick={() => setEscalationTarget({ athleteId: entry.athlete_id, athleteName: entry.athlete_name })}
                            className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                              hasEscalated
                                ? "bg-blue-50 border border-blue-200 text-blue-600"
                                : "bg-red-600 text-white hover:bg-red-700"
                            }`}
                          >
                            {hasEscalated ? (
                              <><CheckCircle className="w-3 h-3" />送信済</>
                            ) : (
                              <><ShieldAlert className="w-3 h-3" />緊急連絡</>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Escalation history */}
      {escalations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            エスカレーション履歴
          </h2>
          <div className="space-y-2">
            {escalations.map(esc => {
              const sStyle = severityStyle[esc.severity];
              return (
                <div key={esc.id} className={`border rounded-lg p-3 ${sStyle.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sStyle.bg} ${sStyle.text} border ${sStyle.bg}`}>
                          {sStyle.label}
                        </span>
                        <span className="text-xs font-semibold text-gray-800">{esc.athlete_name}</span>
                        <span className="text-xs text-gray-500">→ {esc.to_roles.join("・")}</span>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">{esc.message}</p>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-0.5">
                      <p className="text-xs text-gray-400">{formatDateTime(esc.created_at)}</p>
                      {esc.acknowledged_at ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          <span>既読</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="w-3 h-3" />
                          <span>未読</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {esc.acknowledged_by_name && (
                    <p className="text-xs text-green-600 mt-1">確認: {esc.acknowledged_by_name} — {formatDateTime(esc.acknowledged_at!)}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">証跡ID: {esc.audit_log_id} / PACE-CDS-v1.2.0</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Escalation modal */}
      {escalationTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-bold text-gray-900">緊急連絡 — エスカレーション</h2>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!sent ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <p className="font-semibold mb-1">{escalationTarget.athleteName}</p>
                  <p className="text-xs leading-relaxed">
                    トリアージ: Critical — 専門職への即時連絡が推奨されます
                  </p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">通知先</label>
                    <div className="flex flex-wrap gap-2">
                      {(["PT", "master"] as Role[]).map(role => {
                        const staff = mockStaff.find(s => s.role === role);
                        const checked = toRoles.includes(role);
                        return (
                          <button
                            key={role}
                            onClick={() => setToRoles(prev =>
                              checked ? prev.filter(r => r !== role) : [...prev, role]
                            )}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                              checked ? "bg-red-100 border-red-300 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {role} {staff ? `（${staff.name}）` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">緊急度</label>
                    <div className="flex gap-2">
                      {(["urgent", "high", "routine"] as EscalationSeverity[]).map(s => (
                        <button
                          key={s}
                          onClick={() => setSeverity(s)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                            severity === s ? "bg-gray-800 text-white border-gray-800" : "border-gray-200 text-gray-600"
                          }`}
                        >
                          {severityStyle[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">
                    【{severityStyle[severity].label}エスカレーション】{escalationTarget.athleteName} — トリアージにてCritical判定。詳細確認をお願いします。<br />
                    <span className="text-gray-400">※PACE判断支援補助情報。最終判断は有資格者が行ってください。</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={closeModal}>キャンセル</Button>
                  <Button
                    variant="danger"
                    className="flex-1 flex items-center justify-center gap-2"
                    onClick={handleSendEscalation}
                    disabled={toRoles.length === 0}
                  >
                    <Send className="w-4 h-4" />
                    送信・証跡記録
                  </Button>
                </div>
                <p className="text-xs text-gray-400 text-center">送信と同時に免責証跡ログ（PACE-CDS）が自動記録されます</p>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">エスカレーション送信完了</p>
                    <p className="text-xs text-green-600 mt-0.5">送信先: {toRoles.join("・")} / {new Date().toLocaleString("ja-JP")}</p>
                    <p className="text-xs text-green-600">免責証跡ログ記録済み — PACE-CDS-v1.2.0</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={closeModal}>閉じる</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
