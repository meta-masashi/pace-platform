export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-48px)] -m-6 animate-pulse">
      {/* Sidebar skeleton */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100 space-y-1.5">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-200 rounded w-36" />
        </div>
        <div className="flex-1 px-2 py-2 space-y-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 bg-gray-200 rounded-md" />
          ))}
        </div>
      </aside>

      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Channel header */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white">
          <div className="h-5 bg-gray-200 rounded w-32" />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden px-6 py-4 space-y-4 bg-gray-50">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-12 bg-gray-200 rounded-lg w-3/4" />
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="px-6 py-3 border-t border-gray-200 bg-white">
          <div className="h-10 bg-gray-200 rounded-md" />
        </div>
      </div>
    </div>
  );
}
