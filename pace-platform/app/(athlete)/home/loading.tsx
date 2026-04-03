/**
 * app/(athlete)/home/loading.tsx
 * アスリートホーム画面のスケルトンローダー
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function AthleteHomeLoading() {
  return (
    <div className="space-y-6 pb-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-8" circle />
      </div>

      {/* コンディショニングリング */}
      <div className="flex flex-col items-center py-6">
        <Skeleton className="h-[200px] w-[200px]" circle />
        <Skeleton className="mt-4 h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-24" />
      </div>

      {/* KPI ブレークダウン行 */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-10 w-10" circle />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>

      {/* フィードカード */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-14 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
