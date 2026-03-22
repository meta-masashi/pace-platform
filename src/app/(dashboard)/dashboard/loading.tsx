export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-5 bg-gray-200 rounded w-32" />
      </div>

      {/* KPI cards skeleton — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-gray-200 rounded-xl" />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-64 bg-gray-200 rounded-xl" />

      {/* Triage list skeleton */}
      <div className="space-y-3">
        <div className="h-5 bg-gray-200 rounded w-36" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-200 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
