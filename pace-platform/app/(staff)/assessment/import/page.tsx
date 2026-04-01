"use client";

/**
 * /app/(staff)/assessment/import/page.tsx
 * ============================================================
 * Assessment Nodes CSV インポート画面（M7）
 *
 * 1. ドラッグ&ドロップ / ファイル選択でCSVをアップロード
 * 2. preview モードで解析結果をプレビュー（エラーハイライト付き）
 * 3. commit ボタンで DB に確定インポート
 * ============================================================
 */

import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ParsedNode {
  node_id: string;
  file_type: string;
  phase: string;
  category: string;
  question_text: string;
  target_axis: string;
  lr_yes: number;
  lr_no: number;
  kappa: number;
  prescription_tags: string[];
  contraindication_tags: string[];
}

interface ParseRowError {
  rowNumber: number;
  nodeId?: string;
  message: string;
}

interface PreviewResult {
  summary: {
    totalRows: number;
    validNodes: number;
    invalidRows: number;
  };
  nodes: ParsedNode[];
  errors: ParseRowError[];
}

type ConflictResolution = "skip" | "update";

// ---------------------------------------------------------------------------
// CSVテンプレートのダウンロード
// ---------------------------------------------------------------------------

const CSV_TEMPLATE_HEADER =
  "node_id,file_type,phase,category,question_text,target_axis,lr_yes,lr_no,kappa,prescription_tags,contraindication_tags,time_decay_lambda,sort_order";

const CSV_TEMPLATE_EXAMPLE =
  'F3_001,F3,acute,筋力バランス,等速性筋力計/HHDで屈曲筋力低下を認めるか,hamstring_weakness,4.7,0.3,0.8,"#Str_Hamstring_Eccentric,#Str_Hip_Hinge","!#Sprinting",0.02,1';

function downloadTemplate() {
  const content = `${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}\n`;
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assessment_nodes_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export default function AssessmentImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [conflict, setConflict] = useState<ConflictResolution>("skip");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── ファイル選択処理 ──
  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) {
      setApiError("CSVファイル（.csv）を選択してください。");
      return;
    }
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    setApiError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile]
  );

  // ── プレビュー ──
  const handlePreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setApiError(null);
    setCommitResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "preview");
    formData.append("conflictResolution", conflict);

    try {
      const res = await fetch("/api/assessment/nodes/import", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
      } & Partial<PreviewResult>;

      if (!json.success) {
        setApiError(json.error ?? "プレビューに失敗しました。");
        return;
      }

      setPreview({
        summary: json.summary!,
        nodes: json.nodes ?? [],
        errors: json.errors ?? [],
      });
    } catch (err) { void err; // silently handled
      setApiError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [file, conflict]);

  // ── コミット ──
  const handleCommit = useCallback(async () => {
    if (!file || !preview) return;
    setLoading(true);
    setApiError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "commit");
    formData.append("conflictResolution", conflict);

    try {
      const res = await fetch("/api/assessment/nodes/import", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        imported?: number;
        skipped?: number;
      };

      if (!json.success) {
        setApiError(json.error ?? "インポートに失敗しました。");
        return;
      }

      setCommitResult({ imported: json.imported ?? 0, skipped: json.skipped ?? 0 });
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) { void err; // silently handled
      setApiError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [file, preview, conflict]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-xl font-bold text-foreground">
          Assessment Nodes CSV インポート
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          臨床評価ノード（assessment_nodes）を CSV ファイルから一括登録します。
          まずプレビューで内容を確認し、問題がなければ確定インポートを実行してください。
        </p>
      </div>

      {/* 完了メッセージ */}
      {commitResult && (
        <div className="rounded-lg border border-optimal-200 bg-optimal-50 p-4">
          <p className="text-sm font-semibold text-optimal-800">
            インポート完了
          </p>
          <p className="mt-1 text-sm text-optimal-700">
            {commitResult.imported} 件を登録しました。
            {commitResult.skipped > 0 &&
              ` （${commitResult.skipped} 件は既存のためスキップ）`}
          </p>
        </div>
      )}

      {/* エラーメッセージ */}
      {apiError && (
        <div className="rounded-lg border border-critical-200 bg-critical-50 p-4">
          <p className="text-sm text-critical-700">{apiError}</p>
        </div>
      )}

      {/* テンプレートダウンロード */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          CSVフォーマットが不明な場合はテンプレートをダウンロードしてください。
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-xs font-medium text-primary underline hover:no-underline"
        >
          テンプレートをダウンロード
        </button>
      </div>

      {/* ドラッグ&ドロップゾーン */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onFileChange}
        />
        <div className="flex flex-col items-center gap-2">
          <UploadIcon className="h-10 w-10 text-muted-foreground/50" />
          {file ? (
            <p className="text-sm font-medium text-foreground">
              {file.name}{" "}
              <span className="text-muted-foreground">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                CSVファイルをドラッグ&ドロップ
              </p>
              <p className="text-xs text-muted-foreground">
                またはクリックしてファイルを選択（最大 5MB）
              </p>
            </>
          )}
        </div>
      </div>

      {/* オプション */}
      <div className="flex items-center gap-6">
        <span className="text-sm font-medium text-foreground">
          既存データの扱い:
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="conflict"
            value="skip"
            checked={conflict === "skip"}
            onChange={() => setConflict("skip")}
            className="accent-primary"
          />
          スキップ（既存を保持）
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="conflict"
            value="update"
            checked={conflict === "update"}
            onChange={() => setConflict("update")}
            className="accent-primary"
          />
          上書き更新
        </label>
      </div>

      {/* アクションボタン */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!file || loading}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "処理中..." : "プレビュー"}
        </button>
        {preview && preview.summary.validNodes > 0 && (
          <button
            type="button"
            onClick={handleCommit}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "インポート中..." : `${preview.summary.validNodes} 件を確定インポート`}
          </button>
        )}
      </div>

      {/* プレビュー結果 */}
      {preview && (
        <div className="space-y-4">
          {/* サマリー */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="総行数" value={preview.summary.totalRows} />
            <SummaryCard
              label="有効ノード"
              value={preview.summary.validNodes}
              variant="good"
            />
            <SummaryCard
              label="エラー行"
              value={preview.summary.invalidRows}
              variant={preview.summary.invalidRows > 0 ? "bad" : "good"}
            />
          </div>

          {/* エラー一覧 */}
          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-critical-200 bg-critical-50 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-critical-800">
                エラー ({preview.errors.length} 件)
              </h3>
              <ul className="space-y-1">
                {preview.errors.map((err, i) => (
                  <li key={i} className="text-xs text-critical-700">
                    <span className="font-medium">行 {err.rowNumber}</span>
                    {err.nodeId && (
                      <span className="ml-1 text-critical-500">
                        [{err.nodeId}]
                      </span>
                    )}
                    : {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* プレビューテーブル */}
          {preview.nodes.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="bg-muted/40 px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  プレビュー（先頭 {preview.nodes.length} 件）
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/20">
                    <tr>
                      {["node_id", "file_type", "phase", "category", "target_axis", "LR+", "LR-", "κ"].map(
                        (h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.nodes.map((node, i) => (
                      <tr
                        key={node.node_id}
                        className={`border-b border-border/50 ${
                          i % 2 === 0 ? "" : "bg-muted/10"
                        }`}
                      >
                        <td className="px-3 py-2 font-mono font-medium">{node.node_id}</td>
                        <td className="px-3 py-2">{node.file_type}</td>
                        <td className="px-3 py-2">{node.phase}</td>
                        <td className="max-w-[140px] truncate px-3 py-2" title={node.category}>
                          {node.category}
                        </td>
                        <td className="max-w-[120px] truncate px-3 py-2" title={node.target_axis}>
                          {node.target_axis}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-optimal-600">
                          {node.lr_yes.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-watchlist-600">
                          {node.lr_no.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{node.kappa.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.summary.validNodes > 50 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  ※ 先頭50件のみ表示しています（全{preview.summary.validNodes}件）
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  variant = "neutral",
}: {
  label: string;
  value: number;
  variant?: "good" | "bad" | "neutral";
}) {
  const color =
    variant === "good"
      ? "text-optimal-600"
      : variant === "bad"
        ? "text-critical-600"
        : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
