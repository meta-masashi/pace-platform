'use client';

/**
 * PACE Platform -- スマート・スキャナー (The Pocket Node 6) ページ
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SmartScanner } from './_components/smart-scanner';

export default function ScannerPage() {
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

        if (athlete) setAthleteId(athlete.id as string);
      } catch {
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

  return <SmartScanner athleteId={athleteId} />;
}
