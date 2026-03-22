export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 rounded w-40" />
      <div className="h-4 bg-gray-200 rounded w-56" />

      {/* Athlete selector cards skeleton */}
      <div className="grid grid-cols-1 gap-3 max-w-xl">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="space-y-1.5">
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 bg-gray-200 rounded w-16" />
              <div className="w-4 h-4 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
