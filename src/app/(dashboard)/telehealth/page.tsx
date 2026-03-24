"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  Video, Plus, Clock, User, CheckCircle, XCircle, PhoneOff,
  FileText, Activity, ChevronDown, ChevronUp, PanelRight, PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface TeleHealthSession {
  id: string;
  athlete_id: string;
  athlete_name?: string;
  daily_room_url: string;
  daily_room_name: string;
  scheduled_at: string;
  status: "scheduled" | "active" | "completed" | "cancelled" | "no_show";
  staff_consent_at: string | null;
  athlete_consent_at: string | null;
}

interface Athlete {
  id: string;
  name: string;
  position: string | null;
}

interface SoapNote {
  id: string;
  s_text: string;
  o_text: string;
  a_text: string;
  p_text: string;
  ai_assisted: boolean;
  created_at: string;
}

interface AssessmentRecord {
  id: string;
  assessment_type: string;
  primary_diagnosis: { diagnosis_code: string; label: string; probability: number } | null;
  differentials: { diagnosis_code: string; label: string; probability: number }[];
  completed_at: string | null;
}

interface ConditionRecord {
  date: string;
  acwr: number;
  readiness_score: number;
  daily_load: number;
}

interface SessionContext {
  athlete: { id: string; name: string; position: string | null; jersey_number: number | null } | null;
  soap_notes: SoapNote[];
  assessments: AssessmentRecord[];
  condition_history: ConditionRecord[];
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TeleHealthSession["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled:  { label: "予約済み",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
    active:     { label: "通話中",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    completed:  { label: "終了",     cls: "bg-slate-50 text-slate-500 border-slate-200" },
    cancelled:  { label: "キャンセル", cls: "bg-red-50 text-red-600 border-red-200" },
    no_show:    { label: "不参加",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const cfg = map[status] ?? map.scheduled;
  return (
    <span className={`text-xs font-700 px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── 同意モーダル ─────────────────────────────────────────────────────────────

const CONSENT_TEXT = `【TeleHealth 利用同意書】

本ビデオ通話機能（以下「TeleHealth」）のご利用にあたり、以下の事項に同意してください。

1. 本サービスは医療相談・指導を目的としており、医師による診断・処方・投薬の代替となるものではありません。
2. 通話は暗号化されますが、録画・自動文字起こしは行いません。
3. 緊急の医療状態が発生した場合は直ちに救急（119）に連絡してください。
4. 通話内容は施設の医療記録方針に従い、必要に応じて手動で記録されます。

上記に同意する場合、「同意して通話を開始」ボタンを押してください。`;

function ConsentModal({
  session,
  onConsent,
  onCancel,
}: {
  session: TeleHealthSession;
  onConsent: (sessionId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h2 className="text-lg font-800 text-slate-900 mb-4">通話前の同意確認</h2>
        <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-4 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto mb-6 font-sans">
          {CONSENT_TEXT}
        </pre>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            キャンセル
          </Button>
          <Button
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => onConsent(session.id)}
          >
            同意して通話を開始
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── コンテキストパネル (P6-011) ──────────────────────────────────────────────

function ContextPanel({
  sessionId,
  token,
}: {
  sessionId: string;
  token: string;
}) {
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [soapOpen, setSoapOpen] = useState(true);
  const [assessOpen, setAssessOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/telehealth/context/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setCtx(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-xs">
        コンテキスト読み込み中...
      </div>
    );
  }

  if (!ctx) return null;

  const latestCond = ctx.condition_history[0];

  return (
    <div className="h-full overflow-y-auto bg-slate-900 text-slate-200 text-xs space-y-1 p-2">
      {/* 選手情報 */}
      {ctx.athlete && (
        <div className="bg-slate-800 rounded-lg px-3 py-2 mb-2">
          <p className="font-700 text-sm text-white">{ctx.athlete.name}</p>
          <p className="text-slate-400 mt-0.5">{ctx.athlete.position ?? ""}{ctx.athlete.jersey_number ? ` #${ctx.athlete.jersey_number}` : ""}</p>
          {latestCond && (
            <div className="flex gap-3 mt-2">
              <span className={`px-1.5 py-0.5 rounded font-600 ${latestCond.acwr > 1.3 ? "bg-red-900/60 text-red-300" : latestCond.acwr < 0.8 ? "bg-amber-900/60 text-amber-300" : "bg-emerald-900/60 text-emerald-300"}`}>
                ACWR {latestCond.acwr?.toFixed(2)}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-600 ${latestCond.readiness_score < 40 ? "bg-red-900/60 text-red-300" : latestCond.readiness_score < 60 ? "bg-amber-900/60 text-amber-300" : "bg-emerald-900/60 text-emerald-300"}`}>
                Readiness {Math.round(latestCond.readiness_score)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* SOAPノート */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors"
          onClick={() => setSoapOpen((v) => !v)}
        >
          <span className="flex items-center gap-2 font-600 text-slate-200">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            SOAPノート ({ctx.soap_notes.length})
          </span>
          {soapOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {soapOpen && (
          <div className="px-3 pb-2 space-y-2">
            {ctx.soap_notes.length === 0 ? (
              <p className="text-slate-500 py-2 text-center">SOAPノートなし</p>
            ) : (
              ctx.soap_notes.map((note) => (
                <div key={note.id} className="border border-slate-700 rounded-md p-2 space-y-1.5">
                  <p className="text-slate-500 text-[10px]">{new Date(note.created_at).toLocaleDateString("ja-JP")}</p>
                  {note.s_text && <div><span className="text-emerald-400 font-700">S: </span>{note.s_text}</div>}
                  {note.o_text && <div><span className="text-sky-400 font-700">O: </span>{note.o_text}</div>}
                  {note.a_text && <div><span className="text-amber-400 font-700">A: </span>{note.a_text}</div>}
                  {note.p_text && <div><span className="text-violet-400 font-700">P: </span>{note.p_text}</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* アセスメント */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors"
          onClick={() => setAssessOpen((v) => !v)}
        >
          <span className="flex items-center gap-2 font-600 text-slate-200">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            アセスメント ({ctx.assessments.length})
          </span>
          {assessOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {assessOpen && (
          <div className="px-3 pb-2 space-y-2">
            {ctx.assessments.length === 0 ? (
              <p className="text-slate-500 py-2 text-center">アセスメントなし</p>
            ) : (
              ctx.assessments.map((a) => (
                <div key={a.id} className="border border-slate-700 rounded-md p-2">
                  <p className="text-slate-400 text-[10px] mb-1">{a.assessment_type} — {a.completed_at ? new Date(a.completed_at).toLocaleDateString("ja-JP") : "未完了"}</p>
                  {a.primary_diagnosis && (
                    <div>
                      <span className="text-amber-400 font-700">主診断: </span>
                      <span className="text-slate-200">{a.primary_diagnosis.label}</span>
                      <span className="text-slate-500 ml-1">({Math.round(a.primary_diagnosis.probability * 100)}%)</span>
                    </div>
                  )}
                  {a.differentials?.length > 0 && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      鑑別: {a.differentials.slice(0, 2).map((d) => `${d.label}(${Math.round(d.probability * 100)}%)`).join(", ")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* コンディション履歴 */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 transition-colors"
          onClick={() => setCondOpen((v) => !v)}
        >
          <span className="flex items-center gap-2 font-600 text-slate-200">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
            直近コンディション ({ctx.condition_history.length}日)
          </span>
          {condOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>
        {condOpen && (
          <div className="px-3 pb-2">
            {ctx.condition_history.length === 0 ? (
              <p className="text-slate-500 py-2 text-center">データなし</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1">日付</th>
                    <th className="text-right py-1">ACWR</th>
                    <th className="text-right py-1">Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {ctx.condition_history.map((c) => (
                    <tr key={c.date} className="border-t border-slate-700">
                      <td className="py-1 text-slate-400">{c.date}</td>
                      <td className={`py-1 text-right font-600 ${c.acwr > 1.3 ? "text-red-400" : c.acwr < 0.8 ? "text-amber-400" : "text-emerald-400"}`}>{c.acwr?.toFixed(2)}</td>
                      <td className={`py-1 text-right font-600 ${c.readiness_score < 40 ? "text-red-400" : c.readiness_score < 60 ? "text-amber-400" : "text-emerald-400"}`}>{Math.round(c.readiness_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 通話画面（Daily.co + SOAPコンテキストパネル） ─────────────────────────────

function VideoCallFrame({
  roomUrl,
  token,
  sessionId,
  onLeave,
}: {
  roomUrl: string;
  token: string;
  sessionId: string;
  onLeave: () => void;
}) {
  const [showPanel, setShowPanel] = useState(true);
  const url = `${roomUrl}?t=${token}`;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 flex flex-col">
      {/* ヘッダーバー */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-emerald-400" />
          <span className="text-white font-600 text-sm">PACE TeleHealth — 通話中</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 gap-1.5"
            onClick={() => setShowPanel((v) => !v)}
            title={showPanel ? "パネルを閉じる" : "コンテキストパネルを開く"}
          >
            {showPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            <span className="text-xs">{showPanel ? "パネルを隠す" : "SOAP/アセスメント"}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 hover:bg-red-900/30 gap-2"
            onClick={onLeave}
          >
            <PhoneOff className="w-4 h-4" />
            通話を終了
          </Button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ビデオ */}
        <iframe
          src={url}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="flex-1 border-0"
          title="TeleHealth Video Call"
        />

        {/* SOAPコンテキストパネル (P6-011) */}
        {showPanel && (
          <div className="w-72 flex-shrink-0 border-l border-slate-700 overflow-hidden">
            <ContextPanel sessionId={sessionId} token={token} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 新規セッション作成モーダル ────────────────────────────────────────────────

function CreateSessionModal({
  athletes,
  onCreate,
  onClose,
}: {
  athletes: Athlete[];
  onCreate: (athleteId: string, scheduledAt: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [athleteId, setAthleteId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!athleteId || !date) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(athleteId, new Date(date).toISOString(), notes);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-800 text-slate-900 mb-5">通話セッションを作成</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">選手</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
            >
              <option value="">選手を選択...</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.position ? ` (${a.position})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">予定日時</label>
            <input
              type="datetime-local"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">メモ（任意）</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              rows={2}
              placeholder="通話の目的・議題など..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>キャンセル</Button>
          <Button
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={handleCreate}
            disabled={!athleteId || !date || loading}
          >
            {loading ? "作成中..." : "作成する"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────────────────

export default function TeleHealthPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<TeleHealthSession[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [consentSession, setConsentSession] = useState<TeleHealthSession | null>(null);
  const [callInfo, setCallInfo] = useState<{ roomUrl: string; token: string; sessionId: string } | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const fetchSessions = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/telehealth/sessions", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setSessions(json.sessions ?? []);
    }
  };

  const fetchAthletes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: staff } = await supabase.from("staff").select("org_id").eq("id", user.id).maybeSingle();
    if (!staff?.org_id) return;
    const { data } = await supabase.from("athletes").select("id, name, position").eq("org_id", staff.org_id).eq("is_active", true).order("name");
    if (data) setAthletes(data);
  };

  useEffect(() => {
    Promise.all([fetchSessions(), fetchAthletes()]).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (athleteId: string, scheduledAt: string, notes: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("ログインが必要です");
    const res = await fetch("/api/telehealth/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ athlete_id: athleteId, scheduled_at: scheduledAt, notes }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? "セッション作成に失敗しました");
    }
    await fetchSessions();
  };

  const handleJoin = async (sessionId: string) => {
    setJoiningId(sessionId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/telehealth/join-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ session_id: sessionId, role: "staff" }),
    });
    setJoiningId(null);
    if (!res.ok) return;
    const { token, room_url } = await res.json();
    setCallInfo({ roomUrl: room_url, token, sessionId });
    setConsentSession(null);
  };

  const upcoming = sessions.filter((s) => s.status === "scheduled" || s.status === "active");
  const past = sessions.filter((s) => s.status === "completed" || s.status === "cancelled" || s.status === "no_show");

  if (callInfo) {
    return (
      <VideoCallFrame
        roomUrl={callInfo.roomUrl}
        token={callInfo.token}
        sessionId={callInfo.sessionId}
        onLeave={() => { setCallInfo(null); fetchSessions(); }}
      />
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-800 text-slate-900">TeleHealth</h1>
          <p className="text-sm text-slate-500 mt-1">遠隔ビデオ相談セッション管理</p>
        </div>
        <Button
          className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-4 h-4" />
          セッションを作成
        </Button>
      </div>

      {/* 法務注意事項バナー */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
        <strong>医療法上の注意：</strong> 本機能は医療的相談・指導を目的としています。医師による診断・処方・投薬指示には使用できません。緊急の場合は救急（119）に連絡してください。
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">読み込み中...</div>
      ) : (
        <>
          {/* 予定・進行中 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                予定・進行中のセッション
                <span className="text-xs font-500 text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{upcoming.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">予定されたセッションはありません</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                          <User className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-700 text-slate-900">{s.athlete_name ?? "選手"}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(s.scheduled_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        {s.staff_consent_at ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-3 h-3" />同意済み</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-400"><XCircle className="w-3 h-3" />同意未取得</span>
                        )}
                        <Button
                          size="sm"
                          className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1"
                          disabled={joiningId === s.id}
                          onClick={() => setConsentSession(s)}
                        >
                          <Video className="w-3 h-3" />
                          {joiningId === s.id ? "接続中..." : "通話に参加"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 過去セッション */}
          {past.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-700 text-slate-600">過去のセッション</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {past.slice(0, 10).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg px-4 py-2.5 bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-600 text-slate-700">{s.athlete_name ?? "選手"}</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(s.scheduled_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* モーダル */}
      {showCreate && (
        <CreateSessionModal
          athletes={athletes}
          onCreate={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {consentSession && (
        <ConsentModal
          session={consentSession}
          onConsent={(id) => handleJoin(id)}
          onCancel={() => setConsentSession(null)}
        />
      )}
    </div>
  );
}
