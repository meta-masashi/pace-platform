import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RehabProgramsList } from './_components/rehab-programs-list';

export const metadata: Metadata = {
  title: 'リハビリ管理',
};

/**
 * リハビリプログラム一覧ページ
 *
 * 全チームのアクティブなリハビリプログラムを表示する。
 * フィルター: Active / Completed / All
 */
export default function RehabPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">リハビリ管理</h1>
      <Suspense fallback={<RehabSkeleton />}>
        <RehabProgramsList searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}

/** スケルトンローダー */
function RehabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="rounded-lg border border-border bg-card">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 w-3 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="flex-1" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
