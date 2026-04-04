/**
 * PACE Platform — リハビリシミュレーター API
 *
 * POST /api/simulator/rehab
 *
 * リハビリプログラムへの変更（エクササイズ追加・削除・修正）を
 * シミュレーションし、組織負荷・回復予測・フェーズ遷移・復帰タイムラインを返す。
 * 実際のデータは変更せず、What-if 分析のみ実行する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface Change {
  action: 'add' | 'remove' | 'modify';
  exerciseId?: string;
  prescriptionId?: string;
  sets?: number;
  reps?: number;
  durationSec?: number;
}

interface RequestBody {
  athleteId: string;
  programId: string;
  changes: Change[];
  forecastDays: number;
}

interface TissueLoadEntry {
  tissue: string;
  currentLoad: number;
  proposedLoad: number;
  ceiling: number;
  safe: boolean;
}

interface RecoveryForecastEntry {
  day: number;
  baselineNrs: number;
  proposedNrs: number;
}

interface PhaseTransitionEntry {
  criterion: string;
  currentProgress: number;
  targetValue: number;
  daysToAchieve: number | null;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const TISSUE_LOAD_CEILING = 0.3;
const ELEVATED_RISK_THRESHOLD = 0.25;
const HIGH_RISK_NRS_THRESHOLD = 3;
const MAX_CHANGES = 10;
const MIN_FORECAST_DAYS = 7;
const MAX_FORECAST_DAYS = 60;

// ---------------------------------------------------------------------------
// POST /api/simulator/rehab
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
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 },
      );
    }

    // ----- バリデーション -----
    if (!body.athleteId || !body.programId || !body.changes || !body.forecastDays) {
      return NextResponse.json(
        { success: false, error: 'athleteId, programId, changes, forecastDays は必須です。' },
        { status: 400 },
      );
    }

    if (!validateUUID(body.athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    if (!validateUUID(body.programId)) {
      return NextResponse.json(
        { success: false, error: 'programId の形式が不正です。' },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'changes は1件以上の配列で指定してください。' },
        { status: 400 },
      );
    }

    if (body.changes.length > MAX_CHANGES) {
      return NextResponse.json(
        { success: false, error: `changes は最大 ${MAX_CHANGES} 件までです。` },
        { status: 400 },
      );
    }

    // changes 内の UUID バリデーション
    for (const change of body.changes) {
      if (!['add', 'remove', 'modify'].includes(change.action)) {
        return NextResponse.json(
          { success: false, error: `不正な action: ${change.action}` },
          { status: 400 },
        );
      }
      if (change.exerciseId && !validateUUID(change.exerciseId)) {
        return NextResponse.json(
          { success: false, error: 'exerciseId の形式が不正です。' },
          { status: 400 },
        );
      }
      if (change.prescriptionId && !validateUUID(change.prescriptionId)) {
        return NextResponse.json(
          { success: false, error: 'prescriptionId の形式が不正です。' },
          { status: 400 },
        );
      }
    }

    // forecastDays をクランプ
    const forecastDays = Math.min(
      Math.max(Math.round(body.forecastDays), MIN_FORECAST_DAYS),
      MAX_FORECAST_DAYS,
    );

    // ----- アスリートの組織アクセスチェック -----
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('id, org_id')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        { success: false, error: 'アスリートが見つからないか、アクセス権がありません。' },
        { status: 404 },
      );
    }

    // ===================================================================
    // 2. 現在のリハビリ状態を取得
    // ===================================================================

    // ----- リハビリプログラム取得 -----
    const { data: program, error: programError } = await supabase
      .from('rehab_programs')
      .select('id, athlete_id, diagnosis_code, current_phase, injury_date, status')
      .eq('id', body.programId)
      .eq('athlete_id', body.athleteId)
      .eq('status', 'active')
      .single();

    if (programError || !program) {
      return NextResponse.json(
        {
          success: false,
          error: '指定されたリハビリプログラムが見つからないか、アクティブではありません。',
        },
        { status: 404 },
      );
    }

    // ----- 現在の処方を取得 -----
    const { data: prescriptions } = await supabase
      .from('rehab_prescriptions')
      .select(
        'id, exercise_id, sets, reps, duration_sec, rehab_exercises(id, name, target_tissue, tissue_load, expected_effect, min_phase, contraindications, intensity_level)',
      )
      .eq('program_id', program.id)
      .eq('active', true);

    const currentPrescriptions = prescriptions ?? [];

    // ----- フェーズゲート基準を取得 -----
    const { data: phaseGates } = await supabase
      .from('rehab_phase_gates')
      .select('id, phase, criterion, target_value, current_value')
      .eq('program_id', program.id)
      .order('phase', { ascending: true });

    const gates = phaseGates ?? [];

    // ----- NRS トレンドを取得 -----
    const { data: nrsRecords } = await supabase
      .from('daily_metrics')
      .select('date, nrs')
      .eq('athlete_id', body.athleteId)
      .not('nrs', 'is', null)
      .order('date', { ascending: false })
      .limit(30);

    const nrsData = nrsRecords ?? [];
    const currentNrs = nrsData.length > 0 ? nrsData[0]?.nrs ?? 5 : 5;
    const initialNrs = nrsData.length > 0 ? nrsData[nrsData.length - 1]?.nrs ?? 7 : 7;

    // ----- 日数計算 -----
    const injuryDate = new Date(program.injury_date);
    const now = new Date();
    const daysSinceInjury = Math.max(
      1,
      Math.floor((now.getTime() - injuryDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    // ===================================================================
    // 3. シミュレーション実行
    // ===================================================================

    const safetyViolations: string[] = [];

    // ----- 変更で参照されるエクササイズを一括取得 -----
    const exerciseIdsToFetch = body.changes
      .filter((c) => c.exerciseId)
      .map((c) => c.exerciseId as string);

    let newExercisesMap: Record<string, {
      id: string;
      name: string;
      target_tissue: string;
      tissue_load: number;
      expected_effect: string;
      min_phase: number;
      contraindications: string[] | null;
      intensity_level: number;
    }> = {};

    if (exerciseIdsToFetch.length > 0) {
      const { data: exercises } = await supabase
        .from('rehab_exercises')
        .select(
          'id, name, target_tissue, tissue_load, expected_effect, min_phase, contraindications, intensity_level',
        )
        .in('id', exerciseIdsToFetch);

      if (exercises) {
        for (const ex of exercises) {
          newExercisesMap[ex.id] = ex;
        }
      }
    }

    // ----- 3a. 組織負荷計算 -----
    // 現在の組織別負荷を集計
    const currentTissueLoads: Record<string, number> = {};
    for (const p of currentPrescriptions) {
      const exercise = p.rehab_exercises as unknown as {
        target_tissue: string;
        tissue_load: number;
      } | null;
      if (!exercise) continue;
      const tissue = exercise.target_tissue;
      currentTissueLoads[tissue] = (currentTissueLoads[tissue] ?? 0) + exercise.tissue_load;
    }

    // 提案後の組織別負荷を計算
    const proposedTissueLoads: Record<string, number> = { ...currentTissueLoads };

    // 削除対象の prescriptionId を収集
    const removedPrescriptionIds = new Set(
      body.changes
        .filter((c) => c.action === 'remove' && c.prescriptionId)
        .map((c) => c.prescriptionId as string),
    );

    // 削除分を減算
    for (const p of currentPrescriptions) {
      if (removedPrescriptionIds.has(p.id)) {
        const exercise = p.rehab_exercises as unknown as {
          target_tissue: string;
          tissue_load: number;
        } | null;
        if (exercise) {
          const tissue = exercise.target_tissue;
          proposedTissueLoads[tissue] = Math.max(
            0,
            (proposedTissueLoads[tissue] ?? 0) - exercise.tissue_load,
          );
        }
      }
    }

    // 追加分を加算
    for (const change of body.changes) {
      if (change.action === 'add' && change.exerciseId) {
        const exercise = newExercisesMap[change.exerciseId];
        if (exercise) {
          const tissue = exercise.target_tissue;
          proposedTissueLoads[tissue] =
            (proposedTissueLoads[tissue] ?? 0) + exercise.tissue_load;

          // 安全チェック: min_phase
          if (exercise.min_phase > program.current_phase) {
            safetyViolations.push(
              `${exercise.name} はフェーズ ${exercise.min_phase} 以降で使用可能ですが、現在フェーズ ${program.current_phase} です。`,
            );
          }

          // 安全チェック: 禁忌
          if (
            exercise.contraindications &&
            exercise.contraindications.includes(program.diagnosis_code)
          ) {
            safetyViolations.push(
              `${exercise.name} は診断 ${program.diagnosis_code} に対して禁忌です。`,
            );
          }
        }
      }

      // modify の場合もエクササイズの安全チェック
      if (change.action === 'modify' && change.exerciseId) {
        const exercise = newExercisesMap[change.exerciseId];
        if (exercise) {
          if (exercise.min_phase > program.current_phase) {
            safetyViolations.push(
              `${exercise.name} はフェーズ ${exercise.min_phase} 以降で使用可能ですが、現在フェーズ ${program.current_phase} です。`,
            );
          }
          if (
            exercise.contraindications &&
            exercise.contraindications.includes(program.diagnosis_code)
          ) {
            safetyViolations.push(
              `${exercise.name} は診断 ${program.diagnosis_code} に対して禁忌です。`,
            );
          }
        }
      }
    }

    // すべての組織を統合して分析結果を構築
    const allTissues = new Set([
      ...Object.keys(currentTissueLoads),
      ...Object.keys(proposedTissueLoads),
    ]);

    const tissueLoadAnalysis: TissueLoadEntry[] = Array.from(allTissues).map((tissue) => {
      const currentLoad = currentTissueLoads[tissue] ?? 0;
      const proposedLoad = proposedTissueLoads[tissue] ?? 0;
      const safe = proposedLoad <= TISSUE_LOAD_CEILING;

      if (!safe) {
        safetyViolations.push(
          `組織 "${tissue}" の提案負荷 (${proposedLoad.toFixed(3)}) が安全上限 (${TISSUE_LOAD_CEILING}) を超過しています。`,
        );
      }

      return {
        tissue,
        currentLoad: Math.round(currentLoad * 1000) / 1000,
        proposedLoad: Math.round(proposedLoad * 1000) / 1000,
        ceiling: TISSUE_LOAD_CEILING,
        safe,
      };
    });

    // ----- 3b. 回復タイムライン予測 -----
    const recoveryRate =
      daysSinceInjury > 0 ? (initialNrs - currentNrs) / daysSinceInjury : 0;

    // 変更による回復率調整を計算
    let proposedRateAdjustment = 0;
    for (const change of body.changes) {
      if (change.action === 'add' && change.exerciseId) {
        const exercise = newExercisesMap[change.exerciseId];
        if (exercise) {
          const effect = exercise.expected_effect?.toLowerCase() ?? '';
          if (effect.includes('rom') || effect.includes('strength') || effect.includes('可動域') || effect.includes('筋力')) {
            proposedRateAdjustment += 0.05;
          }
        }
      }
      if (change.action === 'remove' && change.prescriptionId) {
        // 削除すると回復率が少し低下する可能性
        proposedRateAdjustment -= 0.02;
      }
    }

    const proposedRecoveryRate = Math.max(0, recoveryRate + proposedRateAdjustment);

    const recoveryForecast: RecoveryForecastEntry[] = [];
    for (let day = 0; day <= forecastDays; day++) {
      const baselineNrs = Math.max(0, currentNrs - recoveryRate * day);
      const proposedNrs = Math.max(0, currentNrs - proposedRecoveryRate * day);
      recoveryForecast.push({
        day,
        baselineNrs: Math.round(baselineNrs * 10) / 10,
        proposedNrs: Math.round(proposedNrs * 10) / 10,
      });
    }

    // ----- 3c. フェーズ遷移予測 -----
    const nextPhaseGates = gates.filter((g) => g.phase === program.current_phase + 1);

    const phaseTransition: PhaseTransitionEntry[] = nextPhaseGates.map((gate) => {
      const currentProgress = gate.current_value ?? 0;
      const target = gate.target_value ?? 100;

      if (currentProgress >= target) {
        return {
          criterion: gate.criterion,
          currentProgress,
          targetValue: target,
          daysToAchieve: 0,
        };
      }

      const remaining = target - currentProgress;
      // 基本の進行率を推定（日ごと）
      const dailyProgress = daysSinceInjury > 0 ? currentProgress / daysSinceInjury : 1;

      // 変更による加速: 追加エクササイズの expected_effect がクライテリアに関連する場合
      let accelerationFactor = 1.0;
      for (const change of body.changes) {
        if (change.action === 'add' && change.exerciseId) {
          const exercise = newExercisesMap[change.exerciseId];
          if (exercise) {
            const effect = exercise.expected_effect?.toLowerCase() ?? '';
            const criterion = gate.criterion.toLowerCase();
            if (
              (criterion.includes('rom') && effect.includes('rom')) ||
              (criterion.includes('可動域') && effect.includes('可動域')) ||
              (criterion.includes('strength') && effect.includes('strength')) ||
              (criterion.includes('筋力') && effect.includes('筋力')) ||
              (criterion.includes('pain') && effect.includes('pain')) ||
              (criterion.includes('疼痛') && effect.includes('疼痛'))
            ) {
              accelerationFactor += 0.15;
            }
          }
        }
      }

      const adjustedDailyProgress = dailyProgress * accelerationFactor;
      const daysToAchieve =
        adjustedDailyProgress > 0 ? Math.ceil(remaining / adjustedDailyProgress) : null;

      return {
        criterion: gate.criterion,
        currentProgress: Math.round(currentProgress * 10) / 10,
        targetValue: target,
        daysToAchieve,
      };
    });

    // ----- 3d. 復帰タイムライン -----
    // 全フェーズゲートの最大到達日数で推定
    const maxDaysBaseline = phaseTransition.reduce(
      (max, pt) => Math.max(max, pt.daysToAchieve ?? 0),
      0,
    );

    // 残りフェーズも加味（現フェーズ以降のゲート数 x 平均日数）
    const remainingPhases = new Set(
      gates.filter((g) => g.phase > program.current_phase + 1).map((g) => g.phase),
    );
    const avgPhaseLength = daysSinceInjury / Math.max(1, program.current_phase);

    const currentTimelineDays =
      maxDaysBaseline + remainingPhases.size * avgPhaseLength;

    // 提案による改善: 加速ファクターの反映
    const overallAcceleration = proposedRateAdjustment > 0 ? 0.85 : 1.0;
    const proposedTimelineDays = Math.round(currentTimelineDays * overallAcceleration);
    const currentTimelineRounded = Math.round(currentTimelineDays);
    const improvementDays = currentTimelineRounded - proposedTimelineDays;

    const returnTimeline = {
      currentDays: currentTimelineRounded,
      proposedDays: proposedTimelineDays,
      improvementDays,
    };

    // ----- 3e. 再受傷リスク評価 -----
    const warnings: string[] = [];
    let riskLevel: 'low' | 'moderate' | 'high' = 'low';

    // 組織負荷による判定
    const hasElevatedLoad = tissueLoadAnalysis.some(
      (t) => t.proposedLoad > ELEVATED_RISK_THRESHOLD,
    );
    const hasExceededCeiling = tissueLoadAnalysis.some((t) => !t.safe);

    if (hasExceededCeiling) {
      riskLevel = 'high';
      warnings.push('組織負荷が安全上限を超過しています。プログラムの見直しを推奨します。');
    } else if (hasElevatedLoad) {
      riskLevel = 'moderate';
      warnings.push(
        '組織負荷がリスク閾値（0.25）を超えています。慎重にモニタリングしてください。',
      );
    }

    // NRS + 高強度追加による判定
    if (currentNrs > HIGH_RISK_NRS_THRESHOLD) {
      const addingHighIntensity = body.changes.some((c) => {
        if (c.action !== 'add' || !c.exerciseId) return false;
        const exercise = newExercisesMap[c.exerciseId];
        return exercise && exercise.intensity_level >= 4;
      });

      if (addingHighIntensity) {
        riskLevel = 'high';
        warnings.push(
          `NRS が ${currentNrs} (> ${HIGH_RISK_NRS_THRESHOLD}) の状態で高強度エクササイズの追加はリスクが高いです。`,
        );
      }
    }

    // ===================================================================
    // 4. レスポンス
    // ===================================================================

    return NextResponse.json({
      success: true,
      data: {
        currentState: {
          phase: program.current_phase,
          daysSinceInjury,
          currentNrs,
          activePrescriptions: currentPrescriptions.length,
        },
        tissueLoadAnalysis,
        recoveryForecast,
        phaseTransition,
        returnTimeline,
        riskAssessment: {
          level: riskLevel,
          warnings,
        },
        safetyViolations,
      },
    });
  } catch (error) {
    console.error('[simulator/rehab] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'シミュレーション中に予期しないエラーが発生しました。' },
      { status: 500 },
    );
  }
}
