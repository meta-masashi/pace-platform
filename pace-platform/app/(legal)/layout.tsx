import Link from 'next/link';

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <span className="text-sm font-bold text-white">P</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              PACE
            </span>
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            ログイン
          </Link>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        {children}
      </main>

      {/* フッター */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} PACE Platform. All rights
              reserved.
            </p>
            <nav className="flex gap-6">
              <Link
                href="/tokushoho"
                className="text-xs text-gray-400 transition-colors hover:text-gray-600"
              >
                特定商取引法に基づく表記
              </Link>
              <Link
                href="/privacy"
                className="text-xs text-gray-400 transition-colors hover:text-gray-600"
              >
                プライバシーポリシー
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
