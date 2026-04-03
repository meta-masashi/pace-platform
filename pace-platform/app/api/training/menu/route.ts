/**
 * Training Menu API
 *
 * GET   /api/training/menu  — チームの現在のメニューを取得
 * PATCH /api/training/menu  — メニューを承認/編集
 * POST  /api/training/menu  — メニューを選手に配信
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// 共通: 認証 + スタッフ取得
// ---------------------------------------------------------------------------

async function getAuthenticatedStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: '認証が必要です。', status: 401 as number } as const;
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, role, team_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    return { error: 'スタッフプロファイルが見つかりません。', status: 403 as number } as const;
  }

  return { user, staff } as const;
}

// ---------------------------------------------------------------------------
// GET /api/training/menu?teamId=xxx&weekStart=yyyy-mm-dd
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await getAuthenticatedStaff(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get('teamId');
  const weekStart = searchParams.get('weekStart');

  if (!teamId) {
    throw new ApiError(400, 'teamId は必須です。');
  }

  // 最新のメニューを取得（weekStart フィルタがあれば適用）
  let query = supabase
    .from('workouts')
    .select('id, team_id, org_id, menu_json, generated_at, approved_at, distributed_at, approved_by_staff_id')
    .eq('team_id', teamId)
    .eq('org_id', staff.org_id)
    .not('team_id', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(1);

  if (weekStart) {
    // menu_json 内の week_start_date でフィルタ
    query = query.contains('menu_json', { week_start_date: weekStart });
  }

  const { data: workouts, error: queryError } = await query;

  if (queryError) {
    ctx.log.error('クエリエラー', { detail: queryError });
    throw new ApiError(500, 'メニューの取得に失敗しました。');
  }

  if (!workouts || workouts.length === 0) {
    return NextResponse.json({ menu: null });
  }

  const workout = workouts[0]!;
  const menuJson = (workout.menu_json ?? {}) as Record<string, unknown>;

  // ステータスを判定
  let status: 'draft' | 'approved' | 'distributed' = 'draft';
  if (workout.distributed_at) {
    status = 'distributed';
  } else if (workout.approved_at) {
    status = 'approved';
  }

  return NextResponse.json({
    menu: {
      id: workout.id,
      team_id: workout.team_id,
      week_start_date: menuJson.week_start_date ?? '',
      status,
      team_sessions: menuJson.team_sessions ?? [],
      individual_adjustments: menuJson.individual_adjustments ?? [],
      locked_athletes_notice: menuJson.locked_athletes_notice ?? [],
      weekly_load_note: menuJson.weekly_load_note ?? '',
      generated_at: workout.generated_at,
      approved_at: workout.approved_at,
      distributed_at: workout.distributed_at,
    },
  });
}, { service: 'training' });

// ---------------------------------------------------------------------------
// PATCH /api/training/menu — 承認/編集
// ---------------------------------------------------------------------------

export const PATCH = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await getAuthenticatedStaff(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  let body: {
    menuId: string;
    action: 'approve' | 'edit';
    menu_json?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのパースに失敗しました。');
  }

  if (!body.menuId) {
    throw new ApiError(400, 'menuId は必須です。');
  }

  // メニュー存在チェック
  const { data: existing, error: fetchError } = await supabase
    .from('workouts')
    .select('id, org_id, approved_at')
    .eq('id', body.menuId)
    .eq('org_id', staff.org_id)
    .single();

  if (fetchError || !existing) {
    throw new ApiError(404, 'メニューが見つかりません。');
  }

  const updateFields: Record<string, unknown> = {};

  if (body.action === 'approve') {
    updateFields.approved_at = new Date().toISOString();
    updateFields.approved_by_staff_id = staff.id;
  }

  if (body.action === 'edit' && body.menu_json) {
    updateFields.menu_json = body.menu_json;
  }

  const { data: updated, error: updateError } = await supabase
    .from('workouts')
    .update(updateFields)
    .eq('id', body.menuId)
    .select('id, approved_at, menu_json')
    .single();

  if (updateError) {
    ctx.log.error('更新エラー', { detail: updateError });
    throw new ApiError(500, 'メニューの更新に失敗しました。');
  }

  return NextResponse.json({ success: true, data: updated });
}, { service: 'training' });

// ---------------------------------------------------------------------------
// POST /api/training/menu — 選手に配信
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await getAuthenticatedStaff(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  let body: { menuId: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのパースに失敗しました。');
  }

  if (!body.menuId) {
    throw new ApiError(400, 'menuId は必須です。');
  }

  // メニュー存在チェック + 承認済みか確認
  const { data: existing, error: fetchError } = await supabase
    .from('workouts')
    .select('id, org_id, team_id, approved_at, distributed_at')
    .eq('id', body.menuId)
    .eq('org_id', staff.org_id)
    .single();

  if (fetchError || !existing) {
    throw new ApiError(404, 'メニューが見つかりません。');
  }

  if (!existing.approved_at) {
    throw new ApiError(400, '配信する前にメニューを承認してください。');
  }

  if (existing.distributed_at) {
    throw new ApiError(400, 'このメニューは既に配信済みです。');
  }

  // distributed_at を設定
  const { error: updateError } = await supabase
    .from('workouts')
    .update({ distributed_at: new Date().toISOString() })
    .eq('id', body.menuId);

  if (updateError) {
    ctx.log.error('配信エラー', { detail: updateError });
    throw new ApiError(500, '配信の処理に失敗しました。');
  }

  return NextResponse.json({ success: true });
}, { service: 'training' });
