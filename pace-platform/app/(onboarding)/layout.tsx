import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ヘッダー: PACEロゴのみ */}
      <header className="flex h-14 items-center border-b border-border px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">P</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">PACE</span>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
