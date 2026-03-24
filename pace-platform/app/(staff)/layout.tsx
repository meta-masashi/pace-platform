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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <StaffSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <StaffHeader user={user} />
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
