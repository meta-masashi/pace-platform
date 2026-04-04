import { AdminSidebar } from '@/components/admin/admin-sidebar';

// ---------------------------------------------------------------------------
// プラットフォーム管理画面レイアウト
// ---------------------------------------------------------------------------
// Route Group: (platform-admin)
// サイドバー + ヘッダー + コンテンツエリア
// platform_admin ロール以外はミドルウェアでリダイレクト済み

export default function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
