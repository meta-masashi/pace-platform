'use client';

// ---------------------------------------------------------------------------
// AdminHeader — 管理画面ヘッダー
// ---------------------------------------------------------------------------

interface AdminHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function AdminHeader({ title, children }: AdminHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        {children}
      </div>
    </header>
  );
}
