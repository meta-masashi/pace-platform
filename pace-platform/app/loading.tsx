export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      {/* PACE ロゴ（パルスアニメーション） */}
      <div className="animate-pulse">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600">
          <span className="text-2xl font-bold text-white">P</span>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">読み込み中...</p>
    </div>
  );
}
