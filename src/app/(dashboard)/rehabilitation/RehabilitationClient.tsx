"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { RehabProgram, RehabPhase, Athlete } from "@/types";

const phaseColors: Record<RehabPhase, string> = {
  1: "text-red-700 bg-red-50 border-red-200",
  2: "text-amber-700 bg-amber-50 border-amber-200",
  3: "text-blue-700 bg-blue-50 border-blue-200",
  4: "text-green-700 bg-green-50 border-green-200",
};

const statusLabel = {
  active: "進行中",
  completed: "完了",
  on_hold: "保留中",
} as const;

interface ProgramWithAthlete {
  program: RehabProgram;
  athleteName: string;
}

interface RehabilitationClientProps {
  items: ProgramWithAthlete[];
  athletes: Pick<Athlete, "id" | "name">[];
}

function ApprovalBadge({ status }: { status: RehabProgram["approval_status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        ✅ 診断承認済み
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        ❌ 差し戻し
      </span>
    );
  }
  // pending
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
      🟡 承認待ち
    </span>
  );
}

function NewRehabModal({
  athletes,
  onClose,
  onSuccess,
}: {
  athletes: Pick<Athlete, "id" | "name">[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    athlete_id: "",
    diagnosis_label: "",
    diagnosis_code: "",
    doctor_name: "",
    doctor_institution: "",
    diagnosis_confirmed_at: "",
    start_date: "",
    estimated_rtp_date: "",
  });
  const [fileName, setFileName] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setDocFile(null);
      setFileName(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("ファイルサイズは10MB以内にしてください");
      return;
    }
    setDocFile(file);
    setFileName(file.name);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.athlete_id || !form.diagnosis_label || !form.doctor_name || !form.start_date) {
      setError("選手、診断名、担当医師名、開始日は必須です");
      return;
    }

    setSubmitting(true);
    try {
      // Upload diagnosis document to Supabase Storage if provided
      let diagnosis_document_url: string | null = null;
      if (docFile) {
        const supabase = createClient();
        const ext = docFile.name.split(".").pop();
        const path = `diagnoses/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("diagnosis-documents")
          .upload(path, docFile, { contentType: docFile.type });
        if (uploadError) {
          setError(`ファイルのアップロードに失敗しました: ${uploadError.message}`);
          setSubmitting(false);
          return;
        }
        diagnosis_document_url = path;
      }

      const res = await fetch("/api/rehabilitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          diagnosis_document_url,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "送信に失敗しました");
        return;
      }

      onSuccess();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">新規リハビリ申請</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* 選手選択 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              選手選択 <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.athlete_id}
              onChange={(e) => setForm((f) => ({ ...f, athlete_id: e.target.value }))}
              required
            >
              <option value="">選択してください</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* 診断名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              診断名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="例: 右足関節II度捻挫"
              value={form.diagnosis_label}
              onChange={(e) => setForm((f) => ({ ...f, diagnosis_label: e.target.value }))}
              required
            />
          </div>

          {/* ICD-10 コード */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ICD-10 コード（任意）
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="例: S93.4"
              value={form.diagnosis_code}
              onChange={(e) => setForm((f) => ({ ...f, diagnosis_code: e.target.value }))}
            />
          </div>

          {/* 担当医師名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              担当医師名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="例: 山田太郎"
              value={form.doctor_name}
              onChange={(e) => setForm((f) => ({ ...f, doctor_name: e.target.value }))}
              required
            />
          </div>

          {/* 医療機関名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              医療機関名（任意）
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="例: 東京スポーツ整形外科"
              value={form.doctor_institution}
              onChange={(e) => setForm((f) => ({ ...f, doctor_institution: e.target.value }))}
            />
          </div>

          {/* 診断日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              診断日
            </label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.diagnosis_confirmed_at}
              onChange={(e) => setForm((f) => ({ ...f, diagnosis_confirmed_at: e.target.value }))}
            />
          </div>

          {/* リハビリ開始日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              リハビリ開始日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              required
            />
          </div>

          {/* RTP予定日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RTP予定日（任意）
            </label>
            <input
              type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.estimated_rtp_date}
              onChange={(e) => setForm((f) => ({ ...f, estimated_rtp_date: e.target.value }))}
            />
          </div>

          {/* 診断書アップロード */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              診断書（PDF・画像）
            </label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFile}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            <p className="text-xs text-gray-400 mt-1">PDF・JPG・PNG、最大10MB</p>
            {fileName && (
              <p className="mt-1 text-xs text-gray-500">選択済み: {fileName}</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "送信中..." : "申請する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RehabilitationClient({ items, athletes }: RehabilitationClientProps) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    setShowModal(false);
    router.refresh();
  };

  // Group programs
  const pending = items.filter((i) => i.program.approval_status === "pending");
  const activeApproved = items.filter(
    (i) => i.program.approval_status !== "pending" && i.program.status === "active"
  );
  const completed = items.filter(
    (i) => i.program.approval_status !== "pending" && i.program.status !== "active"
  );

  const active = items.filter((i) => i.program.status === "active").length;

  const renderRow = ({ program, athleteName }: ProgramWithAthlete) => {
    const startDate = new Date(program.start_date);
    const elapsed = Math.floor(
      (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const displayLabel =
      program.approval_status === "pending"
        ? "---（承認待ち）"
        : program.diagnosis_label;

    return (
      <tr key={program.id} className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 font-medium text-gray-900">{athleteName}</td>
        <td className="px-4 py-3 text-gray-700">
          <div>{displayLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ApprovalBadge status={program.approval_status} />
            {program.diagnosis_document_url && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                診断書あり
              </span>
            )}
          </div>
          {program.approval_status === "rejected" && program.rejection_reason && (
            <div className="mt-1 text-xs text-red-600">理由: {program.rejection_reason}</div>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
              phaseColors[program.current_phase]
            )}
          >
            Phase {program.current_phase}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-gray-600">{elapsed}日</td>
        <td className="px-4 py-3 text-gray-600">
          {program.estimated_rtp_date
            ? new Date(program.estimated_rtp_date).toLocaleDateString("ja-JP", {
                month: "short",
                day: "numeric",
              })
            : "—"}
        </td>
        <td className="px-4 py-3">
          <Badge
            variant={
              program.status === "active"
                ? "watchlist"
                : program.status === "completed"
                ? "normal"
                : "default"
            }
          >
            {statusLabel[program.status]}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <Link
            href={`/rehabilitation/${program.id}`}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            詳細
          </Link>
        </td>
      </tr>
    );
  };

  const tableHeader = (
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-4 py-3 font-medium text-gray-600">選手名</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">傷害名</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">現フェーズ</th>
        <th className="text-center px-4 py-3 font-medium text-gray-600">経過日数</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">RTP予定日</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">ステータス</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">アクション</th>
      </tr>
    </thead>
  );

  return (
    <>
      {showModal && (
        <NewRehabModal
          athletes={athletes}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">リハビリ管理</h1>
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
              <span className="text-blue-700 font-semibold">{active}</span>
              <span className="text-blue-600 text-sm ml-1">件 アクティブプログラム</span>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + 新規リハビリ申請
            </button>
          </div>
        </div>

        {/* 承認待ちセクション */}
        {pending.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-yellow-700 mb-2 flex items-center gap-1">
              🟡 承認待ち ({pending.length}件)
            </h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {tableHeader}
                  <tbody className="divide-y divide-gray-50">
                    {pending.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* 進行中セクション */}
        {activeApproved.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-600 mb-2">進行中</h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {tableHeader}
                  <tbody className="divide-y divide-gray-50">
                    {activeApproved.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* 完了セクション */}
        {completed.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-600 mb-2">完了</h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {tableHeader}
                  <tbody className="divide-y divide-gray-50">
                    {completed.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {items.length === 0 && (
          <Card>
            <div className="py-8 text-center text-sm text-gray-400">
              リハビリプログラムがありません
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
