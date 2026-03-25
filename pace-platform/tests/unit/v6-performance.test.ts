/**
 * tests/unit/v6-performance.test.ts
 * ============================================================
 * PACE v6.0 — パフォーマンスベンチマークテスト
 *
 * パイプライン処理の実行時間が許容範囲内であることを検証する。
 *
 * ベンチマーク基準:
 *   1. パイプライン全体（Node 0→5）: < 100ms（外部API呼び出しなし）
 *   2. Node 4 判定ロジック: < 5ms
 *   3. 特徴量ベクトル生成: < 20ms
 *   4. 20選手バッチ処理: < 2s
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Gateway モック（即座にレスポンスを返す） ---
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
} from '../../lib/engine/v6/types';
import { InferencePipeline } from '../../lib/engine/v6/pipeline';
import { node0Ingestion } from '../../lib/engine/v6/nodes/node0-ingestion';
import { node1Cleaning } from '../../lib/engine/v6/nodes/node1-cleaning';
import { node2FeatureEngineering } from '../../lib/engine/v6/nodes/node2-feature-engineering';
import { node3Inference } from '../../lib/engine/v6/nodes/node3-inference';
import { node4Decision } from '../../lib/engine/v6/nodes/node4-decision';
import { node5Presentation } from '../../lib/engine/v6/nodes/node5-presentation';
import { callODEEngine, callEKFEngine } from '../../lib/engine/v6/gateway';

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function createContext(overrides?: Partial<AthleteContext>): AthleteContext {
  return {
    athleteId: 'perf-athlete-001',
    orgId: 'org-001',
    teamId: 'team-001',
    age: 25,
    sport: 'soccer',
    isContactSport: true,
    validDataDays: 30,
    bayesianPriors: {
      knee: 0.1,
      ankle: 0.08,
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

function createInput(): DailyInput {
  return {
    date: '2025-06-15',
    sRPE: 5,
    trainingDurationMin: 60,
    sessionLoad: 300,
    subjectiveScores: {
      sleepQuality: 7,
      fatigue: 4,
      mood: 7,
      muscleSoreness: 3,
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

function createPipeline(): InferencePipeline {
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

describe('v6.0 パフォーマンスベンチマーク', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks resets return values, so re-apply them
    vi.mocked(callODEEngine).mockResolvedValue({
      damage: 0.2,
      criticalDamage: 1.0,
      fromService: false,
    });
    vi.mocked(callEKFEngine).mockResolvedValue({
      decouplingScore: 0.0,
      fromService: false,
    });
  });

  // 1. パイプライン全体: < 100ms
  it('パイプライン全体（Node 0→5）が 100ms 以内に完了する', async () => {
    const pipeline = createPipeline();
    const context = createContext();
    const input = createInput();

    // ウォームアップ実行
    await pipeline.execute(input, context);

    // 計測実行
    const startMs = performance.now();
    const result = await pipeline.execute(input, context);
    const elapsedMs = performance.now() - startMs;

    expect(result.decision.decision).toBeTruthy();
    expect(elapsedMs).toBeLessThan(100);
  });

  // 2. Node 4 判定ロジック: < 5ms
  it('Node 4 判定ロジックが 5ms 以内に完了する', async () => {
    const context = createContext();
    const input = createInput();
    const config = new InferencePipeline().getConfig();

    const featureVector: FeatureVector = {
      acwr: 1.2,
      monotonyIndex: 1.5,
      preparedness: 20,
      tissueDamage: {
        metabolic: 0.2,
        structural_soft: 0.15,
        structural_hard: 0.1,
        neuromotor: 0.18,
      },
      zScores: {
        sleepQuality: 0.5,
        fatigue: -0.3,
        mood: 0.2,
        muscleSoreness: -0.5,
      },
    };

    const inference: InferenceOutput = {
      riskScores: { knee: 0.3, ankle: 0.2 },
      posteriorProbabilities: { knee: 0.12, ankle: 0.09 },
      confidenceIntervals: { knee: [0.08, 0.16], ankle: [0.05, 0.13] },
    };

    // ウォームアップ
    await node4Decision.execute(
      { inference, featureVector, cleanedInput: input },
      context,
      config,
    );

    // 計測
    const startMs = performance.now();
    const result = await node4Decision.execute(
      { inference, featureVector, cleanedInput: input },
      context,
      config,
    );
    const elapsedMs = performance.now() - startMs;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(5);
  });

  // 3. 特徴量ベクトル生成（Node 2）: < 20ms
  it('Node 2 特徴量ベクトル生成が 20ms 以内に完了する', async () => {
    const context = createContext();
    const config = new InferencePipeline().getConfig();
    const input = createInput();

    // Node 0 → Node 1 を先に実行
    const n0Result = await node0Ingestion.execute(input, context, config);
    const n1Result = await node1Cleaning.execute(n0Result.data, context, config);

    const node2Input = {
      ...n1Result.data,
      history: [] as DailyInput[],
    };

    // ウォームアップ
    await node2FeatureEngineering.execute(node2Input, context, config);

    // 計測
    const startMs = performance.now();
    const result = await node2FeatureEngineering.execute(
      node2Input,
      context,
      config,
    );
    const elapsedMs = performance.now() - startMs;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(20);
  });

  // 4. 20選手バッチ処理: < 2s
  it('20選手のバッチ処理が 2s 以内に完了する', async () => {
    const pipeline = createPipeline();

    // 20人の選手を生成
    const athletes = Array.from({ length: 20 }, (_, i) => ({
      context: createContext({ athleteId: `batch-athlete-${String(i).padStart(3, '0')}` }),
      input: createInput(),
    }));

    const startMs = performance.now();

    // 全選手を並行処理
    const results = await Promise.all(
      athletes.map(({ context, input }) =>
        pipeline.execute(input, context),
      ),
    );

    const elapsedMs = performance.now() - startMs;

    // 全結果が有効
    expect(results).toHaveLength(20);
    for (const result of results) {
      expect(result.decision.decision).toBeTruthy();
      expect(result.traceId).toBeTruthy();
    }

    expect(elapsedMs).toBeLessThan(2000);
  });

  // 追加: Node 0 + Node 1 の処理時間
  it('Node 0 データ取り込みが 5ms 以内に完了する', async () => {
    const context = createContext();
    const input = createInput();
    const config = new InferencePipeline().getConfig();

    // ウォームアップ
    await node0Ingestion.execute(input, context, config);

    const startMs = performance.now();
    const result = await node0Ingestion.execute(input, context, config);
    const elapsedMs = performance.now() - startMs;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(5);
  });

  it('Node 1 データクリーニングが 5ms 以内に完了する', async () => {
    const context = createContext();
    const input = createInput();
    const config = new InferencePipeline().getConfig();

    const n0Result = await node0Ingestion.execute(input, context, config);

    // ウォームアップ
    await node1Cleaning.execute(n0Result.data, context, config);

    const startMs = performance.now();
    const result = await node1Cleaning.execute(n0Result.data, context, config);
    const elapsedMs = performance.now() - startMs;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(5);
  });

  it('Node 3 推論エンジンが 10ms 以内に完了する', async () => {
    const context = createContext();
    const config = new InferencePipeline().getConfig();

    const featureVector: FeatureVector = {
      acwr: 1.0,
      monotonyIndex: 1.2,
      preparedness: 15,
      tissueDamage: {
        metabolic: 0.2,
        structural_soft: 0.15,
        structural_hard: 0.1,
        neuromotor: 0.18,
      },
      zScores: {
        sleepQuality: 0.3,
        fatigue: -0.5,
      },
    };

    // ウォームアップ
    await node3Inference.execute(featureVector, context, config);

    const startMs = performance.now();
    const result = await node3Inference.execute(featureVector, context, config);
    const elapsedMs = performance.now() - startMs;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(10);
  });
});
