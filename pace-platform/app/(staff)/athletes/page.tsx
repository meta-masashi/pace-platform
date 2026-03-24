import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AthletesContent } from './_components/athletes-content';

export const metadata: Metadata = {
  title: '選手一覧',
};

export default function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; q?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">選手一覧</h1>
      <Suspense fallback={<AthletesSkeleton />}>
        <AthletesContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}

function AthletesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="rounded-lg border border-border bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="flex-1" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
