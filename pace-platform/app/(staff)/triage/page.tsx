import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TriageContent } from './_components/triage-content';

export const metadata: Metadata = {
  title: 'トリアージ',
};

export default function TriagePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">トリアージリスト</h1>
      <Suspense fallback={<TriageSkeleton />}>
        <TriageContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}

function TriageSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div
              key={j}
              className="h-24 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
