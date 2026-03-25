import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ExportContent } from './_components/export-content';

export const metadata: Metadata = {
  title: 'FHIR エクスポート',
};

/**
 * FHIR エクスポート設定ページ（master 権限のみ）
 *
 * 選手データを HL7 FHIR R4 Bundle として JSON ファイルに
 * エクスポートする。日付範囲の指定が可能。
 */
export default function FHIRExportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">FHIR エクスポート</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          選手データを HL7 FHIR R4 形式で JSON ファイルにエクスポートします
        </p>
      </div>
      <Suspense fallback={<ExportSkeleton />}>
        <ExportContent />
      </Suspense>
    </div>
  );
}

/** スケルトンローダー */
function ExportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
