'use client';

/**
 * PACE Platform -- 日次チェックインページ
 *
 * 認証チェックは middleware に委譲。
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SimpleCheckin } from './_components/simple-checkin';

export default function CheckinPage() {
  const [athleteId, setAthleteId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: athlete } = await supabase
          .from('athletes')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (athlete) {
          setAthleteId(athlete.id as string);
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
      <div className="flex items-center justify-center pt-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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

  return <SimpleCheckin athleteId={athleteId} />;
}
