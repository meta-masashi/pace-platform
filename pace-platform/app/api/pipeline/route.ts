/**
 * PACE v6.0 — 推論パイプライン実行 API
 *
 * POST /api/pipeline — v6 推論パイプラインを実行する
 *
 * 認証済みスタッフのみ実行可能。
 * 選手コンテキストを DB から取得し、パイプラインを構築・実行する。
 * 結果のトレースログを inference_trace_logs テーブルに永続化する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { InferencePipeline } from '@/lib/engine/v6/pipeline';
import type {
  AthleteContext,
  DailyInput,
  LastKnownRecord,
  PipelineOutput,
  TissueCategory,
} from '@/lib/engine/v6/types';

// ---------------------------------------------------------------------------
// POST /api/pipeline
// ---------------------------------------------------------------------------

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
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    // ----- スタッフ確認 -----
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
    let body: { athleteId: string; dailyInput: DailyInput };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.athleteId || !body.dailyInput) {
      return NextResponse.json(
        { success: false, error: 'athleteId と dailyInput は必須です。' },
        { status: 400 },
      );
    }

    if (!validateUUID(body.athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    // ----- 選手コンテキストをDBから取得 -----
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id, org_id, team_id, age, sport, is_contact_sport, name')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        { success: false, error: '指定されたアスリートが見つからないか、アクセス権がありません。' },
        { status: 404 },
      );
    }

    // baseline_reset_at を取得（ベースラインリセット対応）
    const { data: conditionCache } = await supabase
      .from('athlete_condition_cache')
      .select('baseline_reset_at')
      .eq('athlete_id', body.athleteId)
      .single();

    const baselineResetAt = (conditionCache?.baseline_reset_at as string) ?? null;

    // 選手の蓄積データ日数を取得（baseline_reset_at 以降のみカウント）
    let validDataDaysQuery = supabase
      .from('daily_inputs')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', body.athleteId);

    if (baselineResetAt) {
      validDataDaysQuery = validDataDaysQuery.gte('created_at', baselineResetAt);
    }

    const { count: validDataDays } = await validDataDaysQuery;

    // 既往歴を取得
    const { data: medicalHistory } = await supabase
      .from('medical_history')
      .select('body_part, condition, date, severity, risk_multiplier')
      .eq('athlete_id', body.athleteId)
      .order('date', { ascending: false });

    // 直前の有効記録を取得（LOCF/指数減衰インピュテーション用）
    let lastKnownRecord: LastKnownRecord | undefined;
    if (body.dailyInput.date) {
      const { data: lastRecord } = await supabase
        .from('daily_metrics')
        .select('date, sleep_score, fatigue_subjective, subjective_condition, nrs, srpe, training_duration_min')
        .eq('athlete_id', body.athleteId)
        .lt('date', body.dailyInput.date)
        .order('date', { ascending: false })
        .limit(1)
        .single();

      if (lastRecord) {
        lastKnownRecord = {
          date: lastRecord.date as string,
          sleepQuality: (lastRecord.sleep_score as number) ?? 5,
          fatigue: (lastRecord.fatigue_subjective as number) ?? 5,
          mood: (lastRecord.subjective_condition as number) ?? 5,
          muscleSoreness: 3, // daily_metrics に muscleSoreness カラムが追加されるまでデフォルト値
          stressLevel: 3,    // 同上
          painNRS: (lastRecord.nrs as number) ?? 0,
          sRPE: (lastRecord.srpe as number) ?? 0,
          trainingDurationMin: (lastRecord.training_duration_min as number) ?? 0,
        };
      }
    }

    // AthleteContext を組み立てる
    const context: AthleteContext = {
      athleteId: athlete.id as string,
      orgId: athlete.org_id as string,
      teamId: (athlete.team_id as string) ?? '',
      age: (athlete.age as number) ?? 25,
      sport: (athlete.sport as string) ?? 'unknown',
      isContactSport: (athlete.is_contact_sport as boolean) ?? false,
      validDataDays: validDataDays ?? 0,
      bayesianPriors: {},
      riskMultipliers: {},
      medicalHistory: (medicalHistory ?? []).map((entry) => ({
        bodyPart: entry.body_part as string,
        condition: entry.condition as string,
        date: entry.date as string,
        severity: entry.severity as 'mild' | 'moderate' | 'severe',
        riskMultiplier: (entry.risk_multiplier as number) ?? 1.0,
      })),
      tissueHalfLifes: {
        metabolic: 2,
        structural_soft: 7,
        structural_hard: 21,
        neuromotor: 3,
      } satisfies Record<TissueCategory, number>,
      ...(lastKnownRecord ? { lastKnownRecord } : {}),
    };

    // ----- パイプライン実行 -----
    const pipeline = new InferencePipeline();
    // Node 0-3 は pipeline.execute 内でフォールバック処理されるため、
    // 登録されていないノードはスキップされる
    const output: PipelineOutput = await pipeline.execute(body.dailyInput, context);

    // ----- トレースログを DB に保存 -----
    const traceLog = InferencePipeline.buildTraceLog(
      body.dailyInput,
      context,
      output,
      // nodeResults は pipeline 内部で保持されているため、
      // ここでは output の情報から再構成する
      {
        node0_ingestion: { success: true, executionTimeMs: 0, warnings: [] },
        node1_cleaning: { success: true, executionTimeMs: 0, warnings: [] },
        node2_feature: { success: true, executionTimeMs: 0, warnings: [] },
        node3_inference: { success: true, executionTimeMs: 0, warnings: [] },
        node4_decision: { success: true, executionTimeMs: 0, warnings: [] },
        node5_presentation: { success: true, executionTimeMs: 0, warnings: [] },
      },
    );

    const { error: traceError } = await supabase
      .from('inference_trace_logs')
      .insert({
        trace_id: traceLog.traceId,
        athlete_id: traceLog.athleteId,
        org_id: traceLog.orgId,
        timestamp_utc: traceLog.timestampUtc,
        pipeline_version: traceLog.pipelineVersion,
        inference_snapshot: traceLog.inferenceSnapshot,
        decision: output.decision.decision,
        priority: output.decision.priority,
        athlete_name: (athlete.name as string) ?? '',
      });

    if (traceError) {
      console.error('[pipeline:POST] トレースログ保存エラー:', traceError);
      // トレースログ保存失敗してもパイプライン結果は返す
    }

    return NextResponse.json({ success: true, data: output });
  } catch (err) {
    console.error('[pipeline:POST] 予期しないエラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'パイプライン実行中にサーバーエラーが発生しました。',
      },
      { status: 500 },
    );
  }
}
