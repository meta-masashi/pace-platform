/**
 * PACE v6.0 — ベースライン・リセット API
 *
 * POST /api/pipeline/baseline-reset
 *
 * コーチがシーズン開始やリハビリ復帰時に選手のデータ蓄積日数をリセットする。
 * baseline_reset_at を現在時刻にセットし、Node 1 の成熟モードが
 * コールドスタート（safety モード）に戻る。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { withApiHandler, ApiError } from '@/lib/api/handler';

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // ----- スタッフ確認（コーチ以上）-----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- リクエストボディ -----
  let body: { athleteId: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのJSONパースに失敗しました。');
  }

  if (!body.athleteId || !validateUUID(body.athleteId)) {
    throw new ApiError(400, 'athleteId は有効なUUIDである必要があります。');
  }

  // ----- アスリートの同一組織確認 -----
  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select('id, name')
    .eq('id', body.athleteId)
    .eq('org_id', staff.org_id)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(404, '指定されたアスリートが見つからないか、アクセス権がありません。');
  }

  // ----- baseline_reset_at を更新 -----
  const { error: upsertError } = await supabase
    .from('athlete_condition_cache')
    .upsert(
      {
        athlete_id: body.athleteId,
        baseline_reset_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id' },
    );

  if (upsertError) {
    ctx.log.error('upsert エラー', { detail: upsertError });
    throw new ApiError(500, 'ベースラインリセットの保存に失敗しました。');
  }

  return NextResponse.json({
    success: true,
    data: {
      athleteId: body.athleteId,
      athleteName: (athlete.name as string) ?? '',
      resetAt: new Date().toISOString(),
    },
  });
}, { service: 'pipeline' });
