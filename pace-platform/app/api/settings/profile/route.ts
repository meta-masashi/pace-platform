import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// GET /api/settings/profile — 現在のユーザープロフィールを取得
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証されていません');
  }

  // staff テーブルからプロフィール情報を取得
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, org_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(404, 'スタッフ情報が見つかりません');
  }

  // 組織（チーム）名を取得
  let teamName = '';
  if (staff.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', staff.org_id)
      .single();
    teamName = org?.name ?? '';
  }

  return NextResponse.json({
    id: staff.id,
    name: staff.name,
    email: user.email,
    role: staff.role,
    teamName,
  });
}, { service: 'settings' });

// ---------------------------------------------------------------------------
// PATCH /api/settings/profile — プロフィール更新（名前のみ）
// ---------------------------------------------------------------------------

export const PATCH = withApiHandler(async (request, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証されていません');
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ApiError(400, '名前は必須です');
  }

  if (name.trim().length > 100) {
    throw new ApiError(400, '名前は100文字以内で入力してください');
  }

  const { error: updateError } = await supabase
    .from('staff')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updateError) {
    throw new ApiError(500, 'プロフィールの更新に失敗しました');
  }

  return NextResponse.json({ success: true, name: name.trim() });
}, { service: 'settings' });
