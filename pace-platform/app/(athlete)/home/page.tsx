'use client';

/**
 * PACE Platform -- アスリートホーム画面
 *
 * 認証チェックは middleware に委譲。
 * Client Component でアスリートIDを取得してコンテンツを表示。
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AthleteHomeContent } from './_components/athlete-home-content';

export default function AthleteHomePage() {
  const [athleteId, setAthleteId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: athlete } = await supabase
          .from('athletes')
          .select('id, name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (athlete) {
          setAthleteId(athlete.id as string);
          setDisplayName((athlete.name as string) ?? '');
        }
      } catch (err) { void err; // silently handled
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20">
        <div className="h-[240px] w-[240px] animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!athleteId) {
    return (
      <div className="pt-12 text-center text-sm text-muted-foreground">
        アスリートデータが見つかりません。
      </div>
    );
  }

  return <AthleteHomeContent athleteId={athleteId} displayName={displayName} />;
}
