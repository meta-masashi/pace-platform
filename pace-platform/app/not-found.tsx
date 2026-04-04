import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function NotFound() {
  // 認証状態に応じてリダイレクト先を決定
  let href = '/auth/login';
  let label = 'ログインに戻る';

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const loginContext = user.user_metadata?.login_context;
      const detectedRoles = (user.user_metadata?.detected_roles ?? []) as string[];

      if (loginContext === 'platform_admin' || detectedRoles.includes('platform_admin')) {
        href = '/platform-admin';
        label = '管理ダッシュボードに戻る';
      } else if (loginContext === 'athlete' || detectedRoles.includes('athlete')) {
        href = '/home';
        label = 'ホームに戻る';
      } else if (loginContext === 'staff' || detectedRoles.includes('staff')) {
        href = '/dashboard';
        label = 'ダッシュボードに戻る';
      }
    }
  } catch {
    // 認証チェック失敗時はログインへフォールバック
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        {/* PACE ロゴ */}
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600">
          <span className="text-2xl font-bold text-white">P</span>
        </div>

        <p className="text-6xl font-bold text-emerald-600">404</p>

        <h1 className="mt-4 text-2xl font-bold text-foreground">
          ページが見つかりません
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          お探しのページは存在しないか、移動された可能性があります。
        </p>

        <div className="mt-8">
          <Link
            href={href}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}
