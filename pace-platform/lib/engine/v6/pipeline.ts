/**
 * PACE v6.0 推論パイプライン — メインオーケストレーター
 *
 * 6層ノード・パイプライン（Node 0〜5）を順次実行し、
 * 選手のコンディショニング判定を生成する。
 *
 * 各ノードは前段の出力を受け取り、次段へ渡す。
 * ノード障害時は保守的推定（フォールバック）を採用し、
 * パイプライン全体の停止を防ぐ。
 */

import type {
  AthleteContext,
  DailyInput,
  DataQualityReport,
  DecisionOutput,
  FeatureVector,
  InferenceDecision,
  InferenceOutput,
  InferencePriority,
  NodeExecutor,
  NodeId,
  NodeResult,
  PipelineConfig,
  PipelineOutput,
  InferenceTraceLog,
} from './types';
import { DEFAULT_PIPELINE_CONFIG, PIPELINE_VERSION } from './config';

// ---------------------------------------------------------------------------
// UUID 生成（ブラウザ/Node.js 両対応）
// ---------------------------------------------------------------------------

/**
 * トレースID用のUUID v4を生成する。
 * crypto.randomUUID() が利用できない環境ではフォールバック実装を使用。
 */
function generateTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // フォールバック: RFC 4122 v4 互換
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// 保守的フォールバック値
// ---------------------------------------------------------------------------

/** データ品質レポートのフォールバック（最悪ケース想定） */
const FALLBACK_DATA_QUALITY: DataQualityReport = {
  qualityScore: 0,
  totalFields: 0,
  validFields: 0,
  imputedFields: [],
  outlierFields: [],
  maturationMode: 'safety',
};

/** 特徴量ベクトルのフォールバック（ゼロ初期化） */
const FALLBACK_FEATURE_VECTOR: FeatureVector = {
  acwr: 0,
  monotonyIndex: 0,
  preparedness: 0,
  tissueDamage: {
    metabolic: 0,
    structural_soft: 0,
    structural_hard: 0,
    neuromotor: 0,
  },
  zScores: {},
};

/** 推論結果のフォールバック（空） */
const FALLBACK_INFERENCE: InferenceOutput = {
  riskScores: {},
  posteriorProbabilities: {},
  confidenceIntervals: {},
};

/** 判定結果のフォールバック（保守的 = ORANGE） */
const FALLBACK_DECISION: DecisionOutput = {
  decision: 'ORANGE',
  priority: 'P1_SAFETY',
  reason: 'パイプライン障害のため保守的判定を適用',
  reasonEn: 'Conservative decision applied due to pipeline failure',
  overridesApplied: ['pipeline_fallback'],
  recommendedActions: [
    {
      actionType: 'medical_review',
      description: 'パイプライン障害のためメディカルスタッフによる確認を推奨',
      priority: 'high',
      requiresApproval: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// パイプライン本体
// ---------------------------------------------------------------------------

/**
 * v6.0 推論パイプライン。
 *
 * Node 0（取り込み）〜 Node 5（プレゼンテーション）を順次実行し、
 * 選手のリスク判定とトレースログを生成する。
 *
 * @example
 * ```ts
 * const pipeline = new InferencePipeline();
 * pipeline.registerNode(node0Ingestion);
 * pipeline.registerNode(node1Cleaning);
 * // ... Node 2〜5 を登録
 * const output = await pipeline.execute(dailyInput, athleteContext);
 * ```
 */
export class InferencePipeline {
  private readonly nodes: Map<NodeId, NodeExecutor> = new Map();
  private readonly config: PipelineConfig;

  /** 実行順序（Node 0 から Node 5 まで） */
  private static readonly EXECUTION_ORDER: readonly NodeId[] = [
    'node0_ingestion',
    'node1_cleaning',
    'node2_feature',
    'node3_inference',
    'node4_decision',
    'node5_presentation',
  ] as const;

  /**
   * パイプラインを初期化する。
   *
   * @param configOverrides - デフォルト設定をオーバーライドする部分設定
   */
  constructor(configOverrides?: Partial<PipelineConfig>) {
    this.config = configOverrides
      ? { ...DEFAULT_PIPELINE_CONFIG, ...configOverrides }
      : DEFAULT_PIPELINE_CONFIG;
  }

  /**
   * ノード実行モジュールを登録する。
   * 同じ nodeId で再登録した場合は上書きされる。
   *
   * @param executor - 登録するノード実行モジュール
   */
  registerNode(executor: NodeExecutor): void {
    this.nodes.set(executor.nodeId, executor);
  }

  /**
   * 登録済みノードを取得する。
   *
   * @param nodeId - 取得するノードID
   * @returns 登録済みの NodeExecutor、未登録の場合は undefined
   */
  getNode(nodeId: NodeId): NodeExecutor | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * パイプラインを実行する。
   *
   * 登録済みの全ノードを Node 0 → Node 5 の順に実行し、
   * 各ノードの出力を次のノードへ渡す。
   * ノード障害時は保守的フォールバックを適用してパイプライン実行を継続する。
   *
   * @param input - 日次入力データ
   * @param context - 選手コンテキスト
   * @returns パイプライン最終出力
   */
  async execute(
    input: DailyInput,
    context: AthleteContext,
  ): Promise<PipelineOutput> {
    const traceId = generateTraceId();
    const timestamp = new Date().toISOString();
    const nodeResults: Record<
      NodeId,
      { success: boolean; executionTimeMs: number; warnings: string[] }
    > = {} as Record<
      NodeId,
      { success: boolean; executionTimeMs: number; warnings: string[] }
    >;

    let currentData: unknown = input;
    let dataQuality: DataQualityReport = FALLBACK_DATA_QUALITY;
    let featureVector: FeatureVector = FALLBACK_FEATURE_VECTOR;
    let inference: InferenceOutput = FALLBACK_INFERENCE;
    let decision: DecisionOutput = FALLBACK_DECISION;
    const allWarnings: string[] = [];

    for (const nodeId of InferencePipeline.EXECUTION_ORDER) {
      const executor = this.nodes.get(nodeId);

      if (!executor) {
        // 未登録ノードはスキップし、警告を記録
        const skipWarning = `ノード ${nodeId} が未登録のためスキップ`;
        allWarnings.push(skipWarning);
        nodeResults[nodeId] = {
          success: false,
          executionTimeMs: 0,
          warnings: [skipWarning],
        };
        continue;
      }

      const startMs = performance.now();
      let result: NodeResult;

      try {
        result = await executor.execute(currentData, context, this.config);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const failWarning = `ノード ${nodeId} で例外発生: ${errorMessage}`;
        allWarnings.push(failWarning);

        result = {
          nodeId,
          success: false,
          executionTimeMs: performance.now() - startMs,
          data: null,
          warnings: [failWarning],
          error: errorMessage,
        };
      }

      nodeResults[nodeId] = {
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        warnings: result.warnings,
      };

      if (result.warnings.length > 0) {
        allWarnings.push(...result.warnings);
      }

      // 成功時はデータを次段へ渡す
      if (result.success && result.data !== null) {
        currentData = result.data;

        // 各ノードの出力を型別に保持
        switch (nodeId) {
          case 'node1_cleaning':
            dataQuality =
              (result.data as { dataQuality?: DataQualityReport })
                .dataQuality ?? dataQuality;
            break;
          case 'node2_feature':
            featureVector = result.data as FeatureVector;
            break;
          case 'node3_inference':
            inference = result.data as InferenceOutput;
            break;
          case 'node4_decision':
            decision = result.data as DecisionOutput;
            break;
        }
      }
    }

    return {
      traceId,
      athleteId: context.athleteId,
      timestamp,
      decision,
      featureVector,
      inference,
      dataQuality,
      pipelineVersion: PIPELINE_VERSION,
    };
  }

  /**
   * パイプライン実行結果からトレースログを生成する。
   *
   * @param input - 日次入力データ
   * @param context - 選手コンテキスト
   * @param output - パイプライン出力
   * @param nodeResults - 各ノードの実行結果
   * @returns DB 保存用の推論トレースログ
   */
  static buildTraceLog(
    input: DailyInput,
    context: AthleteContext,
    output: PipelineOutput,
    nodeResults: Record<
      NodeId,
      { success: boolean; executionTimeMs: number; warnings: string[] }
    >,
  ): InferenceTraceLog {
    return {
      traceId: output.traceId,
      athleteId: context.athleteId,
      orgId: context.orgId,
      timestampUtc: output.timestamp,
      pipelineVersion: PIPELINE_VERSION,
      inferenceSnapshot: {
        inputs: input,
        appliedConstants: {},
        calculatedMetrics: output.featureVector,
        bayesianComputation: output.inference,
        triggeredRule: output.decision.priority,
        decision: output.decision.decision,
        decisionReason: output.decision.reason,
        overridesApplied: output.decision.overridesApplied,
        nodeResults,
      },
    };
  }

  /**
   * 現在のパイプライン設定を取得する。
   */
  getConfig(): PipelineConfig {
    return this.config;
  }
}
