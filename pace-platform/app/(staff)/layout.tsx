import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StaffSidebar } from './_components/staff-sidebar';
import { StaffHeader } from './_components/staff-header';

export default async function StaffLayout({
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

  // スタッフの所属チーム名を取得（自動紐付け）
  let teamName = '';
  const { data: staff } = await supabase
    .from('staff')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (staff?.org_id) {
    const { data: teams } = await supabase
      .from('teams')
      .select('name')
      .eq('org_id', staff.org_id)
      .limit(1)
      .single();
    teamName = (teams?.name as string) ?? '';
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <StaffSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <StaffHeader user={user} teamName={teamName} />
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
