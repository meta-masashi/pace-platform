/**
 * PACE Platform — コミュニティページ（Slack風チャット）
 */

import Link from 'next/link';
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
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ヘッダー: 戻るボタン + タイトル */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          ダッシュボードに戻る
        </Link>
        <span className="text-sm font-semibold text-foreground">コミュニティ</span>
      </div>

      {/* チャットコンテンツ */}
      <div className="flex flex-1 min-h-0">
        <CommunityContent
          initialChannels={channels ?? []}
          canCreate={canCreate}
          currentStaffId={staff.id}
        />
      </div>
    </div>
  );
}
