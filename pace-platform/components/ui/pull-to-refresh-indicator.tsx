/**
 * components/ui/pull-to-refresh-indicator.tsx
 * Pull-to-Refresh のインジケーター表示
 */

'use client';

interface PullIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  pullProgress,
}: PullIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: pullDistance }}
    >
      <div
        className={`h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent ${
          isRefreshing ? 'animate-spin' : ''
        }`}
        style={{
          opacity: isRefreshing ? 1 : pullProgress,
          transform: `rotate(${pullProgress * 360}deg)`,
        }}
      />
    </div>
  );
}
