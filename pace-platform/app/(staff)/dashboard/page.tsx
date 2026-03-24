import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardContent } from './_components/dashboard-content';

export const metadata: Metadata = {
  title: 'ダッシュボード',
};

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">ダッシュボード</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-border bg-card"
          />
        ))}
      </div>
      {/* Charts skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      {/* Alert hub skeleton */}
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
