/**
 * POST /api/training/generate
 *
 * チームトレーニングメニューを AI で生成する。
 *
 * Body: { teamId: string, weekStartDate: string, focus?: string }
 *
 * - チームの選手コンディション情報を集約
 * - アクティブなロック・禁忌タグを取得
 * - lib/gemini/team-menu-generator.ts で AI 生成
 * - workouts テーブルにドラフトとして保存
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import { requireAccess } from '@/lib/billing/plan-gates';
import {
  generateTeamMenu,
  type AthleteConditionSummary,
  type TeamMenuInput,
} from '@/lib/gemini/team-menu-generator';

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // スタッフ情報取得
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, role, team_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- プラン別機能ゲート（Pro+ 必須）-----
  try {
    await requireAccess(supabase, staff.org_id, 'feature_ai_weekly_plan');
  } catch (gateErr) {
    throw new ApiError(403, gateErr instanceof Error ? gateErr.message : 'この機能はご利用いただけません。');
  }

  // リクエストボディ
  let body: { teamId: string; weekStartDate: string; focus?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのパースに失敗しました。');
  }

  if (!body.teamId) {
    throw new ApiError(400, 'teamId は必須です。');
  }

  // チーム情報取得
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, name, org_id')
    .eq('id', body.teamId)
    .eq('org_id', staff.org_id)
    .single();

  if (teamError || !team) {
    throw new ApiError(404, 'チームが見つかりません。');
  }

  // 組織情報取得
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', staff.org_id)
    .single();

  // チームの選手一覧取得
  const { data: athletes } = await supabase
    .from('athletes')
    .select('id, name, position, sport')
    .eq('team_id', body.teamId)
    .eq('org_id', staff.org_id);

  if (!athletes || athletes.length === 0) {
    throw new ApiError(400, 'チームに選手が登録されていません。選手管理ページで選手を登録してください。');
  }

  // アクティブなロックを取得
  const athleteIds = athletes.map((a) => a.id);
  const { data: locks } = await supabase
    .from('athlete_locks')
    .select('athlete_id, lock_type, tag')
    .in('athlete_id', athleteIds)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  // コンディションスコアを取得（最新のもの）
  let conditioningScores: Array<{
    athlete_id: string;
    acwr: number | null;
    hrv_baseline_ratio: number | null;
    srpe: number | null;
    risk_level: string | null;
  }> = [];

  try {
    const { data: scores } = await supabase
      .from('conditioning_scores')
      .select('athlete_id, acwr, hrv_baseline_ratio, srpe, risk_level')
      .in('athlete_id', athleteIds)
      .order('recorded_at', { ascending: false });

    if (scores) {
      // 各選手の最新のスコアのみ残す
      const seen = new Set<string>();
      conditioningScores = scores.filter((s) => {
        if (seen.has(s.athlete_id)) return false;
        seen.add(s.athlete_id);
        return true;
      });
    }
  } catch {
    // conditioning_scores テーブルが存在しない場合はスキップ
  }

  // ロックマップを構築
  const lockMap: Record<
    string,
    { hard: boolean; soft: boolean; tags: string[] }
  > = {};
  for (const lock of locks ?? []) {
    if (!lockMap[lock.athlete_id]) {
      lockMap[lock.athlete_id] = { hard: false, soft: false, tags: [] };
    }
    const entry = lockMap[lock.athlete_id];
    if (entry) {
      if (lock.lock_type === 'hard') entry.hard = true;
      if (lock.lock_type === 'soft') entry.soft = true;
      entry.tags.push(lock.tag);
    }
  }

  // コンディションマップを構築
  const conditionMap: Record<string, Record<string, number | string>> = {};
  for (const score of conditioningScores) {
    const entry: Record<string, number | string> = {};
    if (score.acwr != null) entry.acwr = score.acwr;
    if (score.hrv_baseline_ratio != null) entry.hrv_baseline_ratio = score.hrv_baseline_ratio;
    if (score.srpe != null) entry.srpe = score.srpe;
    if (score.risk_level != null) entry.risk_level = score.risk_level;
    conditionMap[score.athlete_id] = entry;
  }

  // AthleteConditionSummary を構築
  const athleteSummaries: AthleteConditionSummary[] = athletes.map((a) => {
    const lock = lockMap[a.id] ?? { hard: false, soft: false, tags: [] };
    const cond = conditionMap[a.id] ?? {};

    let riskLevel: AthleteConditionSummary['risk_level'] = 'none';
    if (cond.risk_level) {
      riskLevel = cond.risk_level as AthleteConditionSummary['risk_level'];
    }
    if (lock.hard) riskLevel = 'critical';
    else if (lock.soft && riskLevel === 'none') riskLevel = 'high';

    const summary: AthleteConditionSummary = {
      athlete_id: a.id,
      name: a.name,
      risk_level: riskLevel,
      hard_lock_active: lock.hard,
      soft_lock_active: lock.soft,
      restriction_tags: lock.tags,
    };

    if (a.position) summary.position = a.position;
    if (typeof cond.acwr === 'number') summary.acwr = cond.acwr;
    if (typeof cond.hrv_baseline_ratio === 'number') summary.hrv_baseline_ratio = cond.hrv_baseline_ratio;
    if (typeof cond.srpe === 'number') summary.srpe_last_session = cond.srpe;

    return summary;
  });

  // weekStartDate のフォールバック
  const weekStartDate =
    body.weekStartDate ?? new Date().toISOString().split('T')[0];

  // AI メニュー生成
  const menuInput: TeamMenuInput = {
    teamId: body.teamId,
    teamName: team.name,
    sport: athletes[0]?.sport ?? 'unknown',
    weekStartDate,
    athletes: athleteSummaries,
    trainingPeriod: 'in_season', // デフォルト
    staffContext: {
      userId: staff.id,
      endpoint: 'team-menu-generator',
    },
  };
  if (body.focus) {
    menuInput.sessionConstraints = body.focus;
  }

  const generatedMenu = await generateTeamMenu(menuInput);

  // 既存のドラフトを削除（同じ週・同じチーム）
  await supabase
    .from('workouts')
    .delete()
    .eq('team_id', body.teamId)
    .eq('org_id', staff.org_id)
    .is('approved_at', null)
    .is('distributed_at', null);

  // workouts テーブルにドラフト保存
  const { data: workout, error: insertError } = await supabase
    .from('workouts')
    .insert({
      team_id: body.teamId,
      org_id: staff.org_id,
      generated_by_ai: true,
      menu_json: {
        ...generatedMenu,
        week_start_date: weekStartDate,
      },
    })
    .select('id, generated_at')
    .single();

  if (insertError || !workout) {
    ctx.log.error('保存エラー', { detail: insertError });
    throw new ApiError(500, 'メニューの保存に失敗しました。');
  }

  return NextResponse.json({
    success: true,
    data: {
      workoutId: workout.id,
      generatedAt: workout.generated_at,
      menu: generatedMenu,
    },
  });
}, { service: 'training' });
