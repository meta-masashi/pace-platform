import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CopilotContent } from './_components/copilot-content';

export const metadata: Metadata = {
  title: 'MDT Copilot — PACE',
  description: 'チーム全選手のコンディショニング判定をリアルタイムで確認',
};

async function CopilotLoader({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ team?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // スタッフ情報を取得
  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (!staff) {
    redirect('/login');
  }

  const searchParams = await searchParamsPromise;

  // チーム一覧を取得
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('org_id', staff.org_id)
    .order('name');

  const teamList = teams ?? [];

  // 選択されたチーム（クエリパラメータ or 最初のチーム）
  const selectedTeamId = searchParams.team ?? (teamList[0]?.id as string | undefined);

  if (!selectedTeamId) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-xl font-bold tracking-tight">MDT Copilot</h1>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            チームがまだ登録されていません。管理画面からチームを作成してください。
          </p>
        </div>
      </div>
    );
  }

  const selectedTeam = teamList.find((t) => (t.id as string) === selectedTeamId);
  const teamName = (selectedTeam?.name as string) ?? 'チーム';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* チーム切り替え */}
      {teamList.length > 1 && (
        <div className="flex items-center gap-3">
          <label htmlFor="team-select" className="text-sm font-medium text-foreground">
            チーム:
          </label>
          <TeamSelector teams={teamList} selectedTeamId={selectedTeamId} />
        </div>
      )}

      <CopilotContent teamId={selectedTeamId} teamName={teamName} />
    </div>
  );
}

function TeamSelector({
  teams,
  selectedTeamId,
}: {
  teams: Array<Record<string, unknown>>;
  selectedTeamId: string;
}) {
  return (
    <form>
      <select
        id="team-select"
        name="team"
        defaultValue={selectedTeamId}
        onChange={(e) => {
          // フォーム送信でナビゲーション
          const form = e.target.closest('form');
          if (form) form.submit();
        }}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {teams.map((t) => (
          <option key={t.id as string} value={t.id as string}>
            {(t.name as string) ?? 'チーム'}
          </option>
        ))}
      </select>
    </form>
  );
}

export default function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  return (
    <Suspense fallback={<CopilotSkeleton />}>
      <CopilotLoader searchParamsPromise={searchParams} />
    </Suspense>
  );
}

function CopilotSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
