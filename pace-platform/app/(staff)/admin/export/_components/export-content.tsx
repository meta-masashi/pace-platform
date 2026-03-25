'use client';

/**
 * PACE Platform — FHIR エクスポートコンテンツ
 *
 * 選手選択・日付範囲指定・エクスポート実行・バンドルプレビューを
 * 提供するクライアントコンポーネント。master 権限のみ使用可能。
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Athlete {
  id: string;
  name: string;
  position: string;
  number: string;
}

interface BundleSummary {
  resourceType: string;
  type: string;
  timestamp: string;
  total: number;
  resourceCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

/**
 * FHIR エクスポートメインコンテンツ
 */
export function ExportContent() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);

  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [bundleSummary, setBundleSummary] = useState<BundleSummary | null>(null);
  const [bundleJson, setBundleJson] = useState('');

  // ----- マスターデータ取得 -----
  useEffect(() => {
    async function fetchAthletes() {
      try {
        const res = await fetch('/api/team/dashboard');
        const data = await res.json();
        if (data.data?.athletes) {
          setAthletes(data.data.athletes);
        }
      } catch (e) {
        console.error('選手一覧取得エラー:', e);
      } finally {
        setLoadingMaster(false);
      }
    }
    fetchAthletes();
  }, []);

  // ----- エクスポート実行 -----
  const handleExport = useCallback(async () => {
    if (!selectedAthleteId) return;
    setExporting(true);
    setError('');
    setBundleSummary(null);
    setBundleJson('');

    try {
      const params = new URLSearchParams({ athleteId: selectedAthleteId });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/fhir/export?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'FHIR エクスポートに失敗しました。');
      }

      const json = await res.text();
      const bundle = JSON.parse(json);

      // バンドルサマリーを計算
      const resourceCounts: Record<string, number> = {};
      for (const entry of bundle.entry ?? []) {
        const type = entry.resource?.resourceType ?? 'Unknown';
        resourceCounts[type] = (resourceCounts[type] ?? 0) + 1;
      }

      setBundleSummary({
        resourceType: bundle.resourceType,
        type: bundle.type,
        timestamp: bundle.timestamp,
        total: bundle.total ?? bundle.entry?.length ?? 0,
        resourceCounts,
      });

      setBundleJson(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。');
    } finally {
      setExporting(false);
    }
  }, [selectedAthleteId, fromDate, toDate]);

  // ----- ダウンロード -----
  const handleDownload = useCallback(() => {
    if (!bundleJson) return;

    const blob = new Blob([bundleJson], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fhir-export-${selectedAthleteId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [bundleJson, selectedAthleteId]);

  // ----- 描画 -----
  if (loadingMaster) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* エクスポートフォーム */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold">エクスポート設定</h2>
        <div className="space-y-4">
          {/* 選手選択 */}
          <div>
            <label
              htmlFor="fhir-athlete-select"
              className="mb-1 block text-sm font-medium text-muted-foreground"
            >
              選手を選択
            </label>
            <select
              id="fhir-athlete-select"
              value={selectedAthleteId}
              onChange={(e) => setSelectedAthleteId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">-- 選手を選択 --</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（{a.position} #{a.number}）
                </option>
              ))}
            </select>
          </div>

          {/* 日付範囲 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="fhir-from-date"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                開始日（任意）
              </label>
              <input
                id="fhir-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="fhir-to-date"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                終了日（任意）
              </label>
              <input
                id="fhir-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* エクスポートボタン */}
          <button
            type="button"
            onClick={handleExport}
            disabled={!selectedAthleteId || exporting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? 'エクスポート中...' : 'FHIR エクスポート'}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* バンドルサマリー */}
      {bundleSummary && (
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">エクスポート結果</h2>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              JSON ダウンロード
            </button>
          </div>

          {/* サマリー情報 */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">リソース総数</div>
              <div className="text-lg font-bold">{bundleSummary.total}</div>
            </div>
            {Object.entries(bundleSummary.resourceCounts).map(
              ([type, count]) => (
                <div
                  key={type}
                  className="rounded-md border border-border p-3 text-center"
                >
                  <div className="text-xs text-muted-foreground">{type}</div>
                  <div className="text-lg font-bold">{count}</div>
                </div>
              )
            )}
          </div>

          {/* Bundle JSON プレビュー */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              FHIR Bundle プレビュー
            </h3>
            <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/50 p-4 text-xs">
              {bundleJson.length > 5000
                ? bundleJson.slice(0, 5000) + '\n\n... (以下省略)'
                : bundleJson}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
