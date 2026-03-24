/**
 * GET /api/team/list
 *
 * Returns the list of teams accessible to the authenticated user.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: '認証が必要です。' },
      { status: 401 },
    );
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true });

  if (teamsError) {
    console.error('[team/list] チーム一覧取得エラー:', teamsError);
    return NextResponse.json(
      { error: 'チーム一覧の取得に失敗しました。' },
      { status: 500 },
    );
  }

  return NextResponse.json({ teams: teams ?? [] });
}
