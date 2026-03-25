/**
 * PACE Platform -- スマート・スキャナー (The Pocket Node 6) ページ
 *
 * カメラ解析UI: ウェアラブル非装着日 or 週1定期チェック用。
 */

import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SmartScanner } from './_components/smart-scanner';

export const metadata: Metadata = {
  title: 'スマートスキャナー',
};

export default async function ScannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: athlete } = await supabase
    .from('athletes')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!athlete) {
    redirect('/login');
  }

  return <SmartScanner athleteId={athlete.id as string} />;
}
