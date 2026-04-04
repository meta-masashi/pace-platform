/**
 * GET /api/team/list
 *
 * Returns the list of teams accessible to the authenticated user.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

export const GET = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
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
    ctx.log.error('チーム一覧取得エラー', { detail: teamsError });
    throw new ApiError(500, 'チーム一覧の取得に失敗しました。');
  }

  return NextResponse.json({ teams: teams ?? [] });
}, { service: 'team' });
