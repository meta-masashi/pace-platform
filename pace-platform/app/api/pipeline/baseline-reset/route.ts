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

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // ----- スタッフ確認（コーチ以上）-----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // ----- リクエストボディ -----
    let body: { athleteId: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.athleteId || !validateUUID(body.athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId は有効なUUIDである必要があります。' },
        { status: 400 },
      );
    }

    // ----- アスリートの同一組織確認 -----
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id, name')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        { success: false, error: '指定されたアスリートが見つからないか、アクセス権がありません。' },
        { status: 404 },
      );
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
      console.error('[baseline-reset] upsert エラー:', upsertError);
      return NextResponse.json(
        { success: false, error: 'ベースラインリセットの保存に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        athleteId: body.athleteId,
        athleteName: (athlete.name as string) ?? '',
        resetAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[baseline-reset] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}
