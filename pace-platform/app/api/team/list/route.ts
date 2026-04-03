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

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .order('name', { ascending: true });

  if (teamsError) {
    ctx.log.error('チーム一覧取得エラー', { detail: teamsError });
    throw new ApiError(500, 'チーム一覧の取得に失敗しました。');
  }

  return NextResponse.json({ teams: teams ?? [] });
}, { service: 'team' });
