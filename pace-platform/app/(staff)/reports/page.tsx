import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportsContent } from './_components/reports-content';

export const metadata: Metadata = {
  title: 'レポート生成',
};

/**
 * レポート生成ページ
 *
 * 選手個人レポートおよびチーム MDT レポートの生成・プレビュー・印刷を行う。
 */
export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">レポート生成</h1>
      <Suspense fallback={<ReportsSkeleton />}>
        <ReportsContent />
      </Suspense>
    </div>
  );
}

/** スケルトンローダー */
function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
