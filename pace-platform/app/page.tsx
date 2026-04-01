import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

// ---------------------------------------------------------------------------
// ランディングページ（未認証ユーザー向け）
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  // 認証済みユーザーはダッシュボードへリダイレクト
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      redirect('/dashboard');
    }
  } catch (err) { void err; // silently handled
    // 未認証の場合はランディングページを表示
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ナビゲーション */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <span className="text-sm font-bold text-white">P</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">
              PACE
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            ログイン
          </Link>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              スポーツ医療の意思決定を、
              <br />
              <span className="text-emerald-600">エビデンスで革新する</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-gray-600 sm:text-lg">
              PACE は因果推論 AI とデジタルツインを活用し、
              アスレティックトレーナー・理学療法士の意思決定を支援する
              スポーツ医療プラットフォームです。
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/login"
                className="w-full rounded-md bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto"
              >
                無料トライアルを開始
              </Link>
              <a
                href="#features"
                className="w-full rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:w-auto"
              >
                機能を見る
              </a>
            </div>
          </div>
        </div>
        {/* 装飾 */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-100/50 blur-3xl" />
      </section>

      {/* 機能セクション */}
      <section id="features" className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              3つのコア技術
            </h2>
            <p className="mt-4 text-base text-gray-600">
              科学的根拠に基づく意思決定を、日常のワークフローに統合します。
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* 因果推論AI */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                <svg
                  className="h-6 w-6 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                因果推論AI
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                ブラックボックスではない、論文エビデンスに基づくリスク推論。
                各予測の根拠を論文レベルで追跡可能です。
              </p>
            </div>

            {/* 7 AM Monopoly */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                <svg
                  className="h-6 w-6 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                7 AM Monopoly
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                毎朝、介入すべき選手と修正済みメニューが自動生成。
                朝のミーティングまでに全ての準備が完了します。
              </p>
            </div>

            {/* デジタルツイン */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                <svg
                  className="h-6 w-6 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3h6l-3 7h4l-7 11 2-7H7l2-11z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                デジタルツイン
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                「もし〇〇したら？」のシミュレーションで最善の判断を。
                介入の効果を事前に可視化し、リスクを最小化します。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* プライシングセクション */}
      <section className="bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              プラン・料金
            </h2>
            <p className="mt-4 text-base text-gray-600">
              チームの規模に合わせて最適なプランをお選びください。
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:mx-auto lg:max-w-4xl">
            {/* Starter */}
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">
                  &yen;29,800
                </span>
                <span className="text-sm text-gray-500">/月</span>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                小規模チーム向け。基本機能をすべて利用可能。
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  '1チーム',
                  '基本コンディショニングスコア',
                  '朝のアジェンダ（7 AM Monopoly）',
                  'メール通知',
                  '基本レポート',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="mt-8 block w-full rounded-md border border-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-50"
              >
                無料トライアルを開始
              </Link>
            </div>

            {/* Pro */}
            <div className="relative rounded-xl border-2 border-emerald-600 bg-white p-8 shadow-md">
              <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white">
                おすすめ
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">
                  &yen;79,800
                </span>
                <span className="text-sm text-gray-500">/月</span>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                プロフェッショナルチーム向け。全機能をフル活用。
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  '無制限チーム',
                  '因果推論 AI エンジン',
                  'デジタルツインシミュレーション',
                  'S2S デバイス連携',
                  'Slack / Web Push 通知',
                  '高度なレポート・分析',
                  '優先サポート',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="mt-8 block w-full rounded-md bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                無料トライアルを開始
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA セクション */}
      <section className="bg-emerald-600 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            スポーツ医療の新しいスタンダードを、あなたのチームに。
          </h2>
          <p className="mt-4 text-base text-emerald-100">
            14日間の無料トライアルで、PACE の全機能をお試しください。
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-md bg-white px-8 py-3 text-base font-semibold text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50"
          >
            無料トライアルを開始
          </Link>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t border-gray-200 bg-white py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-600">
                <span className="text-xs font-bold text-white">P</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">
                PACE Platform
              </span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6">
              <Link
                href="/tokushoho"
                className="text-sm text-gray-500 transition-colors hover:text-gray-700"
              >
                特定商取引法に基づく表記
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-gray-500 transition-colors hover:text-gray-700"
              >
                プライバシーポリシー
              </Link>
            </nav>
          </div>
          <p className="mt-8 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PACE Platform. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
