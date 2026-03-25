"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, Check, AlertCircle, Loader2 } from "lucide-react";

interface ImportResult {
  imported: number;
  total_rows: number;
  errors: string[];
}

export function CsvImporter() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      const previewLines = lines.slice(0, 6).map((line) => {
        const cells: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === "," && !inQuotes) {
            cells.push(current.trim());
            current = "";
          } else current += char;
        }
        cells.push(current.trim());
        return cells;
      });
      setPreview(previewLines);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) {
        handleFile(f);
      } else {
        setError("CSVファイルのみ対応しています");
      }
    },
    [handleFile]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const res = await fetch("/api/assessment/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Import failed");
      }

      const data: ImportResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-700">
          CSVファイルをドラッグ＆ドロップ
        </p>
        <p className="text-xs text-slate-500 mt-1">
          またはクリックしてファイルを選択
        </p>
      </div>

      {/* File Info */}
      {file && (
        <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
          <FileText className="w-5 h-5 text-brand-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">
              {file.name}
            </p>
            <p className="text-2xs text-slate-500">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      )}

      {/* Preview Table */}
      {preview.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                {preview[0].map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(1).map((row, ri) => (
                <tr key={ri} className="border-t border-slate-100">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-2xs text-slate-400 border-t border-slate-100">
            プレビュー: 最初の5行
          </p>
        </div>
      )}

      {/* Upload Button */}
      {file && !result && (
        <button
          onClick={handleUpload}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              インポート中...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              アセスメントノードにインポート
            </>
          )}
        </button>
      )}

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg p-4 ${
            result.errors.length > 0
              ? "bg-amber-50 border border-amber-200"
              : "bg-brand-50 border border-brand-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.errors.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            ) : (
              <Check className="w-4 h-4 text-brand-600" />
            )}
            <p className="text-sm font-medium">
              {result.imported}/{result.total_rows} 件インポート完了
            </p>
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-amber-700 space-y-0.5 mt-2">
              {result.errors.slice(0, 5).map((err, i) => (
                <li key={i}>- {err}</li>
              ))}
              {result.errors.length > 5 && (
                <li>...他 {result.errors.length - 5} 件のエラー</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
