"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  FileText, Send, CheckCircle, XCircle, Clock,
  DollarSign, Plus, RefreshCw, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface ProcedureCode {
  code: string;
  description: string;
  unit_price: number;
  quantity: number;
}

interface BillingClaim {
  id: string;
  athlete_id: string;
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  procedure_codes: ProcedureCode[];
  total_points: number | null;
  status: "draft" | "pending_review" | "submitted" | "paid" | "rejected";
  claim_reference_id: string;
  partner_claim_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  ai_extracted: boolean;
  notes: string | null;
  created_at: string;
  athletes?: { name: string; position: string | null };
}

// ─── ステータスバッジ ─────────────────────────────────────────────────────────

function ClaimStatusBadge({ status }: { status: BillingClaim["status"] }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    draft:          { label: "下書き",     cls: "bg-slate-100 text-slate-600 border-slate-200",   icon: <FileText className="w-3 h-3" /> },
    pending_review: { label: "レビュー待ち", cls: "bg-amber-50 text-amber-700 border-amber-200",   icon: <Clock className="w-3 h-3" /> },
    submitted:      { label: "送信済み",   cls: "bg-blue-50 text-blue-700 border-blue-200",      icon: <Send className="w-3 h-3" /> },
    paid:           { label: "支払完了",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle className="w-3 h-3" /> },
    rejected:       { label: "差し戻し",   cls: "bg-red-50 text-red-600 border-red-200",         icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-600 px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── 請求詳細モーダル ─────────────────────────────────────────────────────────

function ClaimDetailModal({
  claim,
  onClose,
  onSubmit,
  onReject,
}: {
  claim: BillingClaim;
  onClose: () => void;
  onSubmit: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = ["draft", "pending_review"].includes(claim.status);
  const canReject = ["draft", "pending_review", "submitted"].includes(claim.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-800 text-slate-900">請求詳細</h2>
          <ClaimStatusBadge status={claim.status} />
        </div>

        {/* 選手情報 */}
        <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm font-700 text-slate-900">{claim.athletes?.name ?? "不明"}</p>
          {claim.athletes?.position && (
            <p className="text-xs text-slate-500">{claim.athletes.position}</p>
          )}
          {claim.ai_extracted && (
            <span className="inline-flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full mt-1">
              AI自動抽出
            </span>
          )}
        </div>

        {/* 診断コード */}
        {claim.diagnosis_code && (
          <div className="mb-4">
            <p className="text-xs font-700 text-slate-500 uppercase tracking-wide mb-1">ICD-10-CM 診断コード</p>
            <p className="text-sm font-700 text-slate-900">{claim.diagnosis_code}</p>
            {claim.diagnosis_label && (
              <p className="text-xs text-slate-600 mt-0.5">{claim.diagnosis_label}</p>
            )}
          </div>
        )}

        {/* 処置コード */}
        {claim.procedure_codes?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-slate-500 uppercase tracking-wide mb-2">処置コード</p>
            <div className="space-y-1">
              {claim.procedure_codes.map((pc, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                  <div>
                    <span className="font-700 text-slate-800">{pc.code}</span>
                    <span className="text-slate-500 ml-2">{pc.description}</span>
                  </div>
                  <span className="text-slate-700 font-600">{pc.unit_price}点 × {pc.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <span className="text-sm font-800 text-slate-900">
                合計: {claim.total_points?.toLocaleString() ?? 0} 点
              </span>
            </div>
          </div>
        )}

        {/* 差し戻し理由 */}
        {claim.rejection_reason && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-700 text-red-600 mb-1">差し戻し理由</p>
            <p className="text-sm text-red-700">{claim.rejection_reason}</p>
          </div>
        )}

        {/* パートナー送信情報 */}
        {claim.partner_claim_id && (
          <div className="mb-4 text-xs text-slate-500">
            <p>パートナーID: {claim.partner_claim_id}</p>
            {claim.submitted_at && (
              <p>送信日時: {new Date(claim.submitted_at).toLocaleString("ja-JP")}</p>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2 mb-4">{error}</p>}

        {/* 差し戻し入力 */}
        {showReject && (
          <div className="mb-4">
            <label className="block text-xs font-700 text-slate-500 mb-1">差し戻し理由</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="差し戻しの理由を入力..."
            />
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex gap-3 flex-wrap mt-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          {canSubmit && (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                setError(null);
                try {
                  await onSubmit(claim.id);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "送信に失敗しました");
                } finally { setSubmitting(false); }
              }}
            >
              <Send className="w-4 h-4" />
              {submitting ? "送信中..." : "パートナーAPIへ送信"}
            </Button>
          )}
          {canReject && !showReject && (
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
              onClick={() => setShowReject(true)}
            >
              <XCircle className="w-4 h-4" />
              差し戻し
            </Button>
          )}
          {showReject && (
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
              disabled={rejecting || !rejectReason.trim()}
              onClick={async () => {
                setRejecting(true);
                setError(null);
                try {
                  await onReject(claim.id, rejectReason);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "差し戻しに失敗しました");
                } finally { setRejecting(false); }
              }}
            >
              {rejecting ? "処理中..." : "差し戻し確定"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  const supabase = createClient();
  const [claims, setClaims] = useState<BillingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<BillingClaim | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [isMaster, setIsMaster] = useState(false);

  const fetchClaims = async (status?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const url = status && status !== "all"
      ? `/api/billing/claims?status=${status}`
      : "/api/billing/claims";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setClaims(json.claims ?? []);
    }
  };

  const checkRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: staff } = await supabase.from("staff").select("role").eq("id", user.id).maybeSingle();
    setIsMaster(staff?.role === "master");
  };

  useEffect(() => {
    Promise.all([checkRole(), fetchClaims(filter === "all" ? undefined : filter)])
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchClaims(filter === "all" ? undefined : filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (claimId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("ログインが必要です");
    const res = await fetch("/api/billing/claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ claim_id: claimId, action: "submit" }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? "送信に失敗しました");
    }
    await fetchClaims(filter === "all" ? undefined : filter);
  };

  const handleReject = async (claimId: string, reason: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("ログインが必要です");
    const res = await fetch("/api/billing/claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ claim_id: claimId, action: "reject", rejection_reason: reason }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error ?? "差し戻しに失敗しました");
    }
    await fetchClaims(filter === "all" ? undefined : filter);
  };

  const filterTabs = [
    { key: "all", label: "すべて" },
    { key: "draft", label: "下書き" },
    { key: "pending_review", label: "レビュー待ち" },
    { key: "submitted", label: "送信済み" },
    { key: "paid", label: "支払完了" },
    { key: "rejected", label: "差し戻し" },
  ];

  const totalPoints = claims
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + (c.total_points ?? 0), 0);

  if (!isMaster && !loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-700 text-amber-800">保険請求管理は master ロールのみアクセスできます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-800 text-slate-900">保険請求管理</h1>
          <p className="text-sm text-slate-500 mt-1">SOAP自動コーディング → パートナーAPI送信</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => fetchClaims(filter === "all" ? undefined : filter)}
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </Button>
      </div>

      {/* ADR-031 モック警告 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
        <strong>開発モード：</strong> パートナーAPI は現在モック実装です。本番パートナー契約後（Phase 7）に実APIに差し替えます。
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-800 text-slate-900">{claims.length}</p>
                <p className="text-xs text-slate-500">総請求件数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-800 text-slate-900">
                  {claims.filter((c) => ["draft", "pending_review"].includes(c.status)).length}
                </p>
                <p className="text-xs text-slate-500">要対応</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-800 text-slate-900">{totalPoints.toLocaleString()}</p>
                <p className="text-xs text-slate-500">支払完了点数</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${
              filter === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
            <span className="ml-1 text-slate-400">
              ({claims.filter((c) => t.key === "all" || c.status === t.key).length})
            </span>
          </button>
        ))}
      </div>

      {/* 請求一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            請求一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-slate-400 text-sm">読み込み中...</div>
          ) : claims.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Plus className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              請求レコードがありません
            </div>
          ) : (
            <div className="space-y-2">
              {claims.map((claim) => (
                <div
                  key={claim.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedClaim(claim)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-700 text-slate-900">
                        {claim.athletes?.name ?? "不明"}
                        {claim.ai_extracted && (
                          <span className="ml-2 text-xs text-violet-600 font-500">AI</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {claim.diagnosis_code ?? "コードなし"}
                        {claim.diagnosis_label ? ` — ${claim.diagnosis_label}` : ""}
                      </p>
                    </div>
                    <ClaimStatusBadge status={claim.status} />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-700 text-slate-900">
                      {claim.total_points?.toLocaleString() ?? 0} 点
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(claim.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 詳細モーダル */}
      {selectedClaim && (
        <ClaimDetailModal
          claim={selectedClaim}
          onClose={() => setSelectedClaim(null)}
          onSubmit={handleSubmit}
          onReject={handleReject}
        />
      )}
    </div>
  );
}
