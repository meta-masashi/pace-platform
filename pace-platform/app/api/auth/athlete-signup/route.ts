/**
 * PACE Platform — 選手セルフサインアップ API
 *
 * POST /api/auth/athlete-signup
 *
 * チームコード検証 → athletes テーブルにレコード作成 → org_id 紐付け
 *
 * 設計書参照:
 * - architecture-v1.3-auth-admin.md セクション 3.2
 * - MASTER-SPEC.md セクション 4-2「選手セルフサインアップフロー」
 *
 * セキュリティ:
 * - 認証済みユーザーのみ（athlete 未登録であること）
 * - チームコード検証（有効期限・使用回数・is_active チェック）
 * - current_uses のインクリメント（冪等性考慮）
 * - レートリミット: 1分あたり5回
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import { rateLimit, rateLimitResponse } from '@/lib/security/rate-limit';

// ---------------------------------------------------------------------------
// POST /api/auth/athlete-signup
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // レート制限（コード検証は厳しめ: 5回/分）
  const rl = await rateLimit(user.id, 'auth/athlete-signup:POST', { maxRequests: 5, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // 既に athlete として登録されていないか確認
  const { data: existingAthlete } = await supabase
    .from('athletes')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingAthlete) {
    throw new ApiError(409, '既に選手として登録されています。');
  }

  // リクエストボディ解析
  let body: { team_code: string; name?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディの JSON パースに失敗しました。');
  }

  if (!body.team_code || typeof body.team_code !== 'string') {
    throw new ApiError(400, 'チームコードは必須です。');
  }

  const teamCode = body.team_code.trim().toUpperCase();

  if (teamCode.length === 0 || teamCode.length > 20) {
    throw new ApiError(400, '有効なチームコードを入力してください。');
  }

  // チームコード検証
  const { data: codeRecord, error: codeError } = await supabase
    .from('team_invite_codes')
    .select('id, org_id, team_id, expires_at, max_uses, current_uses, is_active')
    .eq('code', teamCode)
    .maybeSingle();

  // セキュリティ: 全てのコード検証失敗に同一のエラーメッセージを返す（列挙攻撃防止）
  const INVALID_CODE_MSG = 'チームコードが無効です。正しいコードを入力するか、チーム管理者にお問い合わせください。';

  if (codeError) {
    ctx.log.error('チームコード検索エラー', { detail: codeError });
    throw new ApiError(400, INVALID_CODE_MSG);
  }

  if (!codeRecord) {
    throw new ApiError(400, INVALID_CODE_MSG);
  }

  // 有効性チェック（全て同一エラーメッセージで返す）
  if (!codeRecord.is_active) {
    throw new ApiError(400, INVALID_CODE_MSG);
  }

  const now = new Date();
  const expiresAt = new Date(codeRecord.expires_at);
  if (expiresAt <= now) {
    throw new ApiError(400, INVALID_CODE_MSG);
  }

  if (codeRecord.max_uses !== null && codeRecord.current_uses >= codeRecord.max_uses) {
    throw new ApiError(400, INVALID_CODE_MSG);
  }

  // レースコンディション対策: current_uses を先にインクリメント（楽観的ロック）
  // 失敗 = 別リクエストが先にインクリメント済み → 使用回数超過の可能性 → 中止
  const { data: incrementResult, error: incrementError } = await supabase
    .from('team_invite_codes')
    .update({ current_uses: codeRecord.current_uses + 1 })
    .eq('id', codeRecord.id)
    .eq('current_uses', codeRecord.current_uses) // 楽観的ロック: 値が変わっていたら0行更新
    .select('current_uses')
    .maybeSingle();

  if (incrementError || !incrementResult) {
    // 楽観的ロック失敗 = 並行リクエストと競合
    ctx.log.warn('チームコード使用回数の楽観的ロック失敗（並行リクエスト競合）', {
      codeId: codeRecord.id,
      expectedUses: codeRecord.current_uses,
    });
    throw new ApiError(409, 'チームコードの処理が競合しました。もう一度お試しください。');
  }

  // athlete レコード作成
  const athleteName = body.name?.trim() || user.email?.split('@')[0] || 'Unknown';

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    org_id: codeRecord.org_id,
    name: athleteName,
    email: user.email,
    is_active: true,
  };

  // チームが指定されている場合
  if (codeRecord.team_id) {
    insertData.team_id = codeRecord.team_id;
  }

  const { data: newAthlete, error: insertError } = await supabase
    .from('athletes')
    .insert(insertData)
    .select('id, user_id, org_id, team_id, name, email')
    .single();

  if (insertError) {
    // 重複チェック（並行リクエスト対応）
    if (insertError.code === '23505') {
      throw new ApiError(409, '既に選手として登録されています。');
    }
    // athlete作成失敗 → current_uses をロールバック
    await supabase
      .from('team_invite_codes')
      .update({ current_uses: codeRecord.current_uses })
      .eq('id', codeRecord.id);
    ctx.log.error('athlete レコード作成エラー', { detail: insertError });
    throw new ApiError(500, '選手登録に失敗しました。');
  }

  // user_metadata 更新（ロール情報にathleteを追加）
  try {
    const existingRoles = (user.user_metadata?.detected_roles as string[]) ?? [];
    if (!existingRoles.includes('athlete')) {
      await supabase.auth.updateUser({
        data: {
          detected_roles: [...existingRoles, 'athlete'],
          login_context: 'athlete',
        },
      });
    }
  } catch (metaError) {
    ctx.log.warn('user_metadata 更新失敗', { detail: metaError });
  }

  ctx.log.info('選手セルフサインアップ完了', {
    athleteId: newAthlete.id,
    orgId: codeRecord.org_id,
    teamCode,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        athlete: newAthlete,
        redirectTo: '/home',
      },
    },
    { status: 201 },
  );
}, { service: 'auth' });
