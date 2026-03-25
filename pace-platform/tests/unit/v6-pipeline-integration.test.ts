/**
 * tests/unit/v6-pipeline-integration.test.ts
 * ============================================================
 * PACE v6.0 — E2E パイプライン統合テスト
 *
 * Node 0（取り込み）→ Node 5（プレゼンテーション）の全パイプラインを
 * 通して実行し、各種シナリオでの判定結果を検証する。
 *
 * 外部サービス（ODE/EKF Python ゲートウェイ）はモック化し、
 * パイプライン内部ロジックのみをテスト対象とする。
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  ContextFlags,
  InferenceTraceLog,
  PipelineOutput,
  NodeId,
} from '../../lib/engine/v6/types';
import { InferencePipeline } from '../../lib/engine/v6/pipeline';
import { node0Ingestion } from '../../lib/engine/v6/nodes/node0-ingestion';
import { node1Cleaning } from '../../lib/engine/v6/nodes/node1-cleaning';
import { node2FeatureEngineering } from '../../lib/engine/v6/nodes/node2-feature-engineering';
import { node3Inference } from '../../lib/engine/v6/nodes/node3-inference';
import { node4Decision } from '../../lib/engine/v6/nodes/node4-decision';
import { node5Presentation } from '../../lib/engine/v6/nodes/node5-presentation';
import { callODEEngine } from '../../lib/engine/v6/gateway';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/** デフォルトのコンテキストフラグ */
function createDefaultFlags(overrides?: Partial<ContextFlags>): ContextFlags {
  return {
    isGameDay: false,
    isGameDayMinus1: false,
    isAcclimatization: false,
    isWeightMaking: false,
    isPostVaccination: false,
    isPostFever: false,
    ...overrides,
  };
}

/** テスト用 AthleteContext を生成する */
function createMockAthleteContext(
  overrides?: Partial<AthleteContext>,
): AthleteContext {
  return {
    athleteId: 'athlete-001',
    orgId: 'org-001',
    teamId: 'team-001',
    age: 25,
    sport: 'soccer',
    isContactSport: true,
    validDataDays: 30,
    bayesianPriors: {
      knee: 0.1,
      ankle: 0.08,
      hip: 0.05,
      shoulder: 0.04,
      lower_back: 0.06,
      hamstring: 0.12,
      quadriceps: 0.08,
      calf: 0.07,
      general: 0.05,
    },
    riskMultipliers: {},
    medicalHistory: [],
    tissueHalfLifes: {
      metabolic: 2,
      structural_soft: 7,
      structural_hard: 21,
      neuromotor: 3,
    },
    ...overrides,
  };
}

/** テスト用 DailyInput を生成する */
function createMockDailyInput(
  overrides?: Partial<DailyInput>,
): DailyInput {
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
    contextFlags: createDefaultFlags(),
    localTimezone: 'Asia/Tokyo',
    ...overrides,
  };
}

/** N日分の負荷履歴を生成する */
function createLoadHistory(
  days: number,
  avgLoad: number,
  variance = 0,
): DailyInput[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(2025, 5, 15 - days + i);
    const dateStr = date.toISOString().split('T')[0]!;
    const load = avgLoad + (variance > 0 ? (Math.random() - 0.5) * 2 * variance : 0);
    const sRPE = 4;
    const duration = load / sRPE;
    return createMockDailyInput({
      date: dateStr,
      sRPE,
      trainingDurationMin: duration,
      sessionLoad: load,
    });
  });
}

/** パイプラインを全ノード登録済みで作成する */
function createFullPipeline(): InferencePipeline {
  const pipeline = new InferencePipeline();
  pipeline.registerNode(node0Ingestion);
  pipeline.registerNode(node1Cleaning);
  pipeline.registerNode(node2FeatureEngineering);
  pipeline.registerNode(node3Inference);
  pipeline.registerNode(node4Decision);
  pipeline.registerNode(node5Presentation);
  return pipeline;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('v6.0 パイプライン統合テスト', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // デフォルト ODE モックをリセット
    vi.mocked(callODEEngine).mockResolvedValue({
      damage: 0.2,
      criticalDamage: 1.0,
      fromService: false,
    });
  });

  // -----------------------------------------------------------------------
  // 1. 正常系: GREEN 判定
  // -----------------------------------------------------------------------
  describe('正常系: GREEN 判定', () => {
    it('健康な選手が通常のsRPEで良好な睡眠 → P5_NORMAL, GREEN（Node 4 直接テスト）', async () => {
      // パイプラインの execute() は Node 2 が history を必要とするため、
      // GREEN 判定はノード単体での検証が適切
      const context = createMockAthleteContext();
      const input = createMockDailyInput();
      const config = new InferencePipeline().getConfig();

      const result = await node4Decision.execute(
        {
          inference: {
            riskScores: { general: 0.1 },
            posteriorProbabilities: { general: 0.05 },
            confidenceIntervals: { general: [0.02, 0.08] as [number, number] },
          },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 30,
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: { sleepQuality: 0.5, fatigue: 0.3 },
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(result.data.decision).toBe('GREEN');
      expect(result.data.priority).toBe('P5_NORMAL');
    });

    it('パイプライン execute() の基本出力構造を検証する', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput();

      const result = await pipeline.execute(input, context);

      // パイプライン出力の基本構造が存在する
      expect(result.pipelineVersion).toBe('v6.0');
      expect(result.athleteId).toBe('athlete-001');
      expect(result.traceId).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
      expect(result.decision).toBeDefined();
      expect(result.featureVector).toBeDefined();
      expect(result.dataQuality).toBeDefined();
    });

    it('GREEN判定時に推奨アクションに「continue」が含まれる', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput();
      const config = new InferencePipeline().getConfig();

      const result = await node4Decision.execute(
        {
          inference: { riskScores: {}, posteriorProbabilities: {}, confidenceIntervals: {} },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 30,
            tissueDamage: { metabolic: 0.1, structural_soft: 0.1, structural_hard: 0.1, neuromotor: 0.1 },
            zScores: {},
          },
          cleanedInput: input,
        },
        context,
        config,
      );

      expect(result.data.recommendedActions).toHaveLength(1);
      expect(result.data.recommendedActions[0]!.actionType).toBe('continue');
    });
  });

  // -----------------------------------------------------------------------
  // 2. P1: 痛み ≥ 8
  // -----------------------------------------------------------------------
  describe('P1: 痛み閾値超過', () => {
    it('painNRS = 9 → P1_SAFETY, RED, 理由に「痛み」を含む', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 9,
        },
      });

      const result = await pipeline.execute(input, context);

      expect(result.decision.decision).toBe('RED');
      expect(result.decision.priority).toBe('P1_SAFETY');
      expect(result.decision.reason).toContain('痛み');
    });

    it('painNRS = 8（ちょうど閾値）→ P1_SAFETY, RED', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 8,
        },
      });

      const result = await pipeline.execute(input, context);

      expect(result.decision.decision).toBe('RED');
      expect(result.decision.priority).toBe('P1_SAFETY');
    });
  });

  // -----------------------------------------------------------------------
  // 3. P1: ワクチン接種後
  // -----------------------------------------------------------------------
  describe('P1: ワクチン接種後', () => {
    it('postVaccination フラグ → P1_SAFETY, RED', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        contextFlags: createDefaultFlags({ isPostVaccination: true }),
      });

      const result = await pipeline.execute(input, context);

      expect(result.decision.decision).toBe('RED');
      expect(result.decision.priority).toBe('P1_SAFETY');
      expect(result.decision.reason).toContain('ワクチン');
    });

    it('postFever フラグ → P1_SAFETY, RED', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        contextFlags: createDefaultFlags({ isPostFever: true }),
      });

      const result = await pipeline.execute(input, context);

      expect(result.decision.decision).toBe('RED');
      expect(result.decision.priority).toBe('P1_SAFETY');
      expect(result.decision.reason).toContain('発熱');
    });
  });

  // -----------------------------------------------------------------------
  // 4. P2: ACWR 超過
  // -----------------------------------------------------------------------
  describe('P2: ACWR 超過', () => {
    it('急激な負荷スパイク → P2_MECHANICAL_RISK, ORANGE', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();

      // 28日分の低負荷 → 当日に急激な負荷
      const history = createLoadHistory(28, 100); // 低い平均負荷
      const todayInput = createMockDailyInput({
        sRPE: 9,
        trainingDurationMin: 120,
        sessionLoad: 1080, // 急激なスパイク
      });

      // Node 2 に履歴を渡すため、パイプラインを直接使うのではなく
      // 各ノードを手動実行する
      // ただしパイプラインのexecuteは履歴を渡す仕組みがないため、
      // Node 4 の直接テストで ACWR 超過を検証
      const { node4Decision: node4 } = await import(
        '../../lib/engine/v6/nodes/node4-decision'
      );

      const decisionResult = await node4.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector: {
            acwr: 2.0, // ACWR > 1.5
            monotonyIndex: 1.0,
            preparedness: 10,
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: {},
          },
          cleanedInput: todayInput,
        },
        context,
        pipeline.getConfig(),
      );

      expect(decisionResult.success).toBe(true);
      expect(decisionResult.data.decision).toBe('ORANGE');
      expect(decisionResult.data.priority).toBe('P2_MECHANICAL_RISK');
      expect(decisionResult.data.reason).toContain('ACWR');
    });
  });

  // -----------------------------------------------------------------------
  // 5. P2: Monotony 高値
  // -----------------------------------------------------------------------
  describe('P2: Monotony 高値', () => {
    it('7日間同一負荷 → 単調性超過で P2_MECHANICAL_RISK', async () => {
      const context = createMockAthleteContext();
      const todayInput = createMockDailyInput();

      const decisionResult = await node4Decision.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 3.0, // Monotony > 2.0
            preparedness: 10,
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: {},
          },
          cleanedInput: todayInput,
        },
        context,
        new InferencePipeline().getConfig(),
      );

      expect(decisionResult.success).toBe(true);
      expect(decisionResult.data.decision).toBe('ORANGE');
      expect(decisionResult.data.priority).toBe('P2_MECHANICAL_RISK');
      expect(decisionResult.data.reason).toContain('単調性');
    });
  });

  // -----------------------------------------------------------------------
  // 6. P4: GAS 疲憊期
  // -----------------------------------------------------------------------
  describe('P4: GAS 疲憊期', () => {
    it('複数のZ-Score ≤ -1.5 → P4_GAS_EXHAUSTION, YELLOW', async () => {
      const context = createMockAthleteContext();
      const todayInput = createMockDailyInput();

      const decisionResult = await node4Decision.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 5,
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: {
              sleepQuality: -2.0,
              fatigue: -1.8,
              mood: -1.6,
            },
          },
          cleanedInput: todayInput,
        },
        context,
        new InferencePipeline().getConfig(),
      );

      expect(decisionResult.success).toBe(true);
      expect(decisionResult.data.decision).toBe('YELLOW');
      expect(decisionResult.data.priority).toBe('P4_GAS_EXHAUSTION');
      expect(decisionResult.data.reason).toContain('疲憊');
    });
  });

  // -----------------------------------------------------------------------
  // 7. P5: Preparedness 正常
  // -----------------------------------------------------------------------
  describe('P5: Preparedness 正常', () => {
    it('バランスの取れた負荷 → P5_NORMAL, GREEN', async () => {
      const context = createMockAthleteContext();
      const todayInput = createMockDailyInput();

      const decisionResult = await node4Decision.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 50, // 正のプレパレッドネス
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: {
              sleepQuality: 0.5,
              fatigue: 0.3,
            },
          },
          cleanedInput: todayInput,
        },
        context,
        new InferencePipeline().getConfig(),
      );

      expect(decisionResult.data.decision).toBe('GREEN');
      expect(decisionResult.data.priority).toBe('P5_NORMAL');
      expect(decisionResult.data.reason).toContain('良好');
    });
  });

  // -----------------------------------------------------------------------
  // 8. コンテキスト・オーバーライド: GameDay
  // -----------------------------------------------------------------------
  describe('コンテキスト・オーバーライド: GameDay', () => {
    it('試合日は P4 閾値が緩和され、2項目 Z ≤ -1.5 では発火しない', async () => {
      const context = createMockAthleteContext();
      const todayInput = createMockDailyInput({
        contextFlags: createDefaultFlags({ isGameDay: true }),
      });

      // 通常なら P4 発火する条件（Z ≤ -1.5 が2項目）
      const decisionResult = await node4Decision.execute(
        {
          inference: {
            riskScores: {},
            posteriorProbabilities: {},
            confidenceIntervals: {},
          },
          featureVector: {
            acwr: 1.0,
            monotonyIndex: 1.0,
            preparedness: 5,
            tissueDamage: {
              metabolic: 0.1,
              structural_soft: 0.1,
              structural_hard: 0.1,
              neuromotor: 0.1,
            },
            zScores: {
              sleepQuality: -1.8,
              fatigue: -1.6,
            },
          },
          cleanedInput: todayInput,
        },
        context,
        new InferencePipeline().getConfig(),
      );

      // 試合日: 閾値が -2.0 に、必要項目数が 3 に → P4 不発火
      expect(decisionResult.data.priority).not.toBe('P4_GAS_EXHAUSTION');
      expect(decisionResult.data.overridesApplied).toContain('game_day');
    });
  });

  // -----------------------------------------------------------------------
  // 9. フォールバック: ノード障害時
  // -----------------------------------------------------------------------
  describe('フォールバック: ノード障害時', () => {
    it('ノード未登録の場合、保守的な ORANGE 判定を返す', async () => {
      const pipeline = new InferencePipeline();
      // ノードを一つも登録しない
      const context = createMockAthleteContext();
      const input = createMockDailyInput();

      const result = await pipeline.execute(input, context);

      // フォールバックの ORANGE 判定
      expect(result.decision.decision).toBe('ORANGE');
      expect(result.decision.priority).toBe('P1_SAFETY');
      expect(result.decision.reason).toContain('パイプライン障害');
    });
  });

  // -----------------------------------------------------------------------
  // 10. トレースログ生成
  // -----------------------------------------------------------------------
  describe('トレースログ生成', () => {
    it('InferenceTraceLog の必須フィールドが全て存在する', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput();
      const pipeline = createFullPipeline();

      const output = await pipeline.execute(input, context);

      // buildTraceLog で生成可能か検証
      const nodeResults = {} as Record<
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
        nodeResults[nodeId] = {
          success: true,
          executionTimeMs: 1,
          warnings: [],
        };
      }

      const traceLog = InferencePipeline.buildTraceLog(
        input,
        context,
        output,
        nodeResults,
      );

      // 必須フィールド検証
      expect(traceLog.traceId).toBeTruthy();
      expect(traceLog.athleteId).toBe('athlete-001');
      expect(traceLog.orgId).toBe('org-001');
      expect(traceLog.timestampUtc).toBeTruthy();
      expect(traceLog.pipelineVersion).toBe('v6.0');
      expect(traceLog.inferenceSnapshot).toBeDefined();
      expect(traceLog.inferenceSnapshot.inputs).toBeDefined();
      expect(traceLog.inferenceSnapshot.appliedConstants).toBeDefined();
      expect(traceLog.inferenceSnapshot.calculatedMetrics).toBeDefined();
      expect(traceLog.inferenceSnapshot.bayesianComputation).toBeDefined();
      expect(traceLog.inferenceSnapshot.triggeredRule).toBeDefined();
      expect(traceLog.inferenceSnapshot.decision).toBeDefined();
      expect(traceLog.inferenceSnapshot.decisionReason).toBeTruthy();
      expect(traceLog.inferenceSnapshot.nodeResults).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 11. Node 1: 外れ値検出
  // -----------------------------------------------------------------------
  describe('Node 1: 外れ値検出', () => {
    it('restingHeartRate = 300 → 外れ値としてフラグされる', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 1,
          restingHeartRate: 300,
        },
      });

      // Node 0 実行
      const node0Result = await node0Ingestion.execute(
        input,
        context,
        new InferencePipeline().getConfig(),
      );
      expect(node0Result.success).toBe(true);

      // Node 1 実行
      const node1Result = await node1Cleaning.execute(
        node0Result.data,
        context,
        new InferencePipeline().getConfig(),
      );

      expect(node1Result.success).toBe(true);
      // restingHeartRate の上限は 250 なので 300 は外れ値
      expect(node1Result.data.dataQuality.outlierFields).toContain(
        'restingHeartRate',
      );
    });
  });

  // -----------------------------------------------------------------------
  // 12. Node 1: 成熟度ルーティング
  // -----------------------------------------------------------------------
  describe('Node 1: 成熟度ルーティング', () => {
    it('validDataDays=5 → safety モード', async () => {
      const context = createMockAthleteContext({ validDataDays: 5 });
      const input = createMockDailyInput();

      const node0Result = await node0Ingestion.execute(
        input,
        context,
        new InferencePipeline().getConfig(),
      );
      const node1Result = await node1Cleaning.execute(
        node0Result.data,
        context,
        new InferencePipeline().getConfig(),
      );

      expect(node1Result.data.dataQuality.maturationMode).toBe('safety');
    });

    it('validDataDays=20 → learning モード', async () => {
      const context = createMockAthleteContext({ validDataDays: 20 });
      const input = createMockDailyInput();

      const node0Result = await node0Ingestion.execute(
        input,
        context,
        new InferencePipeline().getConfig(),
      );
      const node1Result = await node1Cleaning.execute(
        node0Result.data,
        context,
        new InferencePipeline().getConfig(),
      );

      expect(node1Result.data.dataQuality.maturationMode).toBe('learning');
    });

    it('validDataDays=30 → full モード', async () => {
      const context = createMockAthleteContext({ validDataDays: 30 });
      const input = createMockDailyInput();

      const node0Result = await node0Ingestion.execute(
        input,
        context,
        new InferencePipeline().getConfig(),
      );
      const node1Result = await node1Cleaning.execute(
        node0Result.data,
        context,
        new InferencePipeline().getConfig(),
      );

      expect(node1Result.data.dataQuality.maturationMode).toBe('full');
    });
  });

  // -----------------------------------------------------------------------
  // 13. データ品質スコア
  // -----------------------------------------------------------------------
  describe('データ品質スコア', () => {
    it('全フィールド正常 → 品質スコアが 1.0 に近い', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 1,
          restingHeartRate: 65,
        },
        objectiveLoad: {
          distanceKm: 8.5,
          playerLoad: 450,
          deviceKappa: 0.9,
        },
      });

      const node0Result = await node0Ingestion.execute(
        input,
        context,
        new InferencePipeline().getConfig(),
      );
      const node1Result = await node1Cleaning.execute(
        node0Result.data,
        context,
        new InferencePipeline().getConfig(),
      );

      expect(node1Result.data.dataQuality.qualityScore).toBeGreaterThanOrEqual(
        0.9,
      );
    });

    it('外れ値がある場合 → 品質スコアが低下する', async () => {
      const context = createMockAthleteContext();
      const inputGood = createMockDailyInput();
      const inputBad = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 1,
          restingHeartRate: 300, // outlier
        },
      });

      const config = new InferencePipeline().getConfig();
      const n0Good = await node0Ingestion.execute(inputGood, context, config);
      const n1Good = await node1Cleaning.execute(n0Good.data, context, config);

      const n0Bad = await node0Ingestion.execute(inputBad, context, config);
      const n1Bad = await node1Cleaning.execute(n0Bad.data, context, config);

      expect(n1Bad.data.dataQuality.qualityScore).toBeLessThan(
        n1Good.data.dataQuality.qualityScore,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 追加テスト: P1 推奨アクション
  // -----------------------------------------------------------------------
  describe('P1 推奨アクション', () => {
    it('P1 判定時は requiresApproval=true のアクションが含まれる', async () => {
      const pipeline = createFullPipeline();
      const context = createMockAthleteContext();
      const input = createMockDailyInput({
        subjectiveScores: {
          sleepQuality: 8,
          fatigue: 3,
          mood: 7,
          muscleSoreness: 2,
          stressLevel: 3,
          painNRS: 9,
        },
      });

      const result = await pipeline.execute(input, context);

      const approvalActions = result.decision.recommendedActions.filter(
        (a) => a.requiresApproval,
      );
      expect(approvalActions.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Node 0: sRPE クランプ
  // -----------------------------------------------------------------------
  describe('Node 0: 入力正規化', () => {
    it('sRPE > 10 はクランプされる', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput({ sRPE: 15 });
      const config = new InferencePipeline().getConfig();

      const result = await node0Ingestion.execute(input, context, config);
      expect(result.success).toBe(true);
      expect(result.data.normalizedInput.sRPE).toBe(10);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('トレーニング時間が負の場合は 0 にクランプ', async () => {
      const context = createMockAthleteContext();
      const input = createMockDailyInput({ trainingDurationMin: -30 });
      const config = new InferencePipeline().getConfig();

      const result = await node0Ingestion.execute(input, context, config);
      expect(result.data.normalizedInput.trainingDurationMin).toBe(0);
    });
  });
});
