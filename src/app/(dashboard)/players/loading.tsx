export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 rounded w-32" />

      {/* Search bar skeleton */}
      <div className="h-10 bg-gray-200 rounded-lg w-full max-w-sm" />

      {/* Table skeleton */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        {/* Table header */}
        <div className="h-10 bg-gray-100 w-full" />
        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-gray-50">
            <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-gray-200 rounded w-28" />
              <div className="h-3 bg-gray-200 rounded w-20" />
            </div>
            <div className="h-5 bg-gray-200 rounded w-16" />
            <div className="h-5 bg-gray-200 rounded w-12" />
            <div className="h-5 bg-gray-200 rounded w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
