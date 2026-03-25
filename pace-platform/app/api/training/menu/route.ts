/**
 * Training Menu API
 *
 * GET   /api/training/menu  — チームの現在のメニューを取得
 * PATCH /api/training/menu  — メニューを承認/編集
 * POST  /api/training/menu  — メニューを選手に配信
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const result = await getAuthenticatedStaff(supabase);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 401 });
    }
    const { staff } = result;

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const weekStart = searchParams.get('weekStart');

    if (!teamId) {
      return NextResponse.json(
        { error: 'teamId は必須です。' },
        { status: 400 },
      );
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
      console.error('[training/menu:GET] クエリエラー:', queryError);
      return NextResponse.json(
        { error: 'メニューの取得に失敗しました。' },
        { status: 500 },
      );
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
  } catch (err) {
    console.error('[training/menu:GET] 予期しないエラー:', err);
    return NextResponse.json(
      { error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/training/menu — 承認/編集
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const result = await getAuthenticatedStaff(supabase);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 401 });
    }
    const { staff } = result;

    let body: {
      menuId: string;
      action: 'approve' | 'edit';
      menu_json?: Record<string, unknown>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.menuId) {
      return NextResponse.json(
        { error: 'menuId は必須です。' },
        { status: 400 },
      );
    }

    // メニュー存在チェック
    const { data: existing, error: fetchError } = await supabase
      .from('workouts')
      .select('id, org_id, approved_at')
      .eq('id', body.menuId)
      .eq('org_id', staff.org_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'メニューが見つかりません。' },
        { status: 404 },
      );
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
      console.error('[training/menu:PATCH] 更新エラー:', updateError);
      return NextResponse.json(
        { error: 'メニューの更新に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[training/menu:PATCH] 予期しないエラー:', err);
    return NextResponse.json(
      { error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/training/menu — 選手に配信
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const result = await getAuthenticatedStaff(supabase);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 401 });
    }
    const { staff } = result;

    let body: { menuId: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.menuId) {
      return NextResponse.json(
        { error: 'menuId は必須です。' },
        { status: 400 },
      );
    }

    // メニュー存在チェック + 承認済みか確認
    const { data: existing, error: fetchError } = await supabase
      .from('workouts')
      .select('id, org_id, team_id, approved_at, distributed_at')
      .eq('id', body.menuId)
      .eq('org_id', staff.org_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'メニューが見つかりません。' },
        { status: 404 },
      );
    }

    if (!existing.approved_at) {
      return NextResponse.json(
        { error: '配信する前にメニューを承認してください。' },
        { status: 400 },
      );
    }

    if (existing.distributed_at) {
      return NextResponse.json(
        { error: 'このメニューは既に配信済みです。' },
        { status: 400 },
      );
    }

    // distributed_at を設定
    const { error: updateError } = await supabase
      .from('workouts')
      .update({ distributed_at: new Date().toISOString() })
      .eq('id', body.menuId);

    if (updateError) {
      console.error('[training/menu:POST] 配信エラー:', updateError);
      return NextResponse.json(
        { error: '配信の処理に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[training/menu:POST] 予期しないエラー:', err);
    return NextResponse.json(
      { error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}
