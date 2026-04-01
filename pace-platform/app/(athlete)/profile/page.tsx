'use client';

/**
 * PACE Platform — アスリートプロフィールページ
 *
 * 選手情報の表示、設定変更、ログアウト。
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ProfileData {
  name: string;
  email: string;
  sport: string;
  position: string;
  number: string;
  age: number | null;
  teamName: string;
  validDataDays: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: athlete } = await supabase
          .from('athletes')
          .select('display_name, sport, position, number, age, team_id')
          .eq('user_id', user.id)
          .single();

        let teamName = '';
        if (athlete?.team_id) {
          const { data: team } = await supabase
            .from('teams')
            .select('name')
            .eq('id', athlete.team_id)
            .single();
          teamName = (team?.name as string) ?? '';
        }

        const { count } = await supabase
          .from('daily_metrics')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', user.id);

        setProfile({
          name: (athlete?.display_name as string) ?? user.user_metadata?.full_name ?? '',
          email: user.email ?? '',
          sport: (athlete?.sport as string) ?? '',
          position: (athlete?.position as string) ?? '',
          number: (athlete?.number as string) ?? '',
          age: (athlete?.age as number) ?? null,
          teamName,
          validDataDays: count ?? 0,
        });
      } catch (err) { void err; // silently handled
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) { void err; // silently handled
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <div className="h-20 w-20 mx-auto animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-40 mx-auto animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pt-12 text-center text-sm text-muted-foreground">
        プロフィールを読み込めませんでした。
      </div>
    );
  }

  const initials = profile.name ? profile.name.slice(0, 2) : '?';

  return (
    <div className="flex flex-col gap-5">
      {/* アバター + 名前 */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">{profile.name || '未設定'}</h1>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
      </div>

      {/* 基本情報 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          基本情報
        </p>
        <div className="space-y-3">
          <InfoRow label="チーム" value={profile.teamName || '未所属'} />
          <InfoRow label="競技" value={profile.sport || '未設定'} />
          <InfoRow label="ポジション" value={profile.position || '—'} />
          <InfoRow label="背番号" value={profile.number || '—'} />
          {profile.age !== null && (
            <InfoRow label="年齢" value={`${profile.age}歳`} />
          )}
        </div>
      </div>

      {/* データ蓄積 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          データ蓄積
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
                style={{ width: `${Math.min(100, (profile.validDataDays / 28) * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground">
            {profile.validDataDays}日
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {profile.validDataDays >= 28
            ? '全推論エンジンがアンロック済みです。'
            : profile.validDataDays >= 14
              ? `Z-Scoreエンジン稼働中。あと${28 - profile.validDataDays}日で全機能解放。`
              : `パーソナライズ学習中。あと${14 - profile.validDataDays}日で学習フェーズに移行。`}
        </p>
      </div>

      {/* アクション */}
      <div className="space-y-3 pt-2">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {signingOut ? 'ログアウト中...' : 'ログアウト'}
        </button>
      </div>

      <p className="pb-4 text-center text-[10px] text-muted-foreground">
        PACE Platform v6.0
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
