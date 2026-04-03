/**
 * PACE Platform — HL7 FHIR R4 エクスポート API
 *
 * GET /api/fhir/export?athleteId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 選手データを HL7 FHIR R4 Bundle としてエクスポートする。
 * Patient / Observation / Condition / CarePlan リソースを含む。
 *
 * 認可: master ロールのみ
 * Content-Type: application/fhir+json
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import {
  mapAthleteToPatient,
  mapMetricsToObservations,
  mapAssessmentToCondition,
  mapRehabToCarePlan,
  buildFHIRBundle,
} from '@/lib/fhir';
import type {
  AthleteRow,
  DailyMetricRow,
  AssessmentResultRow,
  RehabProgramRow,
} from '@/lib/fhir';

// ---------------------------------------------------------------------------
// エクスポートバージョン
// ---------------------------------------------------------------------------

const EXPORT_VERSION = '1.0';

// ---------------------------------------------------------------------------
// GET /api/fhir/export
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get('athleteId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // ----- バリデーション -----
  if (!athleteId) {
    throw new ApiError(400, 'athleteId パラメータが必要です。');
  }

  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- master 権限チェック -----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (staffError || !staff || staff.role !== 'master') {
    throw new ApiError(403, 'FHIR エクスポートは master 権限が必要です。');
  }

  // ----- 選手情報取得 -----
  const { data: athleteData, error: athleteError } = await supabase
    .from('athletes')
    .select('id, name, birth_date, gender')
    .eq('id', athleteId)
    .single();

  if (athleteError || !athleteData) {
    throw new ApiError(404, '選手が見つかりません。');
  }

  const athlete: AthleteRow = {
    id: athleteData.id,
    name: athleteData.name ?? '',
    birth_date: athleteData.birth_date ?? undefined,
    gender: athleteData.gender ?? undefined,
  };

  // ----- メトリクス取得 -----
  let metricsQuery = supabase
    .from('daily_metrics')
    .select('id, athlete_id, recorded_date, conditioning_score, acwr, hrv_rmssd, nrs_pain')
    .eq('athlete_id', athleteId)
    .order('recorded_date', { ascending: true });

  if (from) {
    metricsQuery = metricsQuery.gte('recorded_date', from);
  }
  if (to) {
    metricsQuery = metricsQuery.lte('recorded_date', to);
  }

  const { data: metricsData } = await metricsQuery;

  const metrics: DailyMetricRow[] = (metricsData ?? []).map((m) => ({
    id: m.id,
    athlete_id: m.athlete_id,
    recorded_date: m.recorded_date,
    conditioning_score: m.conditioning_score ?? undefined,
    acwr: m.acwr ?? undefined,
    hrv_rmssd: m.hrv_rmssd ?? undefined,
    nrs_pain: m.nrs_pain ?? undefined,
  }));

  // ----- アセスメント結果取得 -----
  let assessmentQuery = supabase
    .from('assessment_results')
    .select('id, node_id, node_name, posterior_probability, evidence_summary, created_at')
    .eq('athlete_id', athleteId);

  if (from) {
    assessmentQuery = assessmentQuery.gte('created_at', `${from}T00:00:00Z`);
  }
  if (to) {
    assessmentQuery = assessmentQuery.lte('created_at', `${to}T23:59:59Z`);
  }

  const { data: assessmentData } = await assessmentQuery;

  const assessmentResults: AssessmentResultRow[] = (assessmentData ?? []).map(
    (a) => ({
      id: a.id,
      node_id: a.node_id ?? '',
      node_name: a.node_name ?? '',
      posterior_probability: a.posterior_probability ?? 0,
      evidence_summary: a.evidence_summary ?? undefined,
      created_at: a.created_at ?? undefined,
    })
  );

  // ----- リハビリプログラム取得 -----
  const { data: rehabData } = await supabase
    .from('rehab_programs')
    .select('id, diagnosis_code, current_phase, status, start_date, estimated_rtp_date')
    .eq('athlete_id', athleteId);

  const rehabPrograms: RehabProgramRow[] = (rehabData ?? []).map((r) => ({
    id: r.id,
    diagnosis_code: r.diagnosis_code ?? '',
    current_phase: r.current_phase ?? 1,
    status: r.status ?? 'active',
    start_date: r.start_date ?? '',
    estimated_rtp_date: r.estimated_rtp_date ?? undefined,
  }));

  // ----- FHIR マッピング -----
  const patient = mapAthleteToPatient(athlete);
  const observations = mapMetricsToObservations(metrics, athleteId);
  const conditions = assessmentResults.map((a) =>
    mapAssessmentToCondition(a, athleteId)
  );
  const carePlans = rehabPrograms.map((r) =>
    mapRehabToCarePlan(r, athleteId)
  );

  const bundle = buildFHIRBundle(patient, observations, conditions, carePlans);

  // ----- 監査ログ -----
  await supabase
    .from('audit_logs')
    .insert({
      user_id: user.id,
      action: 'fhir_export',
      resource_type: 'athlete',
      resource_id: athleteId,
      details: {
        from,
        to,
        observation_count: observations.length,
        condition_count: conditions.length,
        care_plan_count: carePlans.length,
      },
    })
    .then(({ error }) => {
      if (error) ctx.log.warn('監査ログ記録失敗', { detail: error });
    });

  // ----- レスポンス -----
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'X-PACE-Export-Version': EXPORT_VERSION,
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="fhir-export-${athleteId}-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}, { service: 'fhir' });
