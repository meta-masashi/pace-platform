import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { DashboardContent } from './_components/dashboard-content';

export const metadata: Metadata = {
  title: 'ダッシュボード',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const sp = await searchParams;

  // チームIDが未指定の場合、ログインユーザーの組織の最初のチームを自動選択
  if (!sp.team) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: staff } = await supabase
          .from('staff')
          .select('org_id')
          .eq('id', user.id)
          .single();
        if (staff?.org_id) {
          const { data: team } = await supabase
            .from('teams')
            .select('id')
            .eq('org_id', staff.org_id)
            .limit(1)
            .single();
          if (team?.id) {
            sp.team = team.id as string;
          }
        }
      }
    } catch {
      // フォールバック
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">ダッシュボード</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParamsPromise={Promise.resolve(sp)} />
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
