/**
 * PACE Platform — チームコード管理 API（master 限定）
 *
 * GET  /api/admin/team-codes      — チームコード一覧
 * POST /api/admin/team-codes      — チームコード新規生成
 *
 * 設計書参照: architecture-v1.3-auth-admin.md セクション 3.1
 * DB スキーマ: db-migration-v1.3-auth-admin.sql セクション 4（team_invite_codes）
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
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
// チームコード生成: 8文字英数字ランダム
// ---------------------------------------------------------------------------

function generateTeamCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外 (I,O,0,1)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

// ---------------------------------------------------------------------------
// GET /api/admin/team-codes — チームコード一覧
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  // レート制限
  const rl = await rateLimit(staff.id, 'admin/team-codes:GET', { maxRequests: 60, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { data: codes, error } = await supabase
    .from('team_invite_codes')
    .select('id, code, org_id, team_id, expires_at, max_uses, current_uses, is_active, created_at')
    .eq('org_id', staff.org_id)
    .order('created_at', { ascending: false });

  if (error) {
    ctx.log.error('チームコード一覧取得エラー', { detail: error });
    throw new ApiError(500, 'チームコード一覧の取得に失敗しました。');
  }

  return NextResponse.json({ success: true, data: codes ?? [] });
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// POST /api/admin/team-codes — チームコード新規生成
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ('error' in result) {
    throw new ApiError(result.status ?? 500, result.error);
  }
  const { staff } = result;

  // レート制限（コード生成は厳しめ: 10回/分）
  const rl = await rateLimit(staff.id, 'admin/team-codes:POST', { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // リクエストボディ解析
  let body: { expires_in_days?: number; max_uses?: number; team_id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // バリデーション
  const expiresInDays = body.expires_in_days ?? 7;
  if (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 365) {
    throw new ApiError(400, '有効期限は1〜365日の範囲で指定してください。');
  }

  if (body.max_uses !== undefined && body.max_uses !== null) {
    if (typeof body.max_uses !== 'number' || body.max_uses < 1) {
      throw new ApiError(400, '使用回数上限は1以上を指定してください。');
    }
  }

  // チームコード生成（衝突回避のためリトライ）
  let code: string = '';
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    code = generateTeamCode();
    const { data: existing } = await supabase
      .from('team_invite_codes')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (!existing) break;
    retries++;
  }

  if (retries >= maxRetries) {
    ctx.log.error('チームコード生成で衝突が多発', { retries: maxRetries });
    throw new ApiError(500, 'チームコードの生成に失敗しました。再度お試しください。');
  }

  // 有効期限計算
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // INSERT
  const insertData: Record<string, unknown> = {
    code,
    org_id: staff.org_id,
    created_by: staff.id,
    expires_at: expiresAt.toISOString(),
    max_uses: body.max_uses ?? null,
    is_active: true,
    current_uses: 0,
  };

  if (body.team_id) {
    insertData.team_id = body.team_id;
  }

  const { data: newCode, error: insertError } = await supabase
    .from('team_invite_codes')
    .insert(insertData)
    .select('id, code, org_id, team_id, expires_at, max_uses, current_uses, is_active, created_at')
    .single();

  if (insertError) {
    ctx.log.error('チームコード作成エラー', { detail: insertError });
    throw new ApiError(500, 'チームコードの作成に失敗しました。');
  }

  return NextResponse.json(
    { success: true, data: newCode },
    { status: 201 },
  );
}, { service: 'admin' });
