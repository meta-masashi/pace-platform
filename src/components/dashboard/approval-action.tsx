"use client";

import { useState, useCallback } from "react";
import { Check, Pencil, X, Loader2 } from "lucide-react";

interface ApprovalActionProps {
  athleteId: string;
  athleteName: string;
  recommendation: string;
  evidenceText?: string;
  riskScore?: number;
  onComplete?: (action: "approve" | "edit_approve" | "reject") => void;
}

export function ApprovalAction({
  athleteId,
  athleteName,
  recommendation,
  evidenceText,
  riskScore,
  onComplete,
}: ApprovalActionProps) {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "approved" | "rejected" | "editing"
  >("idle");
  const [editNote, setEditNote] = useState("");

  const submitApproval = useCallback(
    async (action: "approve" | "edit_approve" | "reject") => {
      setStatus("submitting");
      try {
        const res = await fetch("/api/approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athlete_id: athleteId,
            action,
            approved_menu_json: action === "edit_approve" ? { note: editNote } : null,
            evidence_text_snapshot: evidenceText ?? "",
            risk_score: riskScore ?? 0,
          }),
        });

        if (res.ok) {
          setStatus(action === "reject" ? "rejected" : "approved");
          onComplete?.(action);
        } else {
          setStatus("idle");
        }
      } catch {
        setStatus("idle");
      }
    },
    [athleteId, editNote, evidenceText, riskScore, onComplete]
  );

  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 text-brand-600">
        <Check className="w-4 h-4" />
        <span className="text-xs font-medium">承認済み</span>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-red-500">
        <X className="w-4 h-4" />
        <span className="text-xs font-medium">却下済み</span>
      </div>
    );
  }

  if (status === "submitting") {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">送信中...</span>
      </div>
    );
  }

  if (status === "editing") {
    return (
      <div className="space-y-2">
        <textarea
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          placeholder="修正コメントを入力..."
          className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={() => submitApproval("edit_approve")}
            disabled={!editNote.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 font-medium transition-colors"
          >
            修正して承認
          </button>
          <button
            onClick={() => setStatus("idle")}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => submitApproval("approve")}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium transition-colors"
        title={`${athleteName} の推奨を承認`}
      >
        <Check className="w-3.5 h-3.5" />
        承認
      </button>
      <button
        onClick={() => setStatus("editing")}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        title="修正して承認"
      >
        <Pencil className="w-3.5 h-3.5" />
        修正
      </button>
      <button
        onClick={() => submitApproval("reject")}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
        title="却下"
      >
        <X className="w-3.5 h-3.5" />
        却下
      </button>
    </div>
  );
}
