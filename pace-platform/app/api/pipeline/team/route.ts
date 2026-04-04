/**
 * PACE v6.0 — チーム別パイプライン結果取得 API
 *
 * GET /api/pipeline/team?teamId=xxx — チーム全選手の最新パイプライン結果を取得する
 *
 * 認証済みスタッフ（同一組織）のみ取得可能。
 * 各選手の最新トレースログを返す。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// GET /api/pipeline/team
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- スタッフ確認 -----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- クエリパラメータ -----
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get('teamId');

  if (!teamId) {
    throw new ApiError(400, 'teamId は必須です。');
  }

  if (!validateUUID(teamId)) {
    throw new ApiError(400, 'teamId の形式が不正です。');
  }

  // ----- チームの選手一覧を取得 -----
  const { data: athletes, error: athletesError } = await supabase
    .from('athletes')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('org_id', staff.org_id)
    .order('name');

  if (athletesError) {
    ctx.log.error('選手取得エラー', { detail: athletesError });
    throw new ApiError(500, '選手一覧の取得に失敗しました。');
  }

  if (!athletes || athletes.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
    });
  }

  const athleteIds = athletes.map((a) => a.id as string);

  // ----- 各選手の最新トレースログを取得 -----
  // RPC or distinct on で最新のものだけ取得
  // Supabase では distinct on が使えないため、全件取得後にクライアント側でフィルタ
  const { data: traces, error: tracesError } = await supabase
    .from('inference_trace_logs')
    .select('id, athlete_id, org_id, timestamp_utc, risk_level, decision, priority, athlete_name, acknowledged')
    .in('athlete_id', athleteIds)
    .eq('org_id', staff.org_id)
    .order('timestamp_utc', { ascending: false })
    .limit(500);

  if (tracesError) {
    ctx.log.error('トレース取得エラー', { detail: tracesError });
    throw new ApiError(500, 'トレースログの取得に失敗しました。');
  }

  // 各選手の最新トレースのみを抽出
  const latestByAthlete = new Map<string, Record<string, unknown>>();
  for (const trace of traces ?? []) {
    const athleteId = trace.athlete_id as string;
    if (!latestByAthlete.has(athleteId)) {
      latestByAthlete.set(athleteId, trace);
    }
  }

  // 選手名をマッピング
  const athleteNameMap = new Map<string, string>();
  for (const a of athletes) {
    athleteNameMap.set(a.id as string, (a.name as string) ?? '');
  }

  // 結果を組み立て
  const results = athletes.map((a) => {
    const trace = latestByAthlete.get(a.id as string);
    return {
      athleteId: a.id as string,
      athleteName: (a.name as string) ?? '',
      latestTrace: trace ?? null,
    };
  });

  // P1 > P2 > P3 > P4 > P5 の順でソート（重要度順）
  const priorityOrder: Record<string, number> = {
    P1_SAFETY: 0,
    P2_MECHANICAL_RISK: 1,
    P3_DECOUPLING: 2,
    P4_GAS_EXHAUSTION: 3,
    P5_NORMAL: 4,
  };

  results.sort((a, b) => {
    const aPriority = a.latestTrace
      ? (priorityOrder[(a.latestTrace as Record<string, unknown>).priority as string] ?? 5)
      : 5;
    const bPriority = b.latestTrace
      ? (priorityOrder[(b.latestTrace as Record<string, unknown>).priority as string] ?? 5)
      : 5;
    return aPriority - bPriority;
  });

  return NextResponse.json({ success: true, data: results });
}, { service: 'pipeline' });
