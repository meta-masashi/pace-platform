/**
 * PACE Platform — 選手個人レポート生成 API
 *
 * GET /api/reports/athlete?athleteId=xxx&format=summary|detailed
 *
 * 選手の全関連データ（メトリクス・アセスメント・SOAP・リハビリ）を取得し、
 * A4 印刷対応の HTML レポートを返す。ブラウザの印刷機能で PDF 変換可能。
 *
 * 認可: 認証済みスタッフのみ
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAthleteReport } from '@/lib/reports/pdf-generator';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import type {
  ReportData,
  ReportOptions,
  RiskAssessment,
  MenuModification,
  SOAPSummary,
  RehabSummary,
  DecayEntry,
} from '@/lib/reports/types';

// ---------------------------------------------------------------------------
// GET /api/reports/athlete
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, _ctx) => {
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get('athleteId');
  const format = (searchParams.get('format') ?? 'summary') as 'summary' | 'detailed';

  // ----- バリデーション -----
  if (!athleteId) {
    throw new ApiError(400, 'athleteId パラメータが必要です。');
  }

  if (!['summary', 'detailed'].includes(format)) {
    throw new ApiError(400, 'format は summary または detailed を指定してください。');
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

  // ----- 選手情報取得 -----
  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select('id, name, position, number, sport')
    .eq('id', athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(404, '選手が見つかりません。');
  }

  // ----- 並行データ取得 -----
  const today = new Date().toISOString().split('T')[0];

  const [
    metricsResult,
    assessmentResult,
    soapResult,
    rehabResult,
    menuResult,
  ] = await Promise.all([
    // 最新のメトリクス
    supabase
      .from('daily_metrics')
      .select('conditioning_score, acwr, date')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(1),

    // アセスメント結果（最新セッション）
    supabase
      .from('assessment_sessions')
      .select(`
        id,
        assessment_results (
          node_id,
          node_name,
          posterior_probability,
          evidence_summary
        )
      `)
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(1),

    // SOAPノート
    supabase
      .from('soap_notes')
      .select('id, s_text, o_text, a_text, p_text, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(format === 'detailed' ? 5 : 1),

    // リハビリプログラム
    supabase
      .from('rehab_programs')
      .select(`
        id,
        diagnosis_code,
        current_phase,
        status,
        start_date,
        estimated_rtp_date,
        rehab_phase_gates (
          phase,
          gate_met_at
        )
      `)
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .limit(1),

    // メニュー変更（ロック＋ワークアウト変更ログ）
    supabase
      .from('athlete_locks')
      .select('id, lock_type, tag, reason, set_at, expires_at')
      .eq('athlete_id', athleteId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  // ----- データマッピング -----
  const latestMetrics = metricsResult.data?.[0];
  const conditioningScore = latestMetrics?.conditioning_score ?? 0;
  const acwr = latestMetrics?.acwr ?? 0;

  // リスクアセスメント
  const riskAssessments: RiskAssessment[] = [];
  const latestSession = assessmentResult.data?.[0];
  if (latestSession) {
    const results = (latestSession as Record<string, unknown>).assessment_results;
    if (Array.isArray(results)) {
      for (const r of results) {
        const row = r as Record<string, unknown>;
        riskAssessments.push({
          nodeId: String(row.node_id ?? ''),
          nodeName: String(row.node_name ?? ''),
          riskLevel: Number(row.posterior_probability ?? 0),
          evidenceText: String(row.evidence_summary ?? ''),
        });
      }
    }
  }

  // メニュー変更
  const menuModifications: MenuModification[] = [];
  if (menuResult.data) {
    for (const lock of menuResult.data) {
      menuModifications.push({
        type: lock.lock_type === 'block' ? 'block' : 'insert',
        exerciseName: lock.tag ?? '',
        reason: lock.reason ?? '',
        appliedAt: lock.set_at ?? '',
      });
    }
  }

  // SOAPノート
  const soapNotes: SOAPSummary[] = [];
  if (soapResult.data) {
    for (const note of soapResult.data) {
      soapNotes.push({
        id: note.id,
        sText: note.s_text ?? '',
        oText: note.o_text ?? '',
        aText: note.a_text ?? '',
        pText: note.p_text ?? '',
        createdAt: note.created_at ?? '',
      });
    }
  }

  // リハビリ進捗
  let rehabProgress: RehabSummary | undefined;
  const rehabProgram = rehabResult.data?.[0];
  if (rehabProgram) {
    const program = rehabProgram as Record<string, unknown>;
    const gates = program.rehab_phase_gates;
    const currentPhase = Number(program.current_phase ?? 1);
    let gateStatus: 'met' | 'not_met' = 'not_met';

    if (Array.isArray(gates)) {
      const currentGate = gates.find(
        (g: Record<string, unknown>) => Number(g.phase) === currentPhase
      );
      if (currentGate && (currentGate as Record<string, unknown>).gate_met_at) {
        gateStatus = 'met';
      }
    }

    rehabProgress = {
      programId: String(program.id ?? ''),
      diagnosisCode: String(program.diagnosis_code ?? ''),
      currentPhase,
      status: String(program.status ?? 'active') as RehabSummary['status'],
      startDate: String(program.start_date ?? ''),
      estimatedRtpDate: program.estimated_rtp_date
        ? String(program.estimated_rtp_date)
        : null,
      gateStatus,
    };
  }

  // 減衰ステータス（detailed のみ）
  let decayStatus: DecayEntry[] | undefined;
  if (format === 'detailed' && latestMetrics) {
    const recordedDate = String(latestMetrics.date ?? '');
    const daysSince = recordedDate
      ? Math.floor(
          (Date.now() - new Date(recordedDate).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 999;
    const freshness = Math.max(0, Math.min(1, 1 - daysSince / 7));

    decayStatus = [
      {
        metricName: 'コンディショニングスコア',
        lastUpdated: recordedDate,
        freshness,
      },
    ];
  }

  // ----- レポート生成 -----
  const reportData: ReportData = {
    athlete: {
      name: athlete.name ?? '',
      position: athlete.position ?? '',
      number: athlete.number ?? '',
    },
    date: today ?? new Date().toISOString().slice(0, 10),
    conditioningScore,
    acwr,
    riskAssessments,
    menuModifications,
    soapNotes,
    rehabProgress,
    decayStatus,
  };

  const options: ReportOptions = {
    format,
    includeCharts: false,
    language: 'ja',
  };

  const html = generateAthleteReport(reportData, options);

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}, { service: 'reports' });
