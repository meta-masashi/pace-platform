export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-40" />
        <div className="h-9 bg-gray-200 rounded-lg w-28" />
      </div>

      {/* Calendar navigation skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-gray-200 rounded" />
        <div className="h-6 bg-gray-200 rounded w-36" />
        <div className="h-8 w-8 bg-gray-200 rounded" />
      </div>

      {/* Calendar grid skeleton */}
      <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px bg-gray-100">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-8 bg-gray-50" />
          ))}
        </div>
        {/* Calendar cells — 5 weeks */}
        {[1, 2, 3, 4, 5].map((week) => (
          <div key={week} className="grid grid-cols-7 gap-px bg-gray-100">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div key={day} className="h-24 bg-white p-1 space-y-1">
                <div className="h-4 bg-gray-200 rounded w-6" />
                <div className="h-5 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
