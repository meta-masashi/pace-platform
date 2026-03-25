/**
 * PACE Platform — コミュニティページ（Slack風チャット）
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CommunityContent } from './_components/community-content';

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id, role, is_leader, is_active')
    .eq('id', user.id)
    .single();

  if (!staff) redirect('/login');

  // チャンネル一覧取得
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, type, team_id, created_at')
    .eq('org_id', staff.org_id)
    .order('created_at', { ascending: true });

  const canCreate = staff.role === 'master' || staff.is_leader;

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      <CommunityContent
        initialChannels={channels ?? []}
        canCreate={canCreate}
        currentStaffId={staff.id}
      />
    </div>
  );
}
