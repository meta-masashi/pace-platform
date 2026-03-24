import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AthleteDetailContent } from './_components/athlete-detail-content';

export const metadata: Metadata = {
  title: '選手詳細',
};

export default function AthleteDetailPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Suspense fallback={<AthleteDetailSkeleton />}>
        <AthleteDetailContent paramsPromise={params} />
      </Suspense>
    </div>
  );
}

function AthleteDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-10 w-64 animate-pulse rounded bg-muted" />
      <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
