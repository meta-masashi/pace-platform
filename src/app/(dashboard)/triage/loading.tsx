export default function Loading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-gray-200 rounded w-40" />

      {/* Priority tabs skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 bg-gray-200 rounded-full w-24" />
        ))}
      </div>

      {/* List rows skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-white"
          >
            <div className="w-2 h-10 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-200 rounded w-48" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
