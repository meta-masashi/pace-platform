/**
 * PACE Platform — ベイズネット前向き伝播推論エンジン（フロントエンド実装）
 *
 * assessment_nodes / alpha_chains スキーマに基づく前向き伝播:
 *   - 適応尤度比: LR_adjusted = 1 + (LR_raw - 1) × C_score × κ
 *     - C_score < 0.3 → LR_adjusted = 1.0（棄却）
 *     - κ = 0.8（デフォルト）
 *   - 事後確率の正規化（合計100%保証）
 *   - 信頼区間計算（Bootstrap 1000回）
 *
 * 注意: このモジュールは Python FastAPI ベイズエンジンが利用不可の場合の
 * フロントエンドフォールバック実装。通常は engine-client.ts 経由で FastAPI を呼ぶ。
 */

import type {
  AssessmentNode,
  NodeResponse,
  DiagnosisCandidate,
  DiagnosisResult,
  InferenceSession,
  AthleteContext,
  RiskLevel,
  AnswerValue,
  CausalEdge,
  ActiveObservation,
} from "./types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** コンテキスト修飾子のデフォルト減衰係数（κ）*/
const KAPPA_DEFAULT = 0.8;

/** C_score の棄却閾値（これ未満は LR_adjusted = 1.0 に強制）*/
const C_SCORE_REJECT_THRESHOLD = 0.3;

/** Bootstrap サンプリング回数（信頼区間計算）*/
const BOOTSTRAP_ITERATIONS = 1_000;

/** 最大表示診断候補数 */
const MAX_TOP_DIAGNOSES = 5;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * 推論対象の傷害ラベルとその事前確率
 */
export interface DiagnosisTarget {
  label: string;
  /** 事前確率（ベースレート）*/
  priorProbability: number;
  /** このラベルに関連する AssessmentNode の node_id リスト */
  relatedNodeIds: string[];
  riskLevel: RiskLevel;
  soapTemplates?: string[];
}

export interface InferenceInput {
  session: InferenceSession;
  nodes: AssessmentNode[];
  targets: DiagnosisTarget[];
  athleteContext?: AthleteContext;
  /** コンテキスト修飾子の減衰係数。デフォルト 0.8 */
  kappa?: number;
}

export interface InferenceOutput {
  topDiagnoses: DiagnosisCandidate[];
  /** 各候補の 95% 信頼区間 [lower, upper] */
  confidenceIntervals: Record<string, [number, number]>;
  overallRiskLevel: RiskLevel;
  contextModifier: number;
  processingTimeMs: number;
}

// ---------------------------------------------------------------------------
// 適応尤度比計算
// ---------------------------------------------------------------------------

/**
 * C_score（信頼スコア）を計算する。
 *
 * C_score はアスリートコンテキストの完全性を 0-1 で表す。
 * 利用可能なコンテキスト変数の割合に基づく。
 */
export function computeCScore(athleteContext?: AthleteContext): number {
  if (!athleteContext) return 0;

  const fields: (keyof AthleteContext)[] = [
    "age",
    "sex",
    "cmj_asymmetry_ratio",
    "rsi_norm",
    "srpe",
    "acwr",
    "sleep_hours",
    "hrv_baseline_ratio",
  ];

  const availableCount = fields.filter(
    (f) => athleteContext[f] !== undefined && athleteContext[f] !== null
  ).length;

  return availableCount / fields.length;
}

/**
 * コンテキスト修飾子（context_modifier）を計算する。
 *
 * ACWR / HRV / sRPE の逸脱度から総合的な負荷状態を推定する。
 * 値域: 0.5（過負荷・回復不足）〜 1.0（通常）
 */
export function computeContextModifier(athleteContext?: AthleteContext): number {
  if (!athleteContext) return 1.0;

  let modifier = 1.0;

  // ACWR 1.5 超過 → 受傷リスク上昇
  if (athleteContext.acwr !== undefined && athleteContext.acwr > 1.5) {
    modifier *= 0.85;
  }

  // HRV ベースライン比 < 0.8 → 回復不足
  if (
    athleteContext.hrv_baseline_ratio !== undefined &&
    athleteContext.hrv_baseline_ratio < 0.8
  ) {
    modifier *= 0.9;
  }

  // sRPE > 8/10 → 主観的疲労高
  if (athleteContext.srpe !== undefined && athleteContext.srpe > 8) {
    modifier *= 0.9;
  }

  // CMJ 左右差 > 15% → 機能的非対称性
  if (
    athleteContext.cmj_asymmetry_ratio !== undefined &&
    athleteContext.cmj_asymmetry_ratio < 0.85
  ) {
    modifier *= 0.95;
  }

  return Math.max(0.5, modifier);
}

/**
 * 適応尤度比を計算する。
 *
 *   LR_adjusted = 1 + (LR_raw - 1) × C_score × κ
 *   ただし C_score < C_SCORE_REJECT_THRESHOLD の場合は 1.0（棄却）
 *
 * @param lrRaw   生の尤度比（AssessmentNode.lr_yes / lr_no）
 * @param cScore  信頼スコア（0-1）
 * @param kappa   減衰係数（デフォルト 0.8）
 */
export function computeAdjustedLr(
  lrRaw: number,
  cScore: number,
  kappa: number = KAPPA_DEFAULT
): number {
  // C_score が棄却閾値未満 → LR を無効化
  if (cScore < C_SCORE_REJECT_THRESHOLD) {
    return 1.0;
  }

  return Math.max(0, 1 + (lrRaw - 1) * cScore * kappa);
}

// ---------------------------------------------------------------------------
// 前向き伝播（ナイーブベイズ）
// ---------------------------------------------------------------------------

/**
 * ノード回答から対象ラベルの事後確率（オッズ）を計算する。
 *
 * アルゴリズム:
 *   1. 事前オッズ = prior / (1 - prior)
 *   2. 各回答の LR_adjusted を乗算（前向き伝播）
 *   3. 事後確率 = posterior_odds / (1 + posterior_odds)
 */
function forwardPropagation(
  target: DiagnosisTarget,
  responses: NodeResponse[],
  nodeMap: Map<string, AssessmentNode>,
  cScore: number,
  kappa: number,
  contextModifier: number
): number {
  const prior = target.priorProbability;

  // 事前確率のクランプ（数値安定性）
  const clampedPrior = Math.max(0.001, Math.min(0.999, prior));
  let posteriorOdds = clampedPrior / (1 - clampedPrior);

  // このターゲットに関連するノードの回答のみを処理
  const relatedNodeIdSet = new Set(target.relatedNodeIds);

  for (const response of responses) {
    if (!relatedNodeIdSet.has(response.node_id)) continue;

    const node = nodeMap.get(response.node_id);
    if (!node || !node.is_active) continue;

    // 回答に応じた生 LR の選択
    let lrRaw: number;
    const answer: AnswerValue = response.answer;
    if (answer === "yes") {
      lrRaw = node.lr_yes;
    } else if (answer === "no") {
      lrRaw = node.lr_no;
    } else {
      // unknown → LR 変更なし
      continue;
    }

    // 適応 LR を計算して乗算
    const lrAdjusted = computeAdjustedLr(lrRaw, cScore, kappa);
    posteriorOdds *= lrAdjusted;
  }

  // コンテキスト修飾子を適用（リスク補正）
  posteriorOdds *= contextModifier;

  // オッズ → 確率への変換
  return posteriorOdds / (1 + posteriorOdds);
}

// ---------------------------------------------------------------------------
// 事後確率の正規化
// ---------------------------------------------------------------------------

/**
 * 各診断候補の事後確率を合計 1.0 に正規化する。
 * 合計が 0 の場合は均等分布にフォールバック。
 */
function normalizePosteriors(
  posteriors: Array<{ label: string; raw: number }>
): Array<{ label: string; normalized: number }> {
  const total = posteriors.reduce((sum, p) => sum + p.raw, 0);

  if (total === 0) {
    const uniform = 1 / posteriors.length;
    return posteriors.map((p) => ({ label: p.label, normalized: uniform }));
  }

  return posteriors.map((p) => ({
    label: p.label,
    normalized: p.raw / total,
  }));
}

// ---------------------------------------------------------------------------
// Bootstrap 信頼区間計算
// ---------------------------------------------------------------------------

/**
 * Bootstrap リサンプリングによる 95% 信頼区間を計算する。
 *
 * @param responses   ノード回答リスト
 * @param target      診断ターゲット
 * @param nodeMap     ノードマップ
 * @param cScore      信頼スコア
 * @param kappa       減衰係数
 * @param contextMod  コンテキスト修飾子
 * @param iterations  Bootstrap 反復回数（デフォルト 1000）
 * @returns [lower, upper] 95% 信頼区間
 */
export function computeBootstrapConfidenceInterval(
  responses: NodeResponse[],
  target: DiagnosisTarget,
  nodeMap: Map<string, AssessmentNode>,
  cScore: number,
  kappa: number,
  contextMod: number,
  iterations: number = BOOTSTRAP_ITERATIONS
): [number, number] {
  const bootstrapPosteriors: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // リサンプリング（同数、復元抽出）
    const resampled: NodeResponse[] = Array.from({ length: responses.length }, () => {
      const idx = Math.floor(Math.random() * responses.length);
      return responses[idx]!;
    });

    const posterior = forwardPropagation(
      target,
      resampled,
      nodeMap,
      cScore,
      kappa,
      contextMod
    );
    bootstrapPosteriors.push(posterior);
  }

  bootstrapPosteriors.sort((a, b) => a - b);

  const lowerIdx = Math.floor(iterations * 0.025);
  const upperIdx = Math.floor(iterations * 0.975);

  return [bootstrapPosteriors[lowerIdx] ?? 0, bootstrapPosteriors[upperIdx] ?? 1];
}

// ---------------------------------------------------------------------------
// リスクレベル判定
// ---------------------------------------------------------------------------

function posteriorToRiskLevel(posterior: number): RiskLevel {
  if (posterior >= 0.8) return "critical";
  if (posterior >= 0.6) return "high";
  if (posterior >= 0.4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// メイン推論関数
// ---------------------------------------------------------------------------

/**
 * ベイズネット前向き伝播を実行して診断候補リストを生成する。
 *
 * Python FastAPI エンジンが利用不可の場合のフォールバックとして使用。
 * 通常は `engine-client.ts` の `runInferenceStep()` 経由で FastAPI を呼ぶこと。
 *
 * @param input  推論入力（セッション・ノード・ターゲット・コンテキスト）
 */
export async function runLocalInference(input: InferenceInput): Promise<InferenceOutput> {
  const startTime = Date.now();
  const { session, nodes, targets, athleteContext, kappa = KAPPA_DEFAULT } = input;

  // ノードを Map に変換（検索効率化）
  const nodeMap = new Map<string, AssessmentNode>(nodes.map((n) => [n.node_id, n]));

  // C_score とコンテキスト修飾子を計算
  const cScore = computeCScore(athleteContext);
  const contextModifier = computeContextModifier(athleteContext);

  console.info(
    `[bayes:inference] C_score=${cScore.toFixed(3)} contextModifier=${contextModifier.toFixed(3)} responses=${session.responses.length}`
  );

  // 各ターゲットの事後確率を計算（前向き伝播）
  const rawPosteriors = targets.map((target) => ({
    label: target.label,
    raw: forwardPropagation(
      target,
      session.responses,
      nodeMap,
      cScore,
      kappa,
      contextModifier
    ),
    target,
  }));

  // 正規化（合計 100% 保証）
  const normalized = normalizePosteriors(rawPosteriors.map((p) => ({ label: p.label, raw: p.raw })));
  const normalizedMap = new Map(normalized.map((n) => [n.label, n.normalized]));

  // 信頼区間計算（Bootstrap 1000回）
  const confidenceIntervals: Record<string, [number, number]> = {};

  // Bootstrap は計算コストが高いため上位候補のみ計算
  const sortedByPosterior = [...rawPosteriors].sort(
    (a, b) => (normalizedMap.get(b.label) ?? 0) - (normalizedMap.get(a.label) ?? 0)
  );

  for (const item of sortedByPosterior.slice(0, MAX_TOP_DIAGNOSES)) {
    const ci = computeBootstrapConfidenceInterval(
      session.responses,
      item.target,
      nodeMap,
      cScore,
      kappa,
      contextModifier
    );
    confidenceIntervals[item.label] = ci;
  }

  // 診断候補リスト組み立て（上位 MAX_TOP_DIAGNOSES 件）
  const topDiagnoses: DiagnosisCandidate[] = sortedByPosterior
    .slice(0, MAX_TOP_DIAGNOSES)
    .map((item) => {
      const posterior = normalizedMap.get(item.label) ?? 0;
      return {
        label: item.label,
        posterior,
        risk_level: posteriorToRiskLevel(posterior),
        soap_templates: item.target.soapTemplates ?? [],
        fired_logic_ids: [],
      };
    });

  // 総合リスクレベル = 上位候補の最高リスク
  const overallRiskLevel =
    topDiagnoses.length > 0
      ? (topDiagnoses[0]?.risk_level ?? "low")
      : "low";

  return {
    topDiagnoses,
    confidenceIntervals,
    overallRiskLevel,
    contextModifier,
    processingTimeMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// DiagnosisResult 変換ヘルパー
// ---------------------------------------------------------------------------

/**
 * InferenceOutput を DiagnosisResult（ベイズエンジン共通型）に変換する。
 * ローカル推論結果を他モジュール（context-builder.ts 等）に渡す際に使用。
 */
export function todiagnosisResult(
  output: InferenceOutput,
  session: InferenceSession
): DiagnosisResult {
  // 全ノード回答から禁忌・処方タグを集計
  const contraindicationTags = new Set<string>();
  const prescriptionTags = new Set<string>();

  for (const response of session.responses) {
    if (response.answer === "yes") {
      response.contraindication_tags.forEach((t) => contraindicationTags.add(t));
      response.prescription_tags.forEach((t) => prescriptionTags.add(t));
    }
  }

  return {
    session_id: session.session_id,
    athlete_id: session.athlete_id,
    assessment_type: session.assessment_type,
    completed_at: new Date().toISOString(),
    engine_version: "v2_naive_bayes",
    top_diagnoses: output.topDiagnoses,
    overall_risk_level: output.overallRiskLevel,
    hard_lock_active: output.topDiagnoses[0]?.posterior !== undefined
      ? output.topDiagnoses[0].posterior >= 0.85 &&
        output.topDiagnoses[0].risk_level === "critical"
      : false,
    soft_lock_active: output.topDiagnoses[0]?.posterior !== undefined
      ? output.topDiagnoses[0].posterior >= 0.65
      : false,
    contraindication_tags: [...contraindicationTags],
    prescription_tags: [...prescriptionTags],
    completion_rate:
      session.responses.length > 0
        ? Math.min(session.responses.length / 20, 1.0)
        : 0,
    context_modifier: output.contextModifier,
  };
}

// ===========================================================================
// v3.1 因果グラフ（DAG）ベースの Causal Discounting 推論エンジン
// ===========================================================================

/**
 * 確率をオッズに変換する。
 *
 * @param probability - 確率 (0.0 ~ 1.0)
 * @returns オッズ値
 * @throws RangeError - probability が 1.0 の場合（オッズ = 無限大）
 */
export function probabilityToOdds(probability: number): number {
  const clamped = Math.max(1e-10, Math.min(1 - 1e-10, probability));
  return clamped / (1 - clamped);
}

/**
 * オッズを確率に変換する。
 *
 * @param odds - オッズ値 (>= 0)
 * @returns 確率 (0.0 ~ 1.0)
 */
export function oddsToProbability(odds: number): number {
  if (odds < 0) return 0;
  if (!Number.isFinite(odds)) return 1.0;
  return odds / (1 + odds);
}

/**
 * 単一ノードの実効尤度比（Effective LR）を因果割引モデルに基づいて計算する。
 *
 * 数式:
 *   Effective_LR = 1 + (LR_raw - 1) * (1 - gamma_cumulative)
 *
 * 複数の親ノードが発火している場合は累積割引を適用:
 *   (1 - gamma_cumulative) = Product_i (1 - gamma_i)
 *
 * @param lrRaw              - ノードの生の尤度比
 * @param activeParentEdges  - 発火している親ノードの CausalEdge 配列
 * @returns 割引適用後の実効尤度比（常に >= 1.0 または元の LR が < 1.0 の場合はそちら側に収束）
 */
export function computeEffectiveLR(
  lrRaw: number,
  activeParentEdges: CausalEdge[]
): number {
  // LR が 1.0（情報なし）の場合、割引の必要なし
  if (lrRaw === 1.0) return 1.0;

  // 発火している親がない場合、割引なし
  if (activeParentEdges.length === 0) return lrRaw;

  // 累積割引率の計算: (1 - gamma_1) * (1 - gamma_2) * ...
  // これは各親ノードが独立に「説明済み」とする分を掛け合わせる
  let retainedFraction = 1.0;
  for (const edge of activeParentEdges) {
    // discountFactor のバリデーション: [0.0, 1.0] にクランプ
    const gamma = Math.max(0, Math.min(1, edge.discountFactor));
    retainedFraction *= (1 - gamma);
  }

  // Effective LR = 1 + (LR_raw - 1) * retainedFraction
  return 1 + (lrRaw - 1) * retainedFraction;
}

/**
 * 因果グラフ（DAG）の依存関係を考慮して、複数の発火ノードから最終的な事後確率を計算する。
 *
 * Causal Discounting Likelihood Ratio (CD-LR) モデル:
 *   - 親ノードが発火している場合、子ノードの LR を割り引いて二重カウントを防止
 *   - 親が複数発火している場合は累積割引: (1-γ1) * (1-γ2) * ... を適用
 *
 * アルゴリズム:
 *   1. priorProbability を priorOdds に変換: odds = p / (1 - p)
 *   2. observations をループし、各発火ノードの Effective LR を計算
 *   3. Effective LR を全て掛け合わせる: posteriorOdds = priorOdds * Π Effective_LR
 *   4. posteriorOdds を確率に戻す: p = odds / (1 + odds)
 *
 * @param priorProbability - ベースラインの事前確率 (0.0 ~ 1.0)
 * @param nodes            - システムに定義された全ノードのマスターデータ（親子関係を含む）
 * @param observations     - 実際にユーザーが発火させた(Yes と答えた)ノードの配列
 * @returns posteriorProbability - 割引計算適用後の最終的な事後確率 (0.0 ~ 1.0)
 *
 * @throws Error - priorProbability が [0, 1] 範囲外の場合
 */
export function calculatePosteriorWithDAG(
  priorProbability: number,
  nodes: AssessmentNode[],
  observations: ActiveObservation[]
): number {
  // --- バリデーション ---
  if (priorProbability < 0 || priorProbability > 1) {
    throw new Error(
      `事前確率は [0, 1] の範囲でなければなりません。受け取った値: ${priorProbability}`
    );
  }

  // 事前確率が 0 または 1 の場合、ベイズ更新は数学的に不可能
  if (priorProbability === 0) return 0;
  if (priorProbability === 1) return 1;

  // 観測データがない場合は事前確率をそのまま返す
  if (observations.length === 0) return priorProbability;

  // --- データ準備 ---

  // ノードを node_id → AssessmentNode の Map に変換（O(1) ルックアップ）
  const nodeMap = new Map<string, AssessmentNode>(
    nodes.map((n) => [n.node_id, n])
  );

  // 発火（is_active = true）しているノード ID のセットを構築
  const activeNodeIds = new Set<string>(
    observations.filter((o) => o.is_active).map((o) => o.node_id)
  );

  // 発火していない観測がある場合（全て is_active = false）
  if (activeNodeIds.size === 0) return priorProbability;

  // --- Step 1: 事前オッズへの変換 ---
  let posteriorOdds = probabilityToOdds(priorProbability);

  // --- Step 2-3: 各発火ノードの Effective LR を計算して乗算 ---
  for (const observation of observations) {
    // 発火していないノードはスキップ
    if (!observation.is_active) continue;

    const node = nodeMap.get(observation.node_id);
    if (!node) {
      // マスターデータに存在しないノード ID は無視（堅牢性）
      console.warn(
        `[bayes:dag] ノード "${observation.node_id}" がマスターデータに存在しません。スキップします。`
      );
      continue;
    }

    // ノードの生の陽性尤度比を取得
    // lr_yes_sr（κ補正済み）が存在しない場合は lr_yes にフォールバック
    const nodeRecord = node as unknown as Record<string, unknown>;
    const lrRaw = nodeRecord["lr_yes_sr"] !== undefined
      ? Number(nodeRecord["lr_yes_sr"])
      : node.lr_yes;

    // LR が 1.0（情報なし）の場合はスキップ（乗算しても変化なし）
    if (lrRaw === 1.0) continue;

    // 親ノードの因果関係を確認し、発火している親のエッジを収集
    const activeParentEdges: CausalEdge[] = [];
    if (node.parents && node.parents.length > 0) {
      for (const edge of node.parents) {
        if (activeNodeIds.has(edge.parentId)) {
          activeParentEdges.push(edge);
        }
      }
    }

    // Effective LR の計算（因果割引適用）
    const effectiveLR = computeEffectiveLR(lrRaw, activeParentEdges);

    // オッズに乗算
    posteriorOdds *= effectiveLR;
  }

  // --- Step 4: オッズ → 確率への変換 ---
  return oddsToProbability(posteriorOdds);
}
