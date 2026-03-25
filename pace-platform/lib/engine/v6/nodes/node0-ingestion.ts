/**
 * PACE v6.0 — Node 0: データ取り込み（Ingestion）
 *
 * 選手の日次入力データを検証・正規化し、
 * 既往歴に基づくリスク乗数を適用する。
 *
 * 入力: DailyInput（生データ）
 * 出力: 正規化済み DailyInput + リスク乗数マップ
 */

import type {
  AthleteContext,
  DailyInput,
  NodeExecutor,
  NodeResult,
  PipelineConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Node 0 出力型
// ---------------------------------------------------------------------------

/** Node 0 の出力データ */
export interface IngestionOutput {
  /** 正規化済み入力データ */
  normalizedInput: DailyInput;
  /** 部位別リスク乗数（既往歴から算出） */
  riskMultipliers: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 検証ユーティリティ
// ---------------------------------------------------------------------------

/** 値を [min, max] にクランプする */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * sRPE 値を 0-10 の範囲に正規化する。
 *
 * @param value - 入力 sRPE 値
 * @returns 正規化済み sRPE（0-10）
 */
function normalizeSRPE(value: number): number {
  return clamp(value, 0, 10);
}

/**
 * 主観スコアを 0-10 の範囲に正規化する。
 *
 * @param value - 入力スコア
 * @returns 正規化済みスコア（0-10）
 */
function normalizeSubjectiveScore(value: number): number {
  return clamp(value, 0, 10);
}

/**
 * トレーニング時間を非負値に正規化する。
 *
 * @param value - 入力時間（分）
 * @returns 正規化済み時間（0 以上）
 */
function normalizeTrainingDuration(value: number): number {
  return Math.max(0, value);
}

// ---------------------------------------------------------------------------
// リスク乗数計算
// ---------------------------------------------------------------------------

/**
 * 既往歴からリスク乗数マップを算出する。
 *
 * 同一部位に複数の既往歴がある場合、最大の乗数を採用する。
 * 既往歴がない部位のデフォルト乗数は 1.0。
 *
 * @param context - 選手コンテキスト
 * @returns 部位別リスク乗数マップ
 */
function calculateRiskMultipliers(
  context: AthleteContext,
): Record<string, number> {
  const multipliers: Record<string, number> = { ...context.riskMultipliers };

  for (const entry of context.medicalHistory) {
    const existing = multipliers[entry.bodyPart] ?? 1.0;
    // 同一部位の複数既往歴は最大乗数を採用
    multipliers[entry.bodyPart] = Math.max(existing, entry.riskMultiplier);
  }

  return multipliers;
}

// ---------------------------------------------------------------------------
// Node 0 本体
// ---------------------------------------------------------------------------

/**
 * Node 0 実行モジュール: データ取り込み（Ingestion）。
 *
 * 以下の処理を行う:
 * 1. sRPE・主観スコア・トレーニング時間の範囲検証と正規化
 * 2. セッション負荷（sessionLoad = sRPE x duration）の再計算
 * 3. 既往歴からのリスク乗数算出
 * 4. デバイス信頼性（κ）の範囲検証
 */
export const node0Ingestion: NodeExecutor<DailyInput, IngestionOutput> = {
  nodeId: 'node0_ingestion',

  async execute(
    input: DailyInput,
    context: AthleteContext,
    _config: PipelineConfig,
  ): Promise<NodeResult<IngestionOutput>> {
    const startMs = performance.now();
    const warnings: string[] = [];

    // ----- sRPE 正規化 -----
    const normalizedSRPE = normalizeSRPE(input.sRPE);
    if (normalizedSRPE !== input.sRPE) {
      warnings.push(
        `sRPE が範囲外（${input.sRPE}）のため ${normalizedSRPE} にクランプ`,
      );
    }

    // ----- トレーニング時間正規化 -----
    const normalizedDuration = normalizeTrainingDuration(
      input.trainingDurationMin,
    );
    if (normalizedDuration !== input.trainingDurationMin) {
      warnings.push(
        `トレーニング時間が負値（${input.trainingDurationMin}）のため 0 に補正`,
      );
    }

    // ----- 主観スコア正規化 -----
    const normalizedSubjective: DailyInput['subjectiveScores'] = {
      sleepQuality: normalizeSubjectiveScore(input.subjectiveScores.sleepQuality),
      fatigue: normalizeSubjectiveScore(input.subjectiveScores.fatigue),
      mood: normalizeSubjectiveScore(input.subjectiveScores.mood),
      muscleSoreness: normalizeSubjectiveScore(
        input.subjectiveScores.muscleSoreness,
      ),
      stressLevel: normalizeSubjectiveScore(input.subjectiveScores.stressLevel),
      painNRS: normalizeSubjectiveScore(input.subjectiveScores.painNRS),
      ...(input.subjectiveScores.restingHeartRate !== undefined
        ? { restingHeartRate: input.subjectiveScores.restingHeartRate }
        : {}),
    };

    // 主観スコアのクランプ警告
    const subjectiveKeys = [
      'sleepQuality',
      'fatigue',
      'mood',
      'muscleSoreness',
      'stressLevel',
      'painNRS',
    ] as const;
    for (const key of subjectiveKeys) {
      const original = input.subjectiveScores[key];
      const normalized = normalizedSubjective[key];
      if (original !== normalized) {
        warnings.push(
          `主観スコア ${key} が範囲外（${original}）のため ${normalized} にクランプ`,
        );
      }
    }

    // ----- セッション負荷再計算 -----
    const sessionLoad = normalizedSRPE * normalizedDuration;

    // ----- デバイス信頼性の検証 -----
    let normalizedObjectiveLoad = input.objectiveLoad;
    if (normalizedObjectiveLoad) {
      const kappa = clamp(normalizedObjectiveLoad.deviceKappa, 0, 1);
      if (kappa !== normalizedObjectiveLoad.deviceKappa) {
        warnings.push(
          `デバイス信頼性 κ が範囲外（${normalizedObjectiveLoad.deviceKappa}）のため ${kappa} にクランプ`,
        );
        normalizedObjectiveLoad = {
          ...normalizedObjectiveLoad,
          deviceKappa: kappa,
        };
      }
    }

    // ----- リスク乗数算出 -----
    const riskMultipliers = calculateRiskMultipliers(context);

    // ----- 正規化済み入力データ構築 -----
    const normalizedInput: DailyInput = {
      date: input.date,
      sRPE: normalizedSRPE,
      trainingDurationMin: normalizedDuration,
      sessionLoad,
      subjectiveScores: normalizedSubjective,
      contextFlags: input.contextFlags,
      localTimezone: input.localTimezone,
      ...(normalizedObjectiveLoad !== undefined
        ? { objectiveLoad: normalizedObjectiveLoad }
        : {}),
      ...(input.responseLatencyMs !== undefined
        ? { responseLatencyMs: input.responseLatencyMs }
        : {}),
    };

    return {
      nodeId: 'node0_ingestion',
      success: true,
      executionTimeMs: performance.now() - startMs,
      data: {
        normalizedInput,
        riskMultipliers,
      },
      warnings,
    };
  },
};
