/**
 * PACE Platform — チーム MDT レポート生成 API
 *
 * GET /api/reports/team?teamId=xxx&date=YYYY-MM-DD
 *
 * チーム全選手のデータを集約し、MDTミーティング用の
 * A4 印刷対応 HTML レポートを返す。
 *
 * 認可: 認証済みスタッフのみ
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateTeamReport } from '@/lib/reports/pdf-generator';
import type {
  ReportData,
  RiskAssessment,
  MenuModification,
  SOAPSummary,
  RehabSummary,
} from '@/lib/reports/types';

// ---------------------------------------------------------------------------
// GET /api/reports/team
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

    // ----- バリデーション -----
    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'teamId パラメータが必要です。' },
        { status: 400 }
      );
    }

    // ----- 認証チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ----- チーム情報取得 -----
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, error: 'チームが見つかりません。' },
        { status: 404 }
      );
    }

    // ----- チーム所属選手取得 -----
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('id, name, position, number')
      .eq('team_id', teamId)
      .order('number', { ascending: true });

    if (athletesError || !athletes || athletes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'チームに所属する選手が見つかりません。' },
        { status: 404 }
      );
    }

    // ----- 各選手のデータを並行取得 -----
    const athleteReports: ReportData[] = await Promise.all(
      athletes.map(async (ath) => {
        const [metricsRes, assessmentRes, soapRes, rehabRes, locksRes] =
          await Promise.all([
            supabase
              .from('daily_metrics')
              .select('conditioning_score, acwr')
              .eq('athlete_id', ath.id)
              .order('recorded_date', { ascending: false })
              .limit(1),

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
              .eq('athlete_id', ath.id)
              .order('created_at', { ascending: false })
              .limit(1),

            supabase
              .from('soap_notes')
              .select('id, s_text, o_text, a_text, p_text, created_at')
              .eq('athlete_id', ath.id)
              .order('created_at', { ascending: false })
              .limit(1),

            supabase
              .from('rehab_programs')
              .select(`
                id,
                diagnosis_code,
                current_phase,
                status,
                start_date,
                estimated_rtp_date,
                rehab_phase_gates ( phase, gate_met_at )
              `)
              .eq('athlete_id', ath.id)
              .eq('status', 'active')
              .limit(1),

            supabase
              .from('athlete_locks')
              .select('id, lock_type, tag, reason, set_at')
              .eq('athlete_id', ath.id)
              .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
          ]);

        const metrics = metricsRes.data?.[0];

        // リスクアセスメント
        const riskAssessments: RiskAssessment[] = [];
        const session = assessmentRes.data?.[0];
        if (session) {
          const results = (session as Record<string, unknown>).assessment_results;
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
        const menuModifications: MenuModification[] = (locksRes.data ?? []).map(
          (lock) => ({
            type: (lock.lock_type === 'block' ? 'block' : 'insert') as MenuModification['type'],
            exerciseName: lock.tag ?? '',
            reason: lock.reason ?? '',
            appliedAt: lock.set_at ?? '',
          })
        );

        // SOAPノート
        const soapNotes: SOAPSummary[] = (soapRes.data ?? []).map((n) => ({
          id: n.id,
          sText: n.s_text ?? '',
          oText: n.o_text ?? '',
          aText: n.a_text ?? '',
          pText: n.p_text ?? '',
          createdAt: n.created_at ?? '',
        }));

        // リハビリ進捗
        let rehabProgress: RehabSummary | undefined;
        const prog = rehabRes.data?.[0];
        if (prog) {
          const p = prog as Record<string, unknown>;
          const gates = p.rehab_phase_gates;
          const currentPhase = Number(p.current_phase ?? 1);
          let gateStatus: 'met' | 'not_met' = 'not_met';
          if (Array.isArray(gates)) {
            const g = gates.find(
              (g: Record<string, unknown>) => Number(g.phase) === currentPhase
            );
            if (g && (g as Record<string, unknown>).gate_met_at) gateStatus = 'met';
          }
          rehabProgress = {
            programId: String(p.id ?? ''),
            diagnosisCode: String(p.diagnosis_code ?? ''),
            currentPhase,
            status: String(p.status ?? 'active') as RehabSummary['status'],
            startDate: String(p.start_date ?? ''),
            estimatedRtpDate: p.estimated_rtp_date ? String(p.estimated_rtp_date) : null,
            gateStatus,
          };
        }

        return {
          athlete: {
            name: ath.name ?? '',
            position: ath.position ?? '',
            number: ath.number ?? '',
          },
          date: date ?? new Date().toISOString().slice(0, 10),
          conditioningScore: metrics?.conditioning_score ?? 0,
          acwr: metrics?.acwr ?? 0,
          riskAssessments,
          menuModifications,
          soapNotes,
          rehabProgress,
        };
      })
    );

    // ----- レポート生成 -----
    const html = generateTeamReport(athleteReports, team.name, date ?? '');

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[reports:team:GET] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 }
    );
  }
}
