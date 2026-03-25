/**
 * PACE Platform — チーム管理ページ（master 限定）
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TeamsManagementContent } from './_components/teams-management-content';

export default async function AdminTeamsPage() {
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

  // チーム一覧取得
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/admin/teams`,
    {
      headers: {
        cookie: '', // server-side — use direct query instead
      },
      cache: 'no-store',
    }
  ).catch(() => null);

  // Direct Supabase query as fallback
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, created_at, updated_at')
    .eq('org_id', staff.org_id)
    .order('created_at', { ascending: true });

  // Get staff and athlete counts
  const { data: staffMembers } = await supabase
    .from('staff')
    .select('team_id')
    .eq('org_id', staff.org_id);

  const { data: athletes } = await supabase
    .from('athletes')
    .select('team_id')
    .eq('org_id', staff.org_id);

  const staffCountMap: Record<string, number> = {};
  const athleteCountMap: Record<string, number> = {};

  (staffMembers ?? []).forEach((s) => {
    if (s.team_id) {
      staffCountMap[s.team_id] = (staffCountMap[s.team_id] ?? 0) + 1;
    }
  });

  (athletes ?? []).forEach((a) => {
    if (a.team_id) {
      athleteCountMap[a.team_id] = (athleteCountMap[a.team_id] ?? 0) + 1;
    }
  });

  const teamsWithCounts = (teams ?? []).map((t) => ({
    ...t,
    staff_count: staffCountMap[t.id] ?? 0,
    athlete_count: athleteCountMap[t.id] ?? 0,
  }));

  // 全スタッフ一覧（チーム割り当て用）
  const { data: allStaff } = await supabase
    .from('staff')
    .select('id, name, role, team_id')
    .eq('org_id', staff.org_id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">チーム管理</h1>
        <p className="text-sm text-muted-foreground">
          チームの作成・編集とスタッフの割り当て
        </p>
      </div>
      <TeamsManagementContent
        initialTeams={teamsWithCounts}
        staffList={allStaff ?? []}
      />
    </div>
  );
}
