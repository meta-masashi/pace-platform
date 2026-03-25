"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Sparkles, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface DayPlan {
  focus: string;
  intensity: string;
  duration_min: number;
  exercises: string[];
  notes?: string;
}

interface PlanContent {
  summary: string;
  weekly_load_target: {
    monday?: DayPlan;
    tuesday?: DayPlan;
    wednesday?: DayPlan;
    thursday?: DayPlan;
    friday?: DayPlan;
    saturday?: DayPlan;
    sunday?: DayPlan;
  };
  reasoning: string;
  risk_flags: string[];
  staff_notes?: string;
}

interface TrainingPlan {
  id: string;
  athlete_id: string;
  athlete_name?: string;
  week_start_date: string;
  status: "generating" | "pending_approval" | "approved" | "rejected" | "expired";
  plan_content: PlanContent;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  agent_model: string | null;
  created_at: string;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function PlanStatusBadge({ status }: { status: TrainingPlan["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    generating:       { label: "生成中",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
    pending_approval: { label: "承認待ち",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved:         { label: "承認済み",   cls: "bg-brand-50 text-brand-700 border-brand-200" },
    rejected:         { label: "却下",       cls: "bg-red-50 text-red-600 border-red-200" },
    expired:          { label: "期限切れ",   cls: "bg-slate-50 text-slate-400 border-slate-200" },
  };
  const cfg = map[status] ?? map.pending_approval;
  return (
    <span className={`text-xs font-700 px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── 曜日ラベル ───────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  monday: "月", tuesday: "火", wednesday: "水",
  thursday: "木", friday: "金", saturday: "土", sunday: "日",
};

const INTENSITY_COLOR: Record<string, string> = {
  low:    "text-blue-600 bg-blue-50",
  medium: "text-brand-600 bg-brand-50",
  high:   "text-amber-600 bg-amber-50",
  rest:   "text-slate-400 bg-slate-50",
};

// ─── 計画カード ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  onApprove,
  onReject,
}: {
  plan: TrainingPlan;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const content = plan.plan_content;
  const weekDays = Object.entries(content.weekly_load_target ?? {});

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        {/* ヘッダー行 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-700 text-slate-900">
                {plan.athlete_name ?? "選手"} — {new Date(plan.week_start_date).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}週
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                生成: {new Date(plan.created_at).toLocaleDateString("ja-JP")}
                {plan.agent_model && ` · ${plan.agent_model}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PlanStatusBadge status={plan.status} />
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-600 p-1"
              aria-label={expanded ? "折り畳む" : "展開する"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* サマリー */}
        <p className="text-sm text-slate-700 leading-relaxed mb-3">{content.summary}</p>

        {/* リスクフラグ */}
        {content.risk_flags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {content.risk_flags.map((flag, i) => (
              <span key={i} className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
                ⚠ {flag}
              </span>
            ))}
          </div>
        )}

        {/* 週次計画（展開時） */}
        {expanded && weekDays.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-700 text-slate-500 uppercase tracking-wide mb-3">週次スケジュール</p>
            <div className="grid grid-cols-7 gap-1.5">
              {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((day) => {
                const d = content.weekly_load_target[day as keyof typeof content.weekly_load_target];
                return (
                  <div key={day} className="rounded-lg border border-slate-100 p-2 text-center min-h-[80px]">
                    <p className="text-xs font-800 text-slate-600 mb-1">{DAY_LABELS[day]}</p>
                    {d ? (
                      <>
                        <span className={`text-[10px] font-700 px-1.5 py-0.5 rounded-full ${INTENSITY_COLOR[d.intensity] ?? INTENSITY_COLOR.medium}`}>
                          {d.intensity === "low" ? "低" : d.intensity === "medium" ? "中" : d.intensity === "high" ? "高" : "休"}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-1 leading-tight">{d.focus}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{d.duration_min}分</p>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-300">休養</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 推論 */}
            <div className="mt-3 bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">AIの推論</p>
              <p className="text-xs text-slate-600 leading-relaxed">{content.reasoning}</p>
            </div>
          </div>
        )}

        {/* 承認アクション */}
        {plan.status === "pending_approval" && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            {showRejectInput ? (
              <div className="space-y-2">
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  rows={2}
                  placeholder="却下理由を入力..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowRejectInput(false)}>戻る</Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white"
                    disabled={rejecting || !rejectReason.trim()}
                    onClick={async () => {
                      setRejecting(true);
                      await onReject(plan.id, rejectReason);
                      setRejecting(false);
                      setShowRejectInput(false);
                    }}
                  >
                    {rejecting ? "却下中..." : "却下する"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowRejectInput(true)}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  却下
                </Button>
                <Button
                  size="sm"
                  className="flex-2 text-xs bg-brand-500 hover:bg-brand-600 text-white"
                  disabled={approving}
                  onClick={async () => {
                    setApproving(true);
                    await onApprove(plan.id);
                    setApproving(false);
                  }}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {approving ? "承認中..." : "承認して配信"}
                </Button>
              </div>
            )}
          </div>
        )}

        {plan.status === "approved" && plan.approved_at && (
          <p className="mt-3 text-xs text-brand-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            {new Date(plan.approved_at).toLocaleString("ja-JP")} に承認済み
          </p>
        )}
        {plan.status === "rejected" && plan.rejection_reason && (
          <p className="mt-3 text-xs text-red-500">却下理由: {plan.rejection_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 計画生成フォーム ──────────────────────────────────────────────────────────

function GenerateForm({
  onGenerate,
}: {
  onGenerate: (weekStart: string, notes: string) => Promise<void>;
}) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);
  const [weekStart, setWeekStart] = useState(monday.toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGenerate(weekStart, notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          AIエージェントで週次計画を生成
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">チームのACWR・Readiness スコアを基に、AIが最適な週次トレーニング計画を自動生成します。スタッフの承認後に選手へ配信されます。</p>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">対象週（月曜日）</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
          <div className="flex-2">
            <label className="block text-xs font-700 text-slate-500 uppercase tracking-wide mb-1.5">追加指示（任意）</label>
            <input
              type="text"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="例: 今週は試合が土曜にあります"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="bg-brand-500 hover:bg-brand-600 text-white gap-2 whitespace-nowrap"
            onClick={handle}
            disabled={loading}
          >
            {loading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="w-4 h-4" />計画を生成</>
            )}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
        {loading && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-xs text-brand-700">
            AIエージェントが計画を生成中です。通常15〜30秒かかります。生成後に「承認待ち」として一覧に表示されます。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────────────────

export default function TrainingPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "all">("pending");

  const fetchPlans = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: staff } = await supabase.from("staff").select("org_id").eq("id", user.id).maybeSingle();
    if (!staff?.org_id) return;

    const { data } = await supabase
      .from("weekly_training_plans")
      .select("*, athletes(name)")
      .eq("org_id", staff.org_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setPlans(data.map((p: any) => ({
        ...p,
        athlete_name: p.athletes?.name ?? null,
      })));
    }
  };

  useEffect(() => {
    fetchPlans().finally(() => setLoading(false));
  }, []);

  const handleGenerate = async (weekStart: string, notes: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("ログインが必要です");
    const res = await fetch("/api/staff/generate-training-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ week_start_date: weekStart, notes }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "生成に失敗しました");
    await fetchPlans();
  };

  const handleApprove = async (planId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/staff/training-plans/${planId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await fetchPlans();
  };

  const handleReject = async (planId: string, reason: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/staff/training-plans/${planId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "reject", rejection_reason: reason }),
    });
    await fetchPlans();
  };

  const filtered = plans.filter((p) => {
    if (tab === "pending") return p.status === "pending_approval" || p.status === "generating";
    if (tab === "approved") return p.status === "approved";
    return true;
  });

  const pendingCount = plans.filter((p) => p.status === "pending_approval").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-800 text-slate-900">AIトレーニング計画</h1>
        <p className="text-sm text-slate-500 mt-1">AIエージェントによる週次計画生成・承認管理</p>
      </div>

      {/* 生成フォーム */}
      <GenerateForm onGenerate={handleGenerate} />

      {/* タブ */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([["pending", "承認待ち"], ["approved", "承認済み"], ["all", "すべて"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-600 transition-colors ${
              tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* 計画一覧 */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {tab === "pending" ? "承認待ちの計画はありません" : "計画はありません"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
