import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProgramDetail } from './_components/program-detail';

export const metadata: Metadata = {
  title: 'リハビリプログラム詳細',
};

/**
 * リハビリプログラム詳細ページ
 *
 * フェーズタイムライン、ゲート基準、エクササイズメニュー、ロック状態を表示する。
 */
export default function ProgramDetailPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Suspense fallback={<ProgramDetailSkeleton />}>
        <ProgramDetail paramsPromise={params} />
      </Suspense>
    </div>
  );
}

/** スケルトンローダー */
function ProgramDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
      </div>
      {/* フェーズステッパー */}
      <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
      {/* ゲート基準 */}
      <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
      {/* エクササイズ */}
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
