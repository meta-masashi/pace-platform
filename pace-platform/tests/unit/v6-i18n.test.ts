/**
 * tests/unit/v6-i18n.test.ts
 * ============================================================
 * PACE v6.0 — i18n（国際化）検証テスト
 *
 * 全ユーザー向けテキストが日本語で出力されることを検証する。
 *
 * 検証項目:
 *   1. Node 4 判定理由が日本語を含む
 *   2. 推奨アクション説明が日本語
 *   3. 法的免責条項が日本語テキストを含む
 *   4. NLG テンプレート出力が日本語
 *   5. ユーザー向け出力に英語のみの文字列がない（技術ID除外）
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest';

// --- Gateway モック ---
vi.mock('../../lib/engine/v6/gateway', () => ({
  callODEEngine: vi.fn().mockResolvedValue({
    damage: 0.2,
    criticalDamage: 1.0,
    fromService: false,
  }),
  callEKFEngine: vi.fn().mockResolvedValue({
    decouplingScore: 0.0,
    fromService: false,
  }),
}));

import type {
  AthleteContext,
  DailyInput,
  FeatureVector,
  InferenceOutput,
  DecisionOutput,
  DataQualityReport,
  NodeId,
} from '../../lib/engine/v6/types';
import { node4Decision } from '../../lib/engine/v6/nodes/node4-decision';
import {
  node5Presentation,
  LEGAL_DISCLAIMER,
  LEGAL_DISCLAIMER_EN,
} from '../../lib/engine/v6/nodes/node5-presentation';
import type { PresentationInput } from '../../lib/engine/v6/nodes/node5-presentation';
import { InferencePipeline } from '../../lib/engine/v6/pipeline';

// ---------------------------------------------------------------------------
// 日本語検出ヘルパー
// ---------------------------------------------------------------------------

/** 文字列に日本語文字（ひらがな、カタカナ、漢字）が含まれるかを判定する */
function containsJapanese(text: string): boolean {
  // ひらがな: U+3040-U+309F
  // カタカナ: U+30A0-U+30FF
  // 漢字: U+4E00-U+9FFF
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

/** 文字列が英語のみ（ASCII + 数字 + 記号のみ）かを判定する */
function isEnglishOnly(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

function createContext(): AthleteContext {
  return {
    athleteId: 'i18n-athlete-001',
    orgId: 'org-001',
    teamId: 'team-001',
    age: 25,
    sport: 'soccer',
    isContactSport: true,
    validDataDays: 30,
    bayesianPriors: { knee: 0.1, general: 0.05 },
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

function createInput(overrides?: Partial<DailyInput>): DailyInput {
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
    ...overrides,
  };
}

function createNodeResults(): Record<
  NodeId,
  { success: boolean; executionTimeMs: number; warnings: string[] }
> {
  const results = {} as Record<
    NodeId,
    { success: boolean; executionTimeMs: number; warnings: string[] }
  >;
  for (const nodeId of [
    'node0_ingestion',
    'node1_cleaning',
    'node2_feature',
    'node3_inference',
    'node4_decision',
    'node5_presentation',
  ] as NodeId[]) {
    results[nodeId] = { success: true, executionTimeMs: 1, warnings: [] };
  }
  return results;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('v6.0 i18n 検証テスト', () => {
  const config = new InferencePipeline().getConfig();

  // -----------------------------------------------------------------------
  // 1. Node 4 判定理由が日本語を含む
  // -----------------------------------------------------------------------
  describe('Node 4 判定理由の日本語検証', () => {
    it('P1_SAFETY（痛み）の理由が日本語を含む', async () => {
      const context = createContext();
      const input = createInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 9,
        },
      });

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 10,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
      // reasonEn は英語であること
      expect(result.data.reasonEn).toBeTruthy();
    });

    it('P2_MECHANICAL_RISK（ACWR超過）の理由が日本語を含む', async () => {
      const context = createContext();
      const input = createInput();

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 2.0,
            monotonyIndex: 1.0,
            preparedness: 10,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
    });

    it('P4_GAS_EXHAUSTION の理由が日本語を含む', async () => {
      const context = createContext();
      const input = createInput();

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 5,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: { sleepQuality: -2.0, fatigue: -1.8, mood: -1.7 },
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
    });

    it('P5_NORMAL の理由が日本語を含む', async () => {
      const context = createContext();
      const input = createInput();

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 50,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. 推奨アクション説明が日本語
  // -----------------------------------------------------------------------
  describe('推奨アクション説明の日本語検証', () => {
    it('全優先度レベルの推奨アクション説明が日本語', async () => {
      const context = createContext();
      const input = createInput();

      // P1 アクション
      const p1Input = createInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 9,
        },
      });
      const p1Result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0, monotonyIndex: 1.0, preparedness: 10,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: p1Input,
        },
        context,
        config,
      );

      for (const action of p1Result.data.recommendedActions) {
        expect(containsJapanese(action.description)).toBe(true);
      }

      // P5 アクション
      const p5Result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0, monotonyIndex: 1.0, preparedness: 50,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      for (const action of p5Result.data.recommendedActions) {
        expect(containsJapanese(action.description)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. 法的免責条項が日本語テキストを含む
  // -----------------------------------------------------------------------
  describe('法的免責条項の日本語検証', () => {
    it('LEGAL_DISCLAIMER が日本語を含む', () => {
      expect(containsJapanese(LEGAL_DISCLAIMER)).toBe(true);
    });

    it('LEGAL_DISCLAIMER に「PACE」「医学的診断」が含まれる', () => {
      expect(LEGAL_DISCLAIMER).toContain('PACE');
      expect(LEGAL_DISCLAIMER).toContain('医学的診断');
    });

    it('LEGAL_DISCLAIMER_EN が英語のみ', () => {
      expect(isEnglishOnly(LEGAL_DISCLAIMER_EN)).toBe(true);
    });

    it('LEGAL_DISCLAIMER に「メディカルスタッフ」が含まれる', () => {
      expect(LEGAL_DISCLAIMER).toContain('メディカルスタッフ');
    });
  });

  // -----------------------------------------------------------------------
  // 4. NLG テンプレート出力が日本語
  // -----------------------------------------------------------------------
  describe('NLG テンプレート出力の日本語検証', () => {
    it('Node 5 の NLG サマリーが日本語を含む', async () => {
      const context = createContext();

      const presentationInput: PresentationInput = {
        decision: {
          decision: 'GREEN',
          priority: 'P5_NORMAL',
          reason: 'コンディション良好です。計画通りのトレーニングを継続してください。',
          reasonEn: 'Condition is good. Continue with planned training.',
          overridesApplied: [],
          recommendedActions: [
            {
              actionType: 'continue',
              description: '計画通りのトレーニングを継続してください。',
              priority: 'low',
              requiresApproval: false,
            },
          ],
        },
        inference: {
          riskScores: { general: 0.1 },
          posteriorProbabilities: { general: 0.05 },
          confidenceIntervals: { general: [0.02, 0.08] },
        },
        featureVector: {
          acwr: 1.0,
          monotonyIndex: 1.0,
          preparedness: 30,
          tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
          zScores: {},
        },
        dataQuality: {
          qualityScore: 0.95,
          totalFields: 10,
          validFields: 9,
          imputedFields: [],
          outlierFields: [],
          maturationMode: 'full',
        },
        cleanedInput: createInput(),
        nodeResults: createNodeResults(),
      };

      const result = await node5Presentation.execute(
        presentationInput,
        context,
        config,
      );

      expect(result.success).toBe(true);
      const nlg = result.data.nlgSummary;

      // NLG サマリーが日本語を含む
      expect(containsJapanese(nlg)).toBe(true);
      // 判定ラベルが含まれる
      expect(nlg).toContain('コンディション判定');
      // 免責条項が含まれる
      expect(nlg).toContain('PACE');
    });

    it('RED 判定の NLG サマリーが「停止」を含む', async () => {
      const context = createContext();

      const presentationInput: PresentationInput = {
        decision: {
          decision: 'RED',
          priority: 'P1_SAFETY',
          reason: '痛み NRS が 9 で安全閾値（8）以上です。',
          reasonEn: 'Pain NRS is 9.',
          overridesApplied: [],
          recommendedActions: [
            {
              actionType: 'rest',
              description: 'トレーニングを即座に中止してください。',
              priority: 'critical',
              requiresApproval: true,
            },
          ],
        },
        inference: {
          riskScores: {},
          posteriorProbabilities: {},
          confidenceIntervals: {},
        },
        featureVector: {
          acwr: 1.0,
          monotonyIndex: 1.0,
          preparedness: 10,
          tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
          zScores: {},
        },
        dataQuality: {
          qualityScore: 0.9,
          totalFields: 8,
          validFields: 8,
          imputedFields: [],
          outlierFields: [],
          maturationMode: 'full',
        },
        cleanedInput: createInput(),
        nodeResults: createNodeResults(),
      };

      const result = await node5Presentation.execute(
        presentationInput,
        context,
        config,
      );

      expect(result.data.nlgSummary).toContain('停止');
    });
  });

  // -----------------------------------------------------------------------
  // 5. ユーザー向け出力に英語のみの文字列がない
  // -----------------------------------------------------------------------
  describe('ユーザー向け文字列の言語検証', () => {
    it('P3_DECOUPLING の理由が日本語を含む', async () => {
      const context = createContext();
      const input = createInput();

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 10,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
            decouplingScore: 2.0,
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
    });

    it('ワクチン接種後の理由テキストに日本語が含まれる', async () => {
      const context = createContext();
      const input = createInput({
        contextFlags: {
          isGameDay: false,
          isGameDayMinus1: false,
          isAcclimatization: false,
          isWeightMaking: false,
          isPostVaccination: true,
          isPostFever: false,
        },
      });

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0, monotonyIndex: 1.0, preparedness: 10,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(containsJapanese(result.data.reason)).toBe(true);
      expect(result.data.reason).toContain('ワクチン');
    });

    it('オーバーライドラベルは日本語対応している', async () => {
      const context = createContext();
      const input = createInput({
        contextFlags: {
          isGameDay: true,
          isGameDayMinus1: false,
          isAcclimatization: false,
          isWeightMaking: false,
          isPostVaccination: false,
          isPostFever: false,
        },
      });

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0, monotonyIndex: 1.0, preparedness: 50,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(result.data.overridesApplied).toContain('game_day');
    });
  });
});
