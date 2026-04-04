'use client';

// ---------------------------------------------------------------------------
// AdminSkeleton — ローディングスケルトン
// ---------------------------------------------------------------------------

export function AdminSkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-100" />
            <div className="h-3 w-20 rounded bg-slate-100" />
          </div>
          <div className="h-7 w-24 rounded bg-slate-100" />
          <div className="h-3 w-16 rounded bg-slate-100" />
        </div>
        <div className="h-8 w-20 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function AdminSkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-48 rounded bg-slate-100" />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 w-20 rounded bg-slate-200" />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="border-b border-slate-50 px-4 py-3">
            <div className="flex gap-8">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 w-20 rounded bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminSkeletonChart() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 h-4 w-24 rounded bg-slate-100" />
      <div className="h-48 w-full rounded bg-slate-50" />
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* KPIカード */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <AdminSkeletonCard key={i} />
        ))}
      </div>
      {/* テーブル */}
      <AdminSkeletonTable />
      {/* チャート */}
      <AdminSkeletonChart />
    </div>
  );
}
