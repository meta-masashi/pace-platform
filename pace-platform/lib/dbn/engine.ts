/**
 * PACE Platform — 動的ベイズネットワーク（DBN）推論エンジン
 *
 * 時間軸方向のリスク遷移を決定論的に推論する。
 * 各タイムスライス（日）について:
 *   1. 前日のリスク値に対して時間減衰を適用
 *   2. 当日のトレーニング負荷による蓄積を加算
 *   3. [0, 1] にクランプ
 *
 * 数理モデル:
 *   risk(t) = risk(t-1) × e^(-λ × Δt) × chronicMod + loadImpact × sRPE / 1000
 *
 * すべて純関数で副作用なし。外部ライブラリ不使用。
 *
 * PRD Phase 3 — Dynamic Bayesian Network Engine
 */

import type {
  TimeSlice,
  NodeState,
  ExternalInputs,
  TransitionModel,
  DBNResult,
  DBNSummary,
} from "./types";
import type { AssessmentNode } from "@/lib/assessment/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスクが安全レベルとみなされる閾値 */
const SAFE_RISK_THRESHOLD = 0.05;

/** sRPE 正規化スケーリング定数 */
const SRPE_SCALING = 1000;

/** デフォルトの負荷蓄積係数 */
const DEFAULT_LOAD_IMPACT_FACTOR = 0.02;

/** デフォルトの半減期（日数） */
const DEFAULT_HALF_LIFE_DAYS = 14;

/** デフォルトの慢性修飾子 */
const DEFAULT_CHRONIC_MODIFIER = 1.0;

// ---------------------------------------------------------------------------
// タイムスライス構築
// ---------------------------------------------------------------------------

/**
 * タイムスライスを構築する。
 *
 * @param date - 日付（YYYY-MM-DD）
 * @param nodeStates - 各ノードの状態マップ
 * @param inputs - 外部入力
 * @returns 構築されたタイムスライス
 */
export function buildTimeSlice(
  date: string,
  nodeStates: Map<string, NodeState>,
  inputs: ExternalInputs
): TimeSlice {
  return {
    date,
    nodeStates,
    externalInputs: inputs,
  };
}

// ---------------------------------------------------------------------------
// 遷移モデル生成
// ---------------------------------------------------------------------------

/**
 * アセスメントノード定義から遷移モデルを生成する。
 *
 * ノードの time_decay_lambda（CSV 由来）と慢性修飾子を
 * 遷移モデルパラメータに変換する。
 *
 * @param nodes - アセスメントノード定義の配列
 * @param chronicModifiers - ノードID → 慢性修飾子のマップ（オプション）
 * @returns 遷移モデルの配列
 */
export function createTransitionModels(
  nodes: AssessmentNode[],
  chronicModifiers?: Map<string, number>
): TransitionModel[] {
  return nodes.map((node) => {
    const lambda =
      node.time_decay_lambda != null && node.time_decay_lambda > 0
        ? node.time_decay_lambda
        : Math.LN2 / DEFAULT_HALF_LIFE_DAYS;

    const halfLife =
      node.time_decay_lambda != null && node.time_decay_lambda > 0
        ? Math.LN2 / node.time_decay_lambda
        : DEFAULT_HALF_LIFE_DAYS;

    const chronicMod =
      chronicModifiers?.get(node.node_id) ?? DEFAULT_CHRONIC_MODIFIER;

    return {
      nodeId: node.node_id,
      loadImpactFactor: DEFAULT_LOAD_IMPACT_FACTOR,
      recoveryLambda: lambda,
      halfLifeDays: halfLife,
      chronicModifier: chronicMod,
    };
  });
}

// ---------------------------------------------------------------------------
// 単一ステップ遷移（t → t+1）
// ---------------------------------------------------------------------------

/**
 * 単一ノードの 1 日遷移を計算する（純関数）。
 *
 * @param prevState - 前日のノード状態
 * @param model - 遷移モデルパラメータ
 * @param inputs - 当日の外部入力
 * @returns 翌日のノード状態
 */
function transitionNodeState(
  prevState: NodeState,
  model: TransitionModel,
  inputs: ExternalInputs
): NodeState {
  // 1. 時間減衰: risk(t-1) × e^(-λ) × chronicMod
  const decayed =
    prevState.risk *
    Math.exp(-model.recoveryLambda) *
    model.chronicModifier;

  // 2. 負荷蓄積: loadImpactFactor × sRPE / 1000
  const srpe = inputs.srpe ?? 0;
  const loadContribution = model.loadImpactFactor * (srpe / SRPE_SCALING);

  // 3. 合算してクランプ
  const rawRisk = decayed + loadContribution;
  const clampedRisk = clamp01(rawRisk);

  // 4. 累積負荷の更新
  const cumulativeLoad = prevState.cumulativeLoad + srpe;

  return {
    nodeId: prevState.nodeId,
    risk: clampedRisk,
    isActive: prevState.isActive || clampedRisk > SAFE_RISK_THRESHOLD,
    decayedRisk: clamp01(decayed),
    cumulativeLoad,
  };
}

// ---------------------------------------------------------------------------
// 順伝播（Forward Propagation）
// ---------------------------------------------------------------------------

/**
 * DBN 順伝播を実行する。
 *
 * 過去の実測タイムスライスから未来を予測する。
 *
 * 手順:
 *   1. 各過去タイムスライスについて、遷移モデルを適用してノード状態を更新
 *   2. 最終タイムスライスを起点に、daysToProject 日分の予測を生成
 *   3. サマリー統計を算出
 *
 * @param historicalSlices - 過去の実測タイムスライス列（日付昇順）
 * @param transitionModels - 遷移モデル配列
 * @param daysToProject - 将来予測日数（デフォルト 14）
 * @returns DBN 推論結果
 */
export function propagateForward(
  historicalSlices: TimeSlice[],
  transitionModels: TransitionModel[],
  daysToProject: number = 14
): DBNResult {
  if (historicalSlices.length === 0) {
    return {
      timeSlices: [],
      projections: [],
      summary: {
        currentOverallRisk: 0,
        projectedRiskAtMatch: 0,
        daysToSafeLevel: 0,
        criticalNodes: [],
      },
    };
  }

  // 遷移モデルの索引（nodeId → TransitionModel）
  const modelMap = new Map<string, TransitionModel>();
  for (const model of transitionModels) {
    modelMap.set(model.nodeId, model);
  }

  // ----- 1. 過去データの遷移計算 -----
  const processedSlices: TimeSlice[] = [];

  // 最初のスライスはそのまま使用（初期状態）
  const firstSlice = historicalSlices[0]!;
  processedSlices.push(firstSlice);

  for (let i = 1; i < historicalSlices.length; i++) {
    const prevSlice = processedSlices[i - 1]!;
    const currentSlice = historicalSlices[i]!;

    const updatedStates = new Map<string, NodeState>();

    for (const [nodeId, prevNodeState] of prevSlice.nodeStates) {
      const model = modelMap.get(nodeId);
      if (!model) {
        // 遷移モデルがないノードはそのまま維持
        updatedStates.set(nodeId, prevNodeState);
        continue;
      }

      const newState = transitionNodeState(
        prevNodeState,
        model,
        currentSlice.externalInputs
      );
      updatedStates.set(nodeId, newState);
    }

    // 現在のスライスに存在して前日に存在しないノードも追加
    for (const [nodeId, state] of currentSlice.nodeStates) {
      if (!updatedStates.has(nodeId)) {
        updatedStates.set(nodeId, state);
      }
    }

    processedSlices.push(
      buildTimeSlice(currentSlice.date, updatedStates, currentSlice.externalInputs)
    );
  }

  // ----- 2. 将来予測 -----
  const lastSlice = processedSlices[processedSlices.length - 1]!;
  const projections: TimeSlice[] = [];

  // 予測時の外部入力: 最後の実測値を使用（休養日なら 0）
  const projectionInputs: ExternalInputs = {
    ...lastSlice.externalInputs,
  };

  let currentStates = new Map(lastSlice.nodeStates);

  for (let day = 1; day <= daysToProject; day++) {
    const projectionDate = addDays(lastSlice.date, day);
    const nextStates = new Map<string, NodeState>();

    for (const [nodeId, prevState] of currentStates) {
      const model = modelMap.get(nodeId);
      if (!model) {
        nextStates.set(nodeId, prevState);
        continue;
      }

      const newState = transitionNodeState(
        prevState,
        model,
        projectionInputs
      );
      nextStates.set(nodeId, newState);
    }

    const projSlice = buildTimeSlice(projectionDate, nextStates, projectionInputs);
    projections.push(projSlice);
    currentStates = nextStates;
  }

  // ----- 3. サマリー算出 -----
  const summary = computeSummary(processedSlices, projections);

  return {
    timeSlices: processedSlices,
    projections,
    summary,
  };
}

// ---------------------------------------------------------------------------
// サマリー算出
// ---------------------------------------------------------------------------

/**
 * DBN 推論結果のサマリーを算出する。
 *
 * @param timeSlices - 過去の実測タイムスライス列
 * @param projections - 将来予測タイムスライス列
 * @returns DBN サマリー
 */
function computeSummary(
  timeSlices: TimeSlice[],
  projections: TimeSlice[]
): DBNSummary {
  // 現在の最大リスク
  const currentSlice = timeSlices[timeSlices.length - 1];
  let currentOverallRisk = 0;
  const criticalNodes: string[] = [];

  if (currentSlice) {
    for (const [nodeId, state] of currentSlice.nodeStates) {
      if (state.risk > currentOverallRisk) {
        currentOverallRisk = state.risk;
      }
      if (state.risk > 0.3) {
        criticalNodes.push(nodeId);
      }
    }
  }

  // 予測期間最終日の最大リスク
  let projectedRiskAtMatch = 0;
  const lastProjection = projections[projections.length - 1];
  if (lastProjection) {
    for (const [, state] of lastProjection.nodeStates) {
      if (state.risk > projectedRiskAtMatch) {
        projectedRiskAtMatch = state.risk;
      }
    }
  }

  // 安全レベルに達するまでの日数
  let daysToSafeLevel = 0;
  if (currentOverallRisk > SAFE_RISK_THRESHOLD) {
    for (let i = 0; i < projections.length; i++) {
      let maxRisk = 0;
      for (const [, state] of projections[i]!.nodeStates) {
        if (state.risk > maxRisk) {
          maxRisk = state.risk;
        }
      }
      if (maxRisk <= SAFE_RISK_THRESHOLD) {
        daysToSafeLevel = i + 1;
        break;
      }
    }
    // 予測期間内に安全レベルに達しない場合
    if (daysToSafeLevel === 0) {
      daysToSafeLevel = projections.length + 1;
    }
  }

  return {
    currentOverallRisk: roundTo4(currentOverallRisk),
    projectedRiskAtMatch: roundTo4(projectedRiskAtMatch),
    daysToSafeLevel,
    criticalNodes,
  };
}

// ---------------------------------------------------------------------------
// ユーティリティ（純関数）
// ---------------------------------------------------------------------------

/**
 * 値を [0, 1] にクランプする。
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 小数第4位で丸める。
 */
function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * YYYY-MM-DD 形式の日付に日数を加算する。
 *
 * @param dateStr - 基準日（YYYY-MM-DD）
 * @param days - 加算日数
 * @returns 加算後の日付（YYYY-MM-DD）
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// シリアライゼーション
// ---------------------------------------------------------------------------

/**
 * TimeSlice を JSON シリアライズ可能な形式に変換する。
 *
 * Map<string, NodeState> → Record<string, NodeState> に変換。
 *
 * @param slice - タイムスライス
 * @returns シリアライズ可能なオブジェクト
 */
export function serializeTimeSlice(
  slice: TimeSlice
): { date: string; nodeStates: Record<string, NodeState>; externalInputs: ExternalInputs } {
  const nodeStatesObj: Record<string, NodeState> = {};
  for (const [key, value] of slice.nodeStates) {
    nodeStatesObj[key] = value;
  }
  return {
    date: slice.date,
    nodeStates: nodeStatesObj,
    externalInputs: slice.externalInputs,
  };
}

/**
 * DBNResult を JSON シリアライズ可能な形式に変換する。
 *
 * @param result - DBN 推論結果
 * @returns シリアライズ可能なオブジェクト
 */
export function serializeDBNResult(result: DBNResult) {
  return {
    timeSlices: result.timeSlices.map(serializeTimeSlice),
    projections: result.projections.map(serializeTimeSlice),
    summary: result.summary,
  };
}
