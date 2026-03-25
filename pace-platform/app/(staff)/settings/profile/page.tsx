import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileForm } from './_components/profile-form';

// ---------------------------------------------------------------------------
// ロール表示ラベル
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  master: 'マスター管理者',
  AT: 'アスレティックトレーナー',
  PT: '理学療法士',
  'S&C': 'S&Cコーチ',
};

// ---------------------------------------------------------------------------
// プロフィール設定ページ
// ---------------------------------------------------------------------------

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // staff テーブルからプロフィール取得
  const { data: staff } = await supabase
    .from('staff')
    .select('name, role, org_id')
    .eq('id', user.id)
    .single();

  // 組織名を取得
  let teamName = '未設定';
  if (staff?.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', staff.org_id)
      .single();
    teamName = org?.name ?? '未設定';
  }

  const roleName = staff?.role ? (ROLE_LABELS[staff.role] ?? staff.role) : '不明';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">プロフィール</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          アカウント情報の確認と表示名の変更ができます。
        </p>
      </div>

      {/* プロフィール画像（将来機能） */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-base font-semibold text-foreground">
          プロフィール画像
        </h3>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {staff?.name?.charAt(0) ?? user.email?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              プロフィール画像のアップロード機能は近日公開予定です。
            </p>
          </div>
        </div>
      </div>

      {/* 表示名 */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          表示名
        </h3>
        <ProfileForm initialName={staff?.name ?? ''} />
      </div>

      {/* 読み取り専用情報 */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-semibold text-foreground">
          アカウント情報
        </h3>
        <dl className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              メールアドレス
            </dt>
            <dd className="mt-1 text-sm text-foreground">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              ロール
            </dt>
            <dd className="mt-1 text-sm text-foreground">{roleName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              チーム
            </dt>
            <dd className="mt-1 text-sm text-foreground">{teamName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
