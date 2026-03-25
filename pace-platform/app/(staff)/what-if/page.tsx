import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WhatIfDashboard } from './_components/what-if-dashboard';

export const metadata: Metadata = {
  title: '介入シミュレーター',
};

export default function WhatIfPage({
  searchParams,
}: {
  searchParams: Promise<{ athleteId?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">介入シミュレーター</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          「もし〇〇したら？」のシナリオを即座にシミュレーション
        </p>
      </div>
      <Suspense fallback={<WhatIfSkeleton />}>
        <WhatIfDashboard searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}

function WhatIfSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
      {/* Controls skeleton */}
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-12 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-12 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      {/* Results skeleton */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
      </div>
    </div>
  );
}
