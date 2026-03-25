/**
 * PACE Platform — スタッフ管理ページ（master 限定）
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StaffManagementContent } from './_components/staff-management-content';

export default async function AdminStaffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!staff || staff.role !== 'master') {
    redirect('/dashboard');
  }

  // スタッフ一覧を取得
  const { data: staffList } = await supabase
    .from('staff')
    .select('id, name, email, role, is_leader, is_active, team_id, created_at, updated_at')
    .eq('org_id', staff.org_id)
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">スタッフ管理</h1>
        <p className="text-sm text-muted-foreground">
          組織のスタッフを管理・招待します
        </p>
      </div>
      <StaffManagementContent initialStaff={staffList ?? []} />
    </div>
  );
}
