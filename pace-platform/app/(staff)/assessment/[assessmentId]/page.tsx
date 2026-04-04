import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AssessmentSession } from './_components/assessment-session';

export const metadata: Metadata = {
  title: 'アセスメント',
};

export default function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<AssessmentSkeleton />}>
        <AssessmentSession paramsPromise={params} />
      </Suspense>
    </div>
  );
}

function AssessmentSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      {/* Left panel skeleton */}
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-3 animate-pulse rounded-full bg-muted" />
        <div className="h-40 animate-pulse rounded-lg border border-border bg-card" />
        <div className="flex gap-3">
          <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted" />
          <div className="h-12 flex-1 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      {/* Right panel skeleton */}
      <div className="space-y-3">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded bg-muted"
            style={{ width: `${90 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
