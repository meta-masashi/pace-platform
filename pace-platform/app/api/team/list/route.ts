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

  // ----- スタッフ権限チェック -----
  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!staff) {
    return NextResponse.json(
      { success: false, error: '権限がありません' },
      { status: 403 },
    );
  }

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .eq('org_id', staff.org_id)
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
