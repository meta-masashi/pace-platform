"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, Users, X, Calendar, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScheduleEvent, AttendanceRecord, Staff, AttendanceStatus } from "@/types";

// ─── ACWR engine ──────────────────────────────────────────────
// 28-day team load history (RPE × min) per day — realistic pre-existing loads
const LOAD_HISTORY: Record<string, number> = {
  "2026-02-22": 1200, "2026-02-23": 1050, "2026-02-24": 1530, "2026-02-25": 400,
  "2026-02-26": 720,  "2026-02-27": 1800, "2026-02-28": 1050,
  "2026-03-01": 1200, "2026-03-02": 400,  "2026-03-03": 1680, "2026-03-04": 1050,
  "2026-03-05": 1260, "2026-03-06": 1530, "2026-03-07": 420,
  "2026-03-08": 1200, "2026-03-09": 1050, "2026-03-10": 1680, "2026-03-11": 1530,
  "2026-03-12": 420,  "2026-03-13": 1800, "2026-03-14": 1050,
  "2026-03-15": 1200, "2026-03-16": 1800, "2026-03-17": 360,  "2026-03-18": 1170,
  "2026-03-19": 0,    "2026-03-20": 1100, "2026-03-21": 1530,
};

function getLoad(date: string, events: ScheduleEvent[]): number {
  if (LOAD_HISTORY[date] !== undefined) return LOAD_HISTORY[date];
  const ev = events.find(e => e.date === date);
  if (ev?.estimated_rpe && ev?.estimated_duration_min) return ev.estimated_rpe * ev.estimated_duration_min;
  return 0;
}

function computeACWR(baseDate: string, events: ScheduleEvent[]): { acute: number; chronic: number; acwr: number } {
  const base = new Date(baseDate + "T00:00:00");
  let acute = 0;
  let chronic = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    acute += getLoad(toYMD(d), events);
  }
  for (let i = 1; i <= 28; i++) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    chronic += getLoad(toYMD(d), events);
  }
  const chronicWeekly = chronic / 4;
  const acwr = chronicWeekly > 0 ? acute / chronicWeekly : 0;
  return { acute, chronic: chronicWeekly, acwr };
}

function buildWeeklyACWRChart(weekDates: Date[], events: ScheduleEvent[]): Array<{ day: string; acwr: number; projected: boolean }> {
  return weekDates.map((d) => {
    const ymd = toYMD(d);
    const today = "2026-03-22";
    const isToday = ymd === today;
    const isFuture = ymd > today;
    if (isFuture) {
      const ev = events.find(e => e.date === ymd);
      const dayLoad = ev?.estimated_rpe && ev?.estimated_duration_min
        ? ev.estimated_rpe * ev.estimated_duration_min : 0;
      const saved = LOAD_HISTORY[ymd];
      LOAD_HISTORY[ymd] = dayLoad;
      const result = computeACWR(ymd, events);
      if (saved !== undefined) LOAD_HISTORY[ymd] = saved; else delete LOAD_HISTORY[ymd];
      return { day: `${d.getMonth()+1}/${d.getDate()}`, acwr: parseFloat(result.acwr.toFixed(2)), projected: true };
    }
    const result = computeACWR(ymd, events);
    return { day: `${d.getMonth()+1}/${d.getDate()}`, acwr: parseFloat(result.acwr.toFixed(2)), projected: isToday };
  });
}

function acwrZone(acwr: number): { color: string; label: string; bg: string } {
  if (acwr >= 1.5) return { color: "#ef4444", label: "高リスク", bg: "bg-red-50 border-red-200 text-red-700" };
  if (acwr >= 1.3) return { color: "#f59e0b", label: "注意域", bg: "bg-amber-50 border-amber-200 text-amber-700" };
  if (acwr >= 0.8) return { color: "#22c55e", label: "最適域", bg: "bg-green-50 border-green-200 text-green-700" };
  return { color: "#94a3b8", label: "低負荷", bg: "bg-slate-50 border-slate-200 text-slate-600" };
}

function toYMD(d: Date) { return d.toISOString().slice(0, 10); }

function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}

const EVENT_STYLE: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  practice: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", dot: "bg-green-500", label: "練習" },
  match:    { bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-800",  dot: "bg-blue-500",  label: "試合" },
  recovery: { bg: "bg-gray-50",  border: "border-gray-200",  text: "text-gray-700",  dot: "bg-gray-400",  label: "回復" },
  meeting:  { bg: "bg-purple-50",border: "border-purple-200",text: "text-purple-800",dot: "bg-purple-400",label: "MTG" },
  off:      { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500",  dot: "bg-slate-300", label: "OFF" },
};

const ATTENDANCE_STYLE: Record<AttendanceStatus, { bg: string; text: string; label: string }> = {
  present:     { bg: "bg-green-100", text: "text-green-700", label: "参加" },
  absent:      { bg: "bg-red-100",   text: "text-red-700",   label: "欠席" },
  late:        { bg: "bg-amber-100", text: "text-amber-700", label: "遅刻" },
  injured_out: { bg: "bg-orange-100",text: "text-orange-700",label: "傷害別" },
};

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

interface ScheduleClientProps {
  scheduleEvents: ScheduleEvent[];
  attendance: AttendanceRecord[];
  staff: Staff[];
}

export function ScheduleClient({ scheduleEvents, attendance, staff }: ScheduleClientProps) {
  const today = "2026-03-22";
  const router = useRouter();
  const [anchor, setAnchor] = useState(new Date(today));
  const [selected, setSelected] = useState<ScheduleEvent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showACWR, setShowACWR] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<string>("practice");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openAddModal() {
    const anchorYMD = toYMD(anchor);
    setTitle("");
    setEventType("practice");
    setStartsAt(`${anchorYMD}T16:00`);
    setEndsAt(`${anchorYMD}T18:00`);
    setLocation("");
    setDescription("");
    setFormError(null);
    setSaving(false);
    setShowAddModal(true);
  }

  async function handleSave() {
    if (!title.trim()) { setFormError("タイトルを入力してください"); return; }
    if (!startsAt) { setFormError("開始日時を入力してください"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/schedule-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          event_type: eventType,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存に失敗しました" }));
        setFormError(err.error ?? "保存に失敗しました");
        return;
      }
      setShowAddModal(false);
      router.refresh();
    } catch {
      setFormError("ネットワークエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  const weekDates = getWeekDates(anchor);
  const weeklyACWR = buildWeeklyACWRChart(weekDates, scheduleEvents);
  const todayACWR = computeACWR(today, scheduleEvents);

  function prevWeek() { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }
  function nextWeek() { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }

  const year = weekDates[0].getFullYear();
  const month = weekDates[0].getMonth() + 1;
  const monthLabel = `${year}年${month}月`;

  const selectedAttendance = selected ? attendance.filter(a => a.event_id === selected.id) : [];
  const presentCount = selectedAttendance.filter(a => a.status === "present" || a.status === "late").length;
  const rpeEntries = selectedAttendance.filter(a => a.rpe_reported != null);
  const avgRpe = rpeEntries.length > 0
    ? (rpeEntries.reduce((s, a) => s + (a.rpe_reported ?? 0), 0) / rpeEntries.length).toFixed(1)
    : null;

  function dayIndex(date: Date): number { const d = date.getDay(); return d === 0 ? 6 : d - 1; }

  const zone = acwrZone(todayACWR.acwr);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スケジュール</h1>
          <p className="text-sm text-gray-500 mt-0.5">練習・試合・回復の計画と負荷管理</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowACWR(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
              showACWR ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            ACWR予測
          </button>
          <Button variant="primary" onClick={openAddModal}>
            <Plus className="w-4 h-4 mr-1" />
            イベント追加
          </Button>
        </div>
      </div>

      {/* ACWR summary strip */}
      <div className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border text-sm ${zone.bg}`}>
        <div className="flex items-center gap-2">
          {todayACWR.acwr >= 1.5 && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span className="font-semibold">本日 ACWR {todayACWR.acwr.toFixed(2)}</span>
          <span className="opacity-75">— {zone.label}</span>
        </div>
        <div className="h-4 w-px bg-current opacity-20" />
        <span className="opacity-75 text-xs">急性負荷 {todayACWR.acute.toLocaleString()} AU / 慢性負荷（週平均）{Math.round(todayACWR.chronic).toLocaleString()} AU</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-base font-semibold text-gray-900 w-36 text-center">{monthLabel}</span>
        <button onClick={nextWeek} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={() => setAnchor(new Date(today))}
          className="ml-2 px-3 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          今週
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {weekDates.map((date, i) => {
              const ymd = toYMD(date);
              const dayEvents = scheduleEvents.filter(e => e.date === ymd);
              const isToday = ymd === today;
              const isSat = i === 5;
              const isSun = i === 6;
              const dayACWR = weeklyACWR[i];
              const dayZone = acwrZone(dayACWR.acwr);
              return (
                <div key={ymd} className="min-h-[180px]">
                  <div className={`text-center py-2 mb-1 rounded-t-lg ${
                    isToday ? "bg-green-600 text-white" :
                    isSat ? "bg-blue-50 text-blue-700" :
                    isSun ? "bg-red-50 text-red-700" :
                    "bg-gray-50 text-gray-600"
                  }`}>
                    <p className="text-xs font-medium">{DAY_LABELS[i]}</p>
                    <p className={`text-lg font-bold ${isToday ? "text-white" : ""}`}>{date.getDate()}</p>
                    {showACWR && dayACWR.acwr > 0 && (
                      <p className={`text-xs font-semibold mt-0.5 ${isToday ? "text-green-100" : ""}`}
                        style={!isToday ? { color: dayZone.color } : undefined}
                      >
                        {dayACWR.projected ? "~" : ""}{dayACWR.acwr.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 px-0.5">
                    {dayEvents.length === 0 && (
                      <div className="text-center py-4">
                        <span className="text-xs text-gray-300">—</span>
                      </div>
                    )}
                    {dayEvents.map(ev => {
                      const s = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.off;
                      const att = attendance.filter(a => a.event_id === ev.id);
                      const present = att.filter(a => a.status === "present" || a.status === "late").length;
                      const isSelected = selected?.id === ev.id;
                      const sessionLoad = ev.estimated_rpe && ev.estimated_duration_min
                        ? ev.estimated_rpe * ev.estimated_duration_min : null;
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelected(isSelected ? null : ev)}
                          className={`w-full text-left p-1.5 rounded border ${s.bg} ${s.border} ${s.text} transition-all ${
                            isSelected ? "ring-2 ring-green-400 ring-offset-1" : "hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                            <span className="text-xs font-semibold truncate">{s.label}</span>
                          </div>
                          <p className="text-xs truncate mt-0.5 font-medium">{ev.title}</p>
                          <p className="text-xs opacity-75">{ev.start_time}〜{ev.end_time}</p>
                          {sessionLoad && (
                            <p className="text-xs opacity-75 mt-0.5">
                              RPE{ev.estimated_rpe}×{ev.estimated_duration_min}min
                            </p>
                          )}
                          {att.length > 0 && (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <Users className="w-2.5 h-2.5 opacity-60" />
                              <span className="text-xs opacity-75">{present}/{att.length}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ACWR projection chart */}
          {showACWR && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">週次 ACWR 推移（破線 = 計画値）</CardTitle>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> 1.5 高リスク</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> 1.3 注意域</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={weeklyACWR} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 2]} />
                    <Tooltip formatter={(v: unknown) => [`ACWR ${(v as number).toFixed(2)}`, ""]} />
                    <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 4" />
                    <ReferenceLine y={1.3} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Bar
                      dataKey="acwr"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                      fill="#22c55e"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-4 px-1">
            {Object.entries(EVENT_STYLE).map(([key, s]) => (
              <div key={key} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="w-72 flex-shrink-0">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${EVENT_STYLE[selected.event_type]?.bg} ${EVENT_STYLE[selected.event_type]?.text}`}>
                        {EVENT_STYLE[selected.event_type]?.label}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-tight">{selected.title}</CardTitle>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{selected.date}（{DAY_LABELS[dayIndex(new Date(selected.date + "T00:00:00"))]}）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{selected.start_time} 〜 {selected.end_time}</span>
                  </div>
                  {selected.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{selected.location}</span>
                    </div>
                  )}
                  {selected.opponent && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">vs</span>
                      <span className="font-semibold text-blue-700">{selected.opponent}</span>
                    </div>
                  )}
                  {selected.notes && (
                    <p className="bg-gray-50 rounded p-2 leading-relaxed">{selected.notes}</p>
                  )}
                </div>

                {/* ACWR projection for this event */}
                {selected.estimated_rpe && selected.estimated_duration_min && (() => {
                  const sessionLoad = selected.estimated_rpe * selected.estimated_duration_min;
                  const base = computeACWR(selected.date, scheduleEvents);
                  const projectedAcute = base.acute + sessionLoad;
                  const projectedACWR = base.chronic > 0 ? projectedAcute / base.chronic : 0;
                  const pZone = acwrZone(projectedACWR);
                  return (
                    <div className={`rounded-lg border p-3 space-y-2 ${pZone.bg}`}>
                      <p className="text-xs font-semibold">負荷予測（sRPE法）</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="opacity-70">セッション負荷</p>
                          <p className="font-bold text-base">{sessionLoad.toLocaleString()} AU</p>
                          <p className="opacity-60">RPE {selected.estimated_rpe} × {selected.estimated_duration_min}min</p>
                        </div>
                        <div>
                          <p className="opacity-70">予測 ACWR</p>
                          <p className="font-bold text-base">{projectedACWR.toFixed(2)}</p>
                          <p className="opacity-60">{pZone.label}</p>
                        </div>
                      </div>
                      {projectedACWR >= 1.5 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>高負荷リスク — 強度調整を検討してください</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {selectedAttendance.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-700">出席状況</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Users className="w-3 h-3" />
                        <span>{presentCount}/{selectedAttendance.length}名</span>
                        {avgRpe && <span>avg RPE {avgRpe}</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {selectedAttendance.map(att => {
                        const st = ATTENDANCE_STYLE[att.status];
                        return (
                          <div key={att.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 font-medium">{att.athlete_name}</span>
                            <div className="flex items-center gap-1.5">
                              {att.rpe_reported != null && (
                                <span className="text-gray-400">RPE {att.rpe_reported}</span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>
                                {st.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-green-500"
                        style={{ width: `${Math.round((presentCount / selectedAttendance.length) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 text-right mt-0.5">
                      出席率 {Math.round((presentCount / selectedAttendance.length) * 100)}%
                    </p>
                  </div>
                )}

                {selectedAttendance.length === 0 && selected.event_type !== "off" && (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400">出席記録なし</p>
                    <Button variant="outline" className="mt-2 text-xs h-7">
                      出席を記録する
                    </Button>
                  </div>
                )}

                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    担当: {staff.find(s => s.id === selected.created_by_staff_id)?.name ?? "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>今後の予定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {scheduleEvents
              .filter(e => e.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(ev => {
                const s = EVENT_STYLE[ev.event_type] ?? EVENT_STYLE.off;
                const att = attendance.filter(a => a.event_id === ev.id);
                const present = att.filter(a => a.status === "present" || a.status === "late").length;
                const sessionLoad = ev.estimated_rpe && ev.estimated_duration_min
                  ? ev.estimated_rpe * ev.estimated_duration_min : null;
                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      setSelected(ev);
                      setAnchor(new Date(ev.date + "T00:00:00"));
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className="text-sm text-gray-500 w-32 flex-shrink-0">{ev.date} {ev.start_time}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                    <span className="text-sm font-medium text-gray-800 flex-1 truncate">{ev.title}</span>
                    {ev.opponent && <span className="text-xs text-blue-600 flex-shrink-0">vs {ev.opponent}</span>}
                    {sessionLoad && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{sessionLoad.toLocaleString()} AU</span>
                    )}
                    {att.length > 0 && (
                      <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-0.5">
                        <Users className="w-3 h-3" />{present}/{att.length}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">イベント追加</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">タイトル *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="チーム練習"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">種類 *</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="practice">練習</option>
                  <option value="match">試合</option>
                  <option value="recovery">回復</option>
                  <option value="meeting">ミーティング</option>
                  <option value="off">OFF</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">開始日時 *</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">終了日時</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={e => setEndsAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">場所</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="メインフィールド"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)} disabled={saving}>キャンセル</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
