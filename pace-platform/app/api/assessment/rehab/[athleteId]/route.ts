/**
 * GET /api/assessment/rehab/{athleteId}
 *
 * リハビリアセスメント用データを集約して返す。
 * - 回復進捗（Phase, Day数, 回復度スコア）
 * - NRS推移（受傷日からのトレンド）
 * - 復帰基準チェックリスト（Phase移行判定）
 * - 現在のリハビリ処方一覧
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  try {
    const { athleteId } = await params;

    if (!validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 認証・権限チェック
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

    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // 選手確認
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, name, org_id, sport, position, number')
      .eq('id', athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: '選手が見つかりません。' },
        { status: 404 },
      );
    }

    // ----- アクティブなリハビリプログラムを取得 -----
    const { data: programs } = await supabase
      .from('rehab_programs')
      .select('id, diagnosis, injury_date, current_phase, status, created_at')
      .eq('athlete_id', athleteId)
      .in('status', ['active', 'on_hold'])
      .order('created_at', { ascending: false });

    const activePrograms = programs ?? [];

    if (activePrograms.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          athlete: {
            id: athlete.id,
            name: athlete.name,
            sport: athlete.sport,
          },
          hasActiveProgram: false,
          programs: [],
        },
      });
    }

    // ----- 各プログラムの詳細を取得 -----
    const programDetails = await Promise.all(
      activePrograms.map(async (program) => {
        const programId = program.id as string;
        const injuryDate = program.injury_date as string;
        const currentPhase = (program.current_phase as number) ?? 1;

        // Phase Gates（復帰基準）
        const { data: gates } = await supabase
          .from('rehab_phase_gates')
          .select('phase, criteria, met, checked_at')
          .eq('program_id', programId)
          .order('phase', { ascending: true });

        // 現在のPhaseの Gate 基準
        const currentGate = (gates ?? []).find(
          (g) => (g.phase as number) === currentPhase,
        );
        const nextGate = (gates ?? []).find(
          (g) => (g.phase as number) === currentPhase + 1,
        );

        // 復帰基準達成状況
        const criteria = ((nextGate?.criteria ?? currentGate?.criteria) as Record<string, unknown>[]) ?? [];
        const criteriaMet = criteria.filter((c) => c.met === true).length;
        const criteriaTotal = criteria.length;
        const achievementRate = criteriaTotal > 0
          ? Math.round((criteriaMet / criteriaTotal) * 100)
          : 0;

        // Day 数計算
        const daysSinceInjury = injuryDate
          ? Math.floor(
              (Date.now() - new Date(injuryDate).getTime()) / (1000 * 60 * 60 * 24),
            )
          : 0;

        // NRS 推移（受傷日以降）
        const { data: nrsMetrics } = await supabase
          .from('daily_metrics')
          .select('date, nrs')
          .eq('athlete_id', athleteId)
          .gte('date', injuryDate ?? '2020-01-01')
          .order('date', { ascending: true });

        const nrsTrend = (nrsMetrics ?? []).map((m) => ({
          date: m.date as string,
          nrs: (m.nrs as number) ?? 0,
        }));

        // 回復度スコア（NRS改善率 + Phase進捗 + 基準達成率の複合）
        const initialNrs = nrsTrend.length > 0 ? nrsTrend[0].nrs : 0;
        const currentNrs = nrsTrend.length > 0 ? nrsTrend[nrsTrend.length - 1].nrs : 0;
        const nrsImprovement = initialNrs > 0
          ? Math.round(((initialNrs - currentNrs) / initialNrs) * 100)
          : 0;

        const phaseProgress = Math.round((currentPhase / 4) * 100);
        const recoveryScore = Math.min(100, Math.round(
          nrsImprovement * 0.3 + phaseProgress * 0.4 + achievementRate * 0.3,
        ));

        // リハビリ処方
        const { data: prescriptions } = await supabase
          .from('rehab_prescriptions')
          .select('id, exercise_id, start_day, end_day, sets, reps, duration_sec, notes, status')
          .eq('program_id', programId)
          .eq('status', 'active');

        // 処方に紐づく種目情報を取得
        const exerciseIds = (prescriptions ?? []).map((p) => p.exercise_id as string);
        let exercises: Record<string, unknown>[] = [];
        if (exerciseIds.length > 0) {
          const { data: exData } = await supabase
            .from('rehab_exercises')
            .select('id, name, name_en, category, target_tissue, intensity_level, tissue_load, expected_effect, min_phase')
            .in('id', exerciseIds);
          exercises = exData ?? [];
        }

        // 処方と種目を結合
        const prescriptionDetails = (prescriptions ?? []).map((rx) => {
          const exercise = exercises.find((e) => (e.id as string) === (rx.exercise_id as string));
          return {
            id: rx.id,
            exercise: exercise
              ? {
                  id: exercise.id,
                  name: exercise.name,
                  nameEn: exercise.name_en,
                  category: exercise.category,
                  targetTissue: exercise.target_tissue,
                  intensityLevel: exercise.intensity_level,
                  tissueLoad: exercise.tissue_load,
                  expectedEffect: exercise.expected_effect,
                }
              : null,
            startDay: rx.start_day,
            endDay: rx.end_day,
            sets: rx.sets,
            reps: rx.reps,
            durationSec: rx.duration_sec,
            notes: rx.notes,
            isActive: daysSinceInjury >= (rx.start_day as number),
          };
        });

        return {
          programId,
          diagnosis: program.diagnosis,
          injuryDate,
          currentPhase,
          daysSinceInjury,
          status: program.status,
          recoveryScore,
          nrsImprovement,
          nrsTrend,
          criteria: criteria.map((c) => ({
            name: (c as Record<string, unknown>).name ?? '',
            description: (c as Record<string, unknown>).description ?? '',
            met: (c as Record<string, unknown>).met ?? false,
            currentValue: (c as Record<string, unknown>).currentValue ?? null,
            targetValue: (c as Record<string, unknown>).targetValue ?? null,
          })),
          achievementRate,
          phaseGates: (gates ?? []).map((g) => ({
            phase: g.phase,
            met: g.met,
            checkedAt: g.checked_at,
          })),
          prescriptions: prescriptionDetails,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: {
        athlete: {
          id: athlete.id,
          name: athlete.name,
          sport: athlete.sport,
          position: athlete.position,
          number: athlete.number,
        },
        hasActiveProgram: true,
        programs: programDetails,
      },
    });
  } catch (err) {
    console.error('[assessment/rehab:GET] エラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'リハビリアセスメントデータの取得に失敗しました。',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
