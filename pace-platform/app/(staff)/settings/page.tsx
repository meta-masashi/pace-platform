import Link from 'next/link';

// ---------------------------------------------------------------------------
// 設定メニュー項目
// ---------------------------------------------------------------------------

const SETTINGS_ITEMS = [
  {
    href: '/settings/profile',
    label: 'プロフィール',
    description: '表示名やアカウント情報の確認・変更',
    icon: UserIcon,
  },
  {
    href: '/settings/security',
    label: 'セキュリティ',
    description: 'パスワード変更、二要素認証の設定',
    icon: ShieldIcon,
  },
  {
    href: '/settings/notifications',
    label: '通知設定',
    description: 'メール・Slack・Web Push の通知チャネル設定',
    icon: BellIcon,
  },
  {
    href: '/settings/integrations',
    label: '外部連携',
    description: 'GPS・ウェアラブルデバイスの S2S API 設定',
    icon: LinkIcon,
  },
];

// ---------------------------------------------------------------------------
// 設定インデックスページ
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          アカウントやアプリケーションの設定を管理します。
        </p>
      </div>

      <div className="space-y-3">
        {SETTINGS_ITEMS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">
                {label}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            <svg
              className="h-5 w-5 shrink-0 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon components
// ---------------------------------------------------------------------------

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
