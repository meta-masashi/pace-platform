export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-40" />
        <div className="h-9 bg-gray-200 rounded-lg w-40" />
      </div>

      {/* Program cards table skeleton */}
      <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
        {/* Table header */}
        <div className="h-10 bg-gray-100 w-full" />
        {/* Table rows */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-gray-50">
            <div className="h-4 bg-gray-200 rounded w-24 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-36 flex-1" />
            <div className="h-6 bg-gray-200 rounded w-16 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-12 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-20 flex-shrink-0" />
            <div className="h-5 bg-gray-200 rounded w-14 flex-shrink-0" />
            <div className="h-7 bg-gray-200 rounded w-12 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
