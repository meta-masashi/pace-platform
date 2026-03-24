/**
 * PACE Platform — Computerized Adaptive Testing (CAT) エンジン
 *
 * 情報利得（Information Gain）に基づく適応的質問選択エンジン。
 *
 * アルゴリズム:
 *   1. 各未回答ノードについて期待情報利得を計算
 *      - 情報利得 = 現在のエントロピー - 回答後の期待エントロピー
 *      - H(p) = -Σ p_i × log2(p_i)
 *   2. 情報利得が最大のノードを次の質問として選択
 *   3. レッドフラグ検出・終了条件判定を並行実行
 *
 * 性能要件: 質問選択処理 < 200ms
 */

import type {
  AssessmentNode,
  AssessmentResponse,
  NextQuestionResult,
  RedFlagResult,
  AnswerValue,
} from "./types";
import { updatePosteriors } from "./posterior-updater";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 終了条件: 最大事後確率の閾値（これを超えたら高信頼で終了） */
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

/** 終了条件: 最小情報利得の閾値（これ未満は収穫逓減で終了） */
const MIN_INFORMATION_GAIN_THRESHOLD = 0.01;

/** 終了条件: 最大質問数 */
const MAX_QUESTIONS = 30;

/** エントロピー計算における log2(0) 回避のための最小確率 */
const EPSILON = 1e-15;

/** unknown 回答の推定確率（情報利得計算用） */
const P_UNKNOWN = 0.05;

// ---------------------------------------------------------------------------
// 次の質問選択
// ---------------------------------------------------------------------------

/**
 * 情報利得に基づいて次に表示すべき最適な質問を選択する。
 *
 * 各未回答ノードについて、yes/no/unknown 各回答後の
 * 期待エントロピーを計算し、現在のエントロピーとの差（情報利得）が
 * 最大のノードを返す。
 *
 * @param nodes        全アセスメントノード
 * @param responses    これまでの回答履歴
 * @param posteriors   現在の事後確率マップ
 * @returns            次の質問情報。全ノード回答済みの場合は null
 */
export function selectNextQuestion(
  nodes: AssessmentNode[],
  responses: AssessmentResponse[],
  posteriors: Map<string, number>
): NextQuestionResult | null {
  // 回答済みノードIDのセット
  const answeredNodeIds = new Set(responses.map((r) => r.nodeId));

  // 未回答ノードをフィルタリング
  const candidates = nodes.filter(
    (node) => !answeredNodeIds.has(node.node_id)
  );

  if (candidates.length === 0) return null;

  // 現在のエントロピーを計算
  const currentEntropy = computeEntropy(posteriors);

  // 各候補ノードの情報利得を計算
  let bestNode: AssessmentNode | null = null;
  let bestInfoGain = -Infinity;

  for (const candidate of candidates) {
    const infoGain = computeExpectedInformationGain(
      candidate,
      posteriors,
      currentEntropy
    );

    if (infoGain > bestInfoGain) {
      bestInfoGain = infoGain;
      bestNode = candidate;
    }
  }

  if (!bestNode) return null;

  // 進捗率を計算（信頼度収束に基づく）
  const progress = computeProgress(posteriors, responses.length);

  return {
    nodeId: bestNode.node_id,
    questionText: bestNode.question_text,
    informationGain: Math.max(0, bestInfoGain),
    progress,
  };
}

// ---------------------------------------------------------------------------
// レッドフラグ検出
// ---------------------------------------------------------------------------

/**
 * ノードの回答がレッドフラグ条件に該当するかを検査する。
 *
 * routing_rules_json 内の red_flags 条件リストを走査し、
 * 回答値が trigger_answer に一致する場合にレッドフラグを返す。
 *
 * @param node    回答対象のアセスメントノード
 * @param answer  回答値
 * @returns       レッドフラグ結果。該当なしの場合は null
 */
export function checkRedFlags(
  node: AssessmentNode,
  answer: AnswerValue
): RedFlagResult | null {
  const rules = node.routing_rules_json;
  if (!rules?.red_flags || rules.red_flags.length === 0) return null;

  for (const flag of rules.red_flags) {
    if (flag.trigger_answer === answer) {
      return {
        nodeId: node.node_id,
        severity: flag.severity,
        description: flag.description,
        hardLock: flag.hard_lock,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 終了条件判定
// ---------------------------------------------------------------------------

/**
 * アセスメントの終了条件を判定する。
 *
 * 終了条件（いずれか1つを満たせば終了）:
 *   1. 最大事後確率 > 0.85（高信頼）
 *   2. 次の最良質問の情報利得 < 0.01（収穫逓減）
 *   3. 回答数 > 30（最大質問数上限）
 *
 * @param posteriors     現在の事後確率マップ
 * @param responseCount  回答数
 * @param nodes          全アセスメントノード（情報利得計算用）
 * @param responses      回答履歴（情報利得計算用）
 * @returns              終了すべき場合は終了理由、継続の場合は null
 */
export function shouldTerminate(
  posteriors: Map<string, number>,
  responseCount: number,
  nodes?: AssessmentNode[],
  responses?: AssessmentResponse[]
): "high_confidence" | "diminishing_returns" | "max_questions" | null {
  // 条件1: 最大事後確率が閾値超過
  const maxPosterior = Math.max(...posteriors.values());
  if (maxPosterior > HIGH_CONFIDENCE_THRESHOLD) {
    return "high_confidence";
  }

  // 条件3: 最大質問数超過
  if (responseCount >= MAX_QUESTIONS) {
    return "max_questions";
  }

  // 条件2: 情報利得の収穫逓減チェック（ノードと回答がある場合のみ）
  if (nodes && responses) {
    const nextQ = selectNextQuestion(nodes, responses, posteriors);
    if (nextQ && nextQ.informationGain < MIN_INFORMATION_GAIN_THRESHOLD) {
      return "diminishing_returns";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// エントロピー計算
// ---------------------------------------------------------------------------

/**
 * シャノンエントロピーを計算する。
 *
 * H(p) = -Σ p_i × log2(p_i)
 *
 * @param posteriors 事後確率マップ
 * @returns エントロピー（ビット）
 */
function computeEntropy(posteriors: Map<string, number>): number {
  let entropy = 0;
  for (const p of posteriors.values()) {
    if (p > EPSILON) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

// ---------------------------------------------------------------------------
// 期待情報利得
// ---------------------------------------------------------------------------

/**
 * 候補ノードの期待情報利得を計算する。
 *
 * Information Gain = H(current) - E[H(after)]
 *
 * 期待エントロピーは yes/no/unknown 各回答後のエントロピーの
 * 加重平均として計算する。各回答の確率は現在の事後確率から推定する。
 *
 * @param candidate       候補ノード
 * @param posteriors      現在の事後確率マップ
 * @param currentEntropy  現在のエントロピー
 * @returns               期待情報利得
 */
function computeExpectedInformationGain(
  candidate: AssessmentNode,
  posteriors: Map<string, number>,
  currentEntropy: number
): number {
  const targetPosterior = posteriors.get(candidate.target_axis) ?? 0;

  // 各回答の確率を現在の事後確率から推定
  // P(yes) ≈ ターゲット診断の事後確率（その症状が陽性である確率に近似）
  // P(no)  ≈ 1 - P(yes) - P(unknown)
  const pYes = Math.max(EPSILON, targetPosterior * (1 - P_UNKNOWN));
  const pNo = Math.max(EPSILON, (1 - targetPosterior) * (1 - P_UNKNOWN));
  const pUnknown = P_UNKNOWN;

  // yes 回答後のエントロピー
  const posteriorsAfterYes = updatePosteriors(posteriors, candidate, "yes");
  const entropyAfterYes = computeEntropy(posteriorsAfterYes);

  // no 回答後のエントロピー
  const posteriorsAfterNo = updatePosteriors(posteriors, candidate, "no");
  const entropyAfterNo = computeEntropy(posteriorsAfterNo);

  // unknown 回答後のエントロピー（変化なし）
  const entropyAfterUnknown = currentEntropy;

  // 期待エントロピー = 各回答確率で加重平均
  const expectedEntropy =
    pYes * entropyAfterYes +
    pNo * entropyAfterNo +
    pUnknown * entropyAfterUnknown;

  return currentEntropy - expectedEntropy;
}

// ---------------------------------------------------------------------------
// 進捗率計算
// ---------------------------------------------------------------------------

/**
 * アセスメントの進捗率を計算する。
 *
 * 信頼度収束（最大事後確率）と回答数の両方を考慮:
 *   progress = max(confidenceProgress, questionProgress)
 *
 * @param posteriors     事後確率マップ
 * @param responseCount  回答数
 * @returns              進捗率（0-100）
 */
function computeProgress(
  posteriors: Map<string, number>,
  responseCount: number
): number {
  const maxPosterior = Math.max(...posteriors.values(), 0);

  // 信頼度ベース: 0.5 → 0%, 0.85 → 100%
  const confidenceProgress = Math.min(
    100,
    Math.max(0, ((maxPosterior - 0.5) / (HIGH_CONFIDENCE_THRESHOLD - 0.5)) * 100)
  );

  // 回答数ベース: 0 → 0%, MAX_QUESTIONS → 100%
  const questionProgress = Math.min(
    100,
    (responseCount / MAX_QUESTIONS) * 100
  );

  return Math.round(Math.max(confidenceProgress, questionProgress));
}

// ---------------------------------------------------------------------------
// アセスメント結果構築
// ---------------------------------------------------------------------------

/**
 * 最終的なアセスメント結果を構築する。
 *
 * @param posteriors          最終事後確率マップ
 * @param responses           全回答履歴
 * @param nodes               全ノード
 * @param redFlags            発火したレッドフラグ一覧
 * @param terminationReason   終了理由
 * @returns                   アセスメント結果
 */
export function buildAssessmentResult(
  posteriors: Map<string, number>,
  responses: AssessmentResponse[],
  nodes: AssessmentNode[],
  redFlags: RedFlagResult[],
  terminationReason: "high_confidence" | "diminishing_returns" | "max_questions" | "red_flag"
): {
  primaryDiagnosis: string;
  confidence: number;
  differentials: Array<{
    diagnosisCode: string;
    probability: number;
    confidence: [number, number];
    isRedFlag: boolean;
  }>;
  redFlags: RedFlagResult[];
  contraindicationTags: string[];
  prescriptionTags: string[];
  responseCount: number;
  terminationReason: typeof terminationReason;
} {
  // 事後確率を降順ソート
  const sorted = [...posteriors.entries()].sort(([, a], [, b]) => b - a);

  // 上位5件の鑑別診断
  const redFlagNodeIds = new Set(redFlags.map((rf) => rf.nodeId));
  const differentials = sorted.slice(0, 5).map(([code, prob]) => ({
    diagnosisCode: code,
    probability: prob,
    confidence: computeSimpleConfidenceInterval(prob, responses.length) as [number, number],
    isRedFlag: redFlagNodeIds.has(code),
  }));

  // 禁忌・処方タグの集計
  const contraindicationTags = new Set<string>();
  const prescriptionTags = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));

  for (const response of responses) {
    if (response.answer !== "yes") continue;
    const node = nodeMap.get(response.nodeId);
    if (!node) continue;
    node.contraindication_tags_json?.forEach((t) => contraindicationTags.add(t));
    node.prescription_tags_json?.forEach((t) => prescriptionTags.add(t));
  }

  const [primaryCode, primaryProb] = sorted[0] ?? ["unknown", 0];

  return {
    primaryDiagnosis: primaryCode,
    confidence: primaryProb,
    differentials,
    redFlags,
    contraindicationTags: [...contraindicationTags],
    prescriptionTags: [...prescriptionTags],
    responseCount: responses.length,
    terminationReason,
  };
}

// ---------------------------------------------------------------------------
// 簡易信頼区間
// ---------------------------------------------------------------------------

/**
 * ウィルソンスコア区間による簡易 95% 信頼区間を計算する。
 *
 * Bootstrap は計算コストが高いため、リアルタイム API では
 * ウィルソンスコア近似を使用する。
 * 詳細な Bootstrap 信頼区間は posteriors API で提供する。
 *
 * @param probability    事後確率
 * @param sampleSize     回答数（有効サンプルサイズとして使用）
 * @returns              [lower, upper] 95% 信頼区間
 */
function computeSimpleConfidenceInterval(
  probability: number,
  sampleSize: number
): [number, number] {
  // z = 1.96 for 95% CI
  const z = 1.96;
  const n = Math.max(1, sampleSize);
  const p = probability;

  // ウィルソンスコア区間
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

  const lower = Math.max(0, center - margin);
  const upper = Math.min(1, center + margin);

  return [lower, upper];
}
