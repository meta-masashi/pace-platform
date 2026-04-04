/**
 * PACE Platform — チームコード個別操作 API（master 限定）
 *
 * PATCH  /api/admin/team-codes/[codeId]  — コード更新（無効化等）
 * DELETE /api/admin/team-codes/[codeId]  — コード論理削除（is_active = false）
 *
 * 設計書参照: architecture-v1.3-auth-admin.md セクション 3.1
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import { validateUUID } from '@/lib/security/input-validator';
import { rateLimit, rateLimitResponse } from '@/lib/security/rate-limit';

// ---------------------------------------------------------------------------
// 共通: master 権限チェック
// ---------------------------------------------------------------------------

async function requireMaster(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: '認証が必要です。ログインしてください。', status: 401 } as const;
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    return { error: 'スタッフプロファイルが見つかりません。', status: 403 } as const;
  }

  if (staff.role !== 'master') {
    return { error: 'この操作には master 権限が必要です。', status: 403 } as const;
  }

  return { user, staff } as const;
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/team-codes/[codeId] — コード更新（無効化等）
// ---------------------------------------------------------------------------

export const PATCH = withApiHandler(async (req, ctx) => {
  const codeId = ctx.params.codeId;

  if (!codeId || !validateUUID(codeId)) {
    throw new ApiError(400, '有効なコード ID を指定してください。');
  }

  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  // レート制限
  const rl = await rateLimit(staff.id, 'admin/team-codes:PATCH', { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // リクエストボディ
  let body: { is_active?: boolean; max_uses?: number | null; expires_at?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディの JSON パースに失敗しました。');
  }

  // 更新フィールド構築
  const updateFields: Record<string, unknown> = {};

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new ApiError(400, 'is_active は boolean で指定してください。');
    }
    updateFields.is_active = body.is_active;
  }

  if (body.max_uses !== undefined) {
    if (body.max_uses !== null && (typeof body.max_uses !== 'number' || body.max_uses < 1)) {
      throw new ApiError(400, 'max_uses は null（無制限）または1以上の数値で指定してください。');
    }
    updateFields.max_uses = body.max_uses;
  }

  if (body.expires_at !== undefined) {
    const d = new Date(body.expires_at);
    if (isNaN(d.getTime())) {
      throw new ApiError(400, '有効な日時を指定してください。');
    }
    updateFields.expires_at = d.toISOString();
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, '更新するフィールドが指定されていません。');
  }

  const { data: updated, error: updateError } = await supabase
    .from('team_invite_codes')
    .update(updateFields)
    .eq('id', codeId)
    .eq('org_id', staff.org_id)
    .select('id, code, org_id, team_id, expires_at, max_uses, current_uses, is_active, created_at')
    .single();

  if (updateError) {
    ctx.log.error('チームコード更新エラー', { detail: updateError });
    throw new ApiError(500, 'チームコードの更新に失敗しました。');
  }

  if (!updated) {
    throw new ApiError(404, '指定されたチームコードが見つかりません。');
  }

  return NextResponse.json({ success: true, data: updated });
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// DELETE /api/admin/team-codes/[codeId] — コード論理削除（is_active = false）
// ---------------------------------------------------------------------------

export const DELETE = withApiHandler(async (_req, ctx) => {
  const codeId = ctx.params.codeId;

  if (!codeId || !validateUUID(codeId)) {
    throw new ApiError(400, '有効なコード ID を指定してください。');
  }

  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  // レート制限
  const rl = await rateLimit(staff.id, 'admin/team-codes:DELETE', { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // 論理削除（is_active = false）
  const { data: deleted, error: deleteError } = await supabase
    .from('team_invite_codes')
    .update({ is_active: false })
    .eq('id', codeId)
    .eq('org_id', staff.org_id)
    .select('id, code, is_active')
    .single();

  if (deleteError) {
    ctx.log.error('チームコード削除エラー', { detail: deleteError });
    throw new ApiError(500, 'チームコードの削除に失敗しました。');
  }

  if (!deleted) {
    throw new ApiError(404, '指定されたチームコードが見つかりません。');
  }

  return NextResponse.json({ success: true, data: deleted });
}, { service: 'admin' });
