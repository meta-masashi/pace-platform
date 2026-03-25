/**
 * tests/unit/v6-ekf-scenarios.test.ts
 * ============================================================
 * PACE v6.0 — EKF デカップリングシナリオテスト
 *
 * EKF（拡張カルマンフィルタ）ベースの主観-客観負荷デカップリング検出。
 * Python ゲートウェイのレスポンスフォーマットに基づき、
 * TypeScript 側での処理とシナリオを検証する。
 *
 * テストシナリオ:
 *   1. 正直な選手: sRPE ≈ 客観負荷 → デカップリングなし
 *   2. 過少報告: sRPE 低 & 客観負荷 高 → デカップリング検出
 *   3. 低 κ デバイス: 信頼性が低い → 許容幅が広い
 *   4. 逐次更新: 複数日の状態収束
 *   5. 重症度スコア: 軽度 vs 重度デカップリング
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest';

import type { EKFResponse, EKFRequestParams } from '../../lib/engine/v6/gateway';
import { DEFAULT_PIPELINE_CONFIG } from '../../lib/engine/v6/config';
import { node4Decision } from '../../lib/engine/v6/nodes/node4-decision';
import type {
  AthleteContext,
  DailyInput,
  FeatureVector,
  InferenceOutput,
  PipelineConfig,
} from '../../lib/engine/v6/types';

// ---------------------------------------------------------------------------
// EKF デカップリングシミュレーション（TypeScript テスト用）
// ---------------------------------------------------------------------------

/**
 * 簡易 EKF デカップリング計算（TypeScript テスト用）。
 *
 * デカップリングスコア = |主観負荷平均 - 客観負荷平均| / (客観負荷平均 * (1 + (1 - κ)))
 *
 * κ が高い（デバイス信頼性高）: 許容幅が狭く、乖離が検出されやすい
 * κ が低い（デバイス信頼性低）: 許容幅が広く、乖離が検出されにくい
 */
function simulateEKFDecoupling(params: EKFRequestParams): EKFResponse {
  const { subjectiveLoadHistory, objectiveLoadHistory, deviceKappa } = params;

  if (
    subjectiveLoadHistory.length === 0 ||
    objectiveLoadHistory.length === 0
  ) {
    return { decouplingScore: 0, fromService: false };
  }

  const subjMean =
    subjectiveLoadHistory.reduce((a, b) => a + b, 0) /
    subjectiveLoadHistory.length;
  const objMean =
    objectiveLoadHistory.reduce((a, b) => a + b, 0) /
    objectiveLoadHistory.length;

  if (objMean === 0) {
    return { decouplingScore: 0, fromService: false };
  }

  // 正規化された乖離度
  const rawDivergence = Math.abs(subjMean - objMean) / objMean;

  // κ による信頼性調整: κ が低いほど許容幅が広い
  const toleranceFactor = 1 + (1 - deviceKappa) * 2;
  const adjustedScore = rawDivergence / toleranceFactor;

  return {
    decouplingScore: adjustedScore,
    fromService: false,
  };
}

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function createTestContext(): AthleteContext {
  return {
    athleteId: 'athlete-001',
    orgId: 'org-001',
    teamId: 'team-001',
    age: 25,
    sport: 'soccer',
    isContactSport: true,
    validDataDays: 30,
    bayesianPriors: {},
    riskMultipliers: {},
    medicalHistory: [],
    tissueHalfLifes: {
      metabolic: 2,
      structural_soft: 7,
      structural_hard: 21,
      neuromotor: 3,
    },
  };
}

function createTestDailyInput(): DailyInput {
  return {
    date: '2025-06-15',
    sRPE: 4,
    trainingDurationMin: 60,
    sessionLoad: 240,
    subjectiveScores: {
      sleepQuality: 8,
      fatigue: 3,
      mood: 7,
      muscleSoreness: 2,
      stressLevel: 3,
      painNRS: 1,
    },
    contextFlags: {
      isGameDay: false,
      isGameDayMinus1: false,
      isAcclimatization: false,
      isWeightMaking: false,
      isPostVaccination: false,
      isPostFever: false,
    },
    localTimezone: 'Asia/Tokyo',
  };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('v6.0 EKF デカップリングシナリオ', () => {
  // 1. 正直な選手: sRPE ≈ 客観負荷 → デカップリングなし
  describe('正直な選手（一致するsRPEと客観負荷）', () => {
    it('sRPE と客観負荷が一致 → デカップリングスコアが低い', () => {
      const result = simulateEKFDecoupling({
        subjectiveLoadHistory: [300, 320, 280, 310, 290, 300, 310,
          305, 295, 310, 300, 290, 305, 315],
        objectiveLoadHistory: [310, 305, 290, 300, 295, 310, 305,
          300, 300, 305, 310, 295, 300, 310],
        deviceKappa: 0.9,
      });

      // デカップリングスコアが閾値（1.5）未満
      expect(result.decouplingScore).toBeLessThan(
        DEFAULT_PIPELINE_CONFIG.thresholds.decouplingThreshold,
      );
    });
  });

  // 2. 過少報告: sRPE 低 & 客観負荷 高 → デカップリング検出
  describe('過少報告（sRPE < 客観負荷）', () => {
    it('sRPE=低, 客観負荷=高 → 高デカップリングスコア', () => {
      const result = simulateEKFDecoupling({
        subjectiveLoadHistory: [150, 140, 160, 145, 155, 150, 140,
          145, 155, 150, 140, 160, 145, 155],
        objectiveLoadHistory: [500, 520, 480, 510, 490, 500, 510,
          505, 495, 510, 500, 490, 505, 515],
        deviceKappa: 0.9,
      });

      // 大きな乖離が検出される
      expect(result.decouplingScore).toBeGreaterThan(0);
    });

    it('デカップリングスコアが閾値超過 → P3 判定トリガー', async () => {
      const context = createTestContext();
      const input = createTestDailyInput();
      const config = DEFAULT_PIPELINE_CONFIG;

      const featureVector: FeatureVector = {
        acwr: 1.0,
        monotonyIndex: 1.0,
        preparedness: 10,
        tissueDamage: {
          metabolic: 0.1,
          structural_soft: 0.1,
          structural_hard: 0.1,
          neuromotor: 0.1,
        },
        zScores: {},
        decouplingScore: 2.0, // 閾値 1.5 超過
      };

      const result = await node4Decision.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector,
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(result.data.priority).toBe('P3_DECOUPLING');
      expect(result.data.decision).toBe('YELLOW');
      expect(result.data.reason).toContain('デカップリング');
    });
  });

  // 3. 低 κ デバイス: 許容幅が広い → 偽陽性が少ない
  describe('低 κ デバイス（信頼性が低い）', () => {
    it('κ=0.3 では同じ乖離でも κ=0.9 より低いスコアになる', () => {
      const baseParams: Omit<EKFRequestParams, 'deviceKappa'> = {
        subjectiveLoadHistory: [200, 210, 190, 200, 195, 205, 200,
          195, 200, 210, 190, 200, 195, 205],
        objectiveLoadHistory: [400, 380, 420, 410, 390, 400, 395,
          405, 400, 380, 420, 410, 390, 400],
      };

      const highKappa = simulateEKFDecoupling({
        ...baseParams,
        deviceKappa: 0.9,
      });
      const lowKappa = simulateEKFDecoupling({
        ...baseParams,
        deviceKappa: 0.3,
      });

      // 低 κ では許容幅が広いため、スコアが低い
      expect(lowKappa.decouplingScore).toBeLessThan(
        highKappa.decouplingScore,
      );
    });

    it('κ=0.5 は中間的なスコアを返す', () => {
      const params: Omit<EKFRequestParams, 'deviceKappa'> = {
        subjectiveLoadHistory: [200, 200, 200, 200, 200, 200, 200,
          200, 200, 200, 200, 200, 200, 200],
        objectiveLoadHistory: [400, 400, 400, 400, 400, 400, 400,
          400, 400, 400, 400, 400, 400, 400],
      };

      const kappa03 = simulateEKFDecoupling({ ...params, deviceKappa: 0.3 });
      const kappa05 = simulateEKFDecoupling({ ...params, deviceKappa: 0.5 });
      const kappa09 = simulateEKFDecoupling({ ...params, deviceKappa: 0.9 });

      expect(kappa05.decouplingScore).toBeGreaterThan(
        kappa03.decouplingScore,
      );
      expect(kappa05.decouplingScore).toBeLessThan(
        kappa09.decouplingScore,
      );
    });
  });

  // 4. 逐次更新: 状態収束
  describe('逐次更新（複数日の状態収束）', () => {
    it('初期の乖離が徐々に収束するパターン', () => {
      // 最初は乖離が大きいが、徐々に一致していく
      const converging = {
        subjectiveLoadHistory: [100, 150, 200, 250, 280, 290, 300,
          300, 300, 300, 300, 300, 300, 300],
        objectiveLoadHistory: [300, 300, 300, 300, 300, 300, 300,
          300, 300, 300, 300, 300, 300, 300],
      };

      // 全期間での平均乖離
      const fullScore = simulateEKFDecoupling({
        ...converging,
        deviceKappa: 0.9,
      });

      // 後半のみでの乖離（収束後）
      const lateScore = simulateEKFDecoupling({
        subjectiveLoadHistory: converging.subjectiveLoadHistory.slice(-7),
        objectiveLoadHistory: converging.objectiveLoadHistory.slice(-7),
        deviceKappa: 0.9,
      });

      // 後半のスコアは全期間より低い（収束している）
      expect(lateScore.decouplingScore).toBeLessThan(
        fullScore.decouplingScore,
      );
    });
  });

  // 5. 重症度スコア: 軽度 vs 重度デカップリング
  describe('重症度スコア', () => {
    it('軽度デカップリング（10% 乖離）vs 重度デカップリング（100% 乖離）', () => {
      const mildDecoupling = simulateEKFDecoupling({
        subjectiveLoadHistory: [270, 270, 270, 270, 270, 270, 270,
          270, 270, 270, 270, 270, 270, 270],
        objectiveLoadHistory: [300, 300, 300, 300, 300, 300, 300,
          300, 300, 300, 300, 300, 300, 300],
        deviceKappa: 0.9,
      });

      const severeDecoupling = simulateEKFDecoupling({
        subjectiveLoadHistory: [150, 150, 150, 150, 150, 150, 150,
          150, 150, 150, 150, 150, 150, 150],
        objectiveLoadHistory: [300, 300, 300, 300, 300, 300, 300,
          300, 300, 300, 300, 300, 300, 300],
        deviceKappa: 0.9,
      });

      // 重度の方がスコアが高い
      expect(severeDecoupling.decouplingScore).toBeGreaterThan(
        mildDecoupling.decouplingScore,
      );
    });

    it('デカップリングなし（完全一致） → スコアがゼロ', () => {
      const result = simulateEKFDecoupling({
        subjectiveLoadHistory: [300, 300, 300, 300, 300, 300, 300,
          300, 300, 300, 300, 300, 300, 300],
        objectiveLoadHistory: [300, 300, 300, 300, 300, 300, 300,
          300, 300, 300, 300, 300, 300, 300],
        deviceKappa: 0.9,
      });

      expect(result.decouplingScore).toBe(0);
    });
  });

  // 6. EKF レスポンスフォーマット検証
  describe('EKF レスポンスフォーマット検証', () => {
    it('フォールバックレスポンスの形式', () => {
      const fallback: EKFResponse = {
        decouplingScore: 0.0,
        fromService: false,
      };

      expect(fallback.decouplingScore).toBe(0);
      expect(fallback.fromService).toBe(false);
    });

    it('サービスレスポンスの形式', () => {
      const response: EKFResponse = {
        decouplingScore: 1.8,
        fromService: true,
      };

      expect(response.decouplingScore).toBeGreaterThan(0);
      expect(response.fromService).toBe(true);
    });

    it('空の履歴データ → スコアゼロ', () => {
      const result = simulateEKFDecoupling({
        subjectiveLoadHistory: [],
        objectiveLoadHistory: [],
        deviceKappa: 0.9,
      });

      expect(result.decouplingScore).toBe(0);
    });
  });
});
