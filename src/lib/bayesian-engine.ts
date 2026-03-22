import type { AssessmentNode, AssessmentType, AnswerValue, DiagnosisResult } from "@/types";

// ============================================================
// Diagnosis catalogue
// ============================================================

// ※ これらはAI評価補助ラベルです。医学的診断名ではありません。
const DIAGNOSIS_LABELS: Record<string, string> = {
  ANK_DX_001: "足関節可動域制限パターンA",
  ANK_DX_002: "足関節外側支持機構ストレスパターン",
  KNEE_DX_001: "膝蓋腱周囲ストレスパターン",
  KNEE_DX_002: "膝外側ストレスパターン",
  KNEE_DX_003: "膝関節メカニカルストレスパターン",
  KNEE_DX_004: "膝関節前方不安定性パターン",
  MUSC_DX_001: "大腿前面筋機能低下パターン",
  MUSC_DX_002: "大腿後面筋ストレスパターン",
};

const ALL_DIAGNOSIS_CODES = Object.keys(DIAGNOSIS_LABELS);

// Map from node target_axis to relevant diagnosis codes
const AXIS_TO_DIAGNOSES: Record<string, string[]> = {
  ankle: ["ANK_DX_001", "ANK_DX_002"],
  ankle_kinetic_chain: ["ANK_DX_001", "ANK_DX_002"],
  knee: ["KNEE_DX_001", "KNEE_DX_002", "KNEE_DX_003", "KNEE_DX_004"],
  meniscus: ["KNEE_DX_003"],
  lower_body: ALL_DIAGNOSIS_CODES,
  localization: ALL_DIAGNOSIS_CODES,
  // General axes — contribute weakly to all
  head_neck: [],
  spine_neural: [],
};

// ============================================================
// Core interfaces
// ============================================================

export interface InferenceState {
  sessionId: string;
  athleteId: string;
  staffId: string;
  assessmentType: AssessmentType;
  injuryRegion: string; // e.g. "lower_limb", "upper_limb", "head_neck", "spine"
  priors: Record<string, number>; // diagnosis_code -> probability
  answeredNodes: Set<string>;
  responses: Array<{ node_id: string; answer: AnswerValue }>;
  isEmergency: boolean;
  startedAt: string;
}

// ============================================================
// Helpers
// ============================================================

function uniformPriors(): Record<string, number> {
  const p = 1 / ALL_DIAGNOSIS_CODES.length;
  return Object.fromEntries(ALL_DIAGNOSIS_CODES.map((code) => [code, p]));
}

function normalize(priors: Record<string, number>): Record<string, number> {
  const total = Object.values(priors).reduce((s, v) => s + v, 0);
  if (total === 0) return uniformPriors();
  return Object.fromEntries(
    Object.entries(priors).map(([k, v]) => [k, v / total])
  );
}

/** Shannon entropy of the current posterior distribution */
function entropy(priors: Record<string, number>): number {
  return -Object.values(priors).reduce((s, p) => {
    if (p <= 0) return s;
    return s + p * Math.log2(p);
  }, 0);
}

/**
 * Maximum posterior probability — used as the confidence metric.
 * Range: [0, 1] where 1 means complete certainty.
 */
function maxPosterior(priors: Record<string, number>): number {
  const values = Object.values(priors);
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Simulate the posterior after answering `node` with `answer`,
 * restricted to diagnoses relevant to this node's target_axis.
 * Uses Bayesian update: P(dx | answer) ∝ P(dx) × LR(answer)
 */
function simulatePosterior(
  priors: Record<string, number>,
  node: AssessmentNode,
  answer: AnswerValue
): Record<string, number> {
  const relevantCodes = AXIS_TO_DIAGNOSES[node.target_axis] ?? ALL_DIAGNOSIS_CODES;
  const lr = answer === "yes" ? node.lr_yes : answer === "no" ? node.lr_no : 1.0;

  const updated = { ...priors };
  for (const code of relevantCodes) {
    if (updated[code] !== undefined) {
      // Bayesian update: multiply prior by likelihood ratio
      updated[code] = updated[code] * lr;
    }
  }
  return normalize(updated);
}

// ============================================================
// Public API — Legacy stateful functions
// ============================================================

/** Create a fresh inference state for a new session. */
export function initializeSession(
  sessionId: string,
  athleteId: string,
  staffId: string,
  assessmentType: AssessmentType,
  injuryRegion = "general"
): InferenceState {
  return {
    sessionId,
    athleteId,
    staffId,
    assessmentType,
    injuryRegion,
    priors: uniformPriors(),
    answeredNodes: new Set(),
    responses: [],
    isEmergency: false,
    startedAt: new Date().toISOString(),
  };
}

/** Update posterior probabilities given a node answer. */
export function updatePosterior(
  state: InferenceState,
  node: AssessmentNode,
  answer: AnswerValue
): InferenceState {
  // RedFlag gate: a "yes" to any RedFlag node immediately triggers emergency
  const isEmergency =
    state.isEmergency || (node.phase === "RedFlag" && answer === "yes");

  const newPriors = simulatePosterior(state.priors, node, answer);
  const newAnsweredNodes = new Set(state.answeredNodes);
  newAnsweredNodes.add(node.node_id);

  return {
    ...state,
    priors: newPriors,
    answeredNodes: newAnsweredNodes,
    responses: [...state.responses, { node_id: node.node_id, answer }],
    isEmergency,
  };
}

/**
 * Calculate the expected information gain (entropy reduction) if we were
 * to ask `node` next, given the current posterior.
 * IG = H(current) − E[H(posterior | response)]
 *    = H(current) − [P(yes)·H(posterior_yes) + P(no)·H(posterior_no)]
 */
export function calculateInformationGain(
  node: AssessmentNode,
  state: InferenceState
): number {
  // Use pre-computed information_gain from node definition when available
  // as a prior estimate. We blend it with the dynamic computation.
  const staticGain = node.information_gain ?? 0.5;

  // Estimate P(yes) for this node under the current posterior by summing
  // probabilities of relevant diagnoses (proxy for the marginal likelihood).
  const relevantCodes = AXIS_TO_DIAGNOSES[node.target_axis] ?? ALL_DIAGNOSIS_CODES;
  const pYes = Math.min(
    0.95,
    Math.max(0.05, relevantCodes.reduce((s, c) => s + (state.priors[c] ?? 0), 0))
  );
  const pNo = 1 - pYes;

  const posteriorYes = simulatePosterior(state.priors, node, "yes");
  const posteriorNo = simulatePosterior(state.priors, node, "no");

  const currentEntropy = entropy(state.priors);
  const expectedEntropy = pYes * entropy(posteriorYes) + pNo * entropy(posteriorNo);
  const dynamicGain = currentEntropy - expectedEntropy;

  // Blend static and dynamic gains (static useful early when posterior is flat)
  return 0.4 * staticGain + 0.6 * dynamicGain;
}

/**
 * Clinical phase ordering:
 *   0 RedFlag → 1 主訴 → 2 視診 → 3 触診 → 4 動作確認 → 5 スペシャルテスト
 * Legacy Phase0/Phase1/… names are mapped to the same priority levels.
 * Within the same phase, the node with highest information gain is chosen.
 */
const PHASE_PRIORITY: Record<string, number> = {
  RedFlag: 0,
  主訴: 1,
  Phase0: 1,
  視診: 2,
  Phase1: 2,
  触診: 3,
  Phase2: 3,
  動作確認: 4,
  スペシャルテスト: 5,
  Phase3: 5,
};

/**
 * Which injury regions each RedFlag node target_axis applies to.
 * "all" means it is universal and always shown.
 * Injury regions: "lower_limb", "upper_limb", "head_neck", "spine", "general"
 */
const REDFLAG_REGIONS: Record<string, string[]> = {
  head_neck: ["head_neck"],         // head trauma: only for head/neck injuries
  spine_neural: ["all"],            // neurological sx: always screen
  lower_body: ["lower_limb"],
  knee: ["lower_limb"],
  ankle: ["lower_limb"],
  ankle_kinetic_chain: ["lower_limb"],
  shoulder: ["upper_limb"],
  elbow: ["upper_limb"],
  spine: ["spine"],
};

function isRedFlagRelevant(node: AssessmentNode, injuryRegion: string): boolean {
  const regions = REDFLAG_REGIONS[node.target_axis] ?? ["all"];
  return regions.includes("all") || regions.includes(injuryRegion) || injuryRegion === "general";
}

/**
 * Select the next question respecting clinical phase order first,
 * then maximising information gain within the same phase.
 * RedFlag nodes are filtered to only those relevant to the reported injury region.
 * Returns null when no unanswered nodes remain.
 */
export function selectNextNode(
  state: InferenceState,
  availableNodes: AssessmentNode[]
): AssessmentNode | null {
  const candidates = availableNodes.filter(
    (n) => !state.answeredNodes.has(n.node_id)
  );
  if (candidates.length === 0) return null;

  // Filter out RedFlag nodes irrelevant to the reported injury region
  const filtered = candidates.filter((n) => {
    if (n.phase !== "RedFlag") return true;
    return isRedFlagRelevant(n, state.injuryRegion);
  });

  if (filtered.length === 0) return null;

  return filtered.sort((a, b) => {
    const pA = PHASE_PRIORITY[a.phase] ?? 99;
    const pB = PHASE_PRIORITY[b.phase] ?? 99;
    if (pA !== pB) return pA - pB;
    return calculateInformationGain(b, state) - calculateInformationGain(a, state);
  })[0];
}

/**
 * Return top diagnoses sorted by posterior probability.
 */
export function getResults(state: InferenceState): DiagnosisResult[] {
  return Object.entries(state.priors)
    .map(([diagnosis_code, probability]) => ({
      diagnosis_code,
      label: DIAGNOSIS_LABELS[diagnosis_code] ?? diagnosis_code,
      probability,
    }))
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Determine whether the session is complete:
 * >= 8 nodes answered AND top diagnosis confidence > 0.75 (§4.5仕様: 信頼度閾値 >75%),
 * OR the session is flagged as an emergency.
 * 防壁4: Falls back safely — if state is corrupt, returns false to continue gathering data.
 */
export function isSessionComplete(state: InferenceState): boolean {
  if (state.isEmergency) return true;
  if (state.answeredNodes.size < 8) return false;
  try {
    const top = getResults(state)[0];
    return top !== undefined && top.probability > 0.75;
  } catch {
    // 防壁4: computation error fallback — keep session open
    return false;
  }
}

// ============================================================
// Public API — Required interface from §タスク#4 specification
// ============================================================

/**
 * Receive a new answer and update the probability distribution.
 * Returns the updated beliefs and a confidence score (max posterior probability).
 *
 * P(diagnosis | answer_sequence) = P(diagnosis) × ∏ LR_i(answer_i)
 * 事後確率は正規化（全仮説の合計 = 1）
 *
 * 防壁4: JSONパース失敗・計算エラー時は一様分布にリセット
 */
export function updateBeliefs(
  currentBeliefs: Record<string, number>,
  nodeId: string,
  answer: "yes" | "no" | "unknown",
  availableNodes: AssessmentNode[]
): { updatedBeliefs: Record<string, number>; confidence: number } {
  try {
    const node = availableNodes.find((n) => n.node_id === nodeId);
    if (!node) {
      // Node not found — return beliefs unchanged
      const confidence = maxPosterior(currentBeliefs);
      return { updatedBeliefs: currentBeliefs, confidence };
    }

    // Map "unknown" → AnswerValue "unclear" for internal Bayesian update
    const answerValue: AnswerValue =
      answer === "yes" ? "yes" : answer === "no" ? "no" : "unclear";

    const updatedBeliefs = simulatePosterior(currentBeliefs, node, answerValue);
    const confidence = maxPosterior(updatedBeliefs);

    return { updatedBeliefs, confidence };
  } catch {
    // 防壁4: 計算エラー時のフォールバック — 一様分布にリセット
    const fallback = uniformPriors();
    return { updatedBeliefs: fallback, confidence: maxPosterior(fallback) };
  }
}

/**
 * Select the next question to ask, ranked by information gain.
 * Respects clinical phase order (RedFlag > 主訴 > 視診 > 触診 > 動作確認 > スペシャルテスト).
 * Within the same phase, selects the node that maximises expected entropy reduction.
 *
 * IG(node) = H(beliefs) − [P(yes)·H(posterior_yes) + P(no)·H(posterior_no)]
 *
 * Returns null when all available nodes have been answered.
 */
export function selectNextQuestion(
  currentBeliefs: Record<string, number>,
  remainingNodes: AssessmentNode[],
  answeredNodeIds: string[]
): AssessmentNode | null {
  // Filter to unanswered nodes only
  const candidates = remainingNodes.filter(
    (n) => !answeredNodeIds.includes(n.node_id)
  );
  if (candidates.length === 0) return null;

  // Build a minimal state-like object for calculateInformationGain
  const tempState: InferenceState = {
    sessionId: "_temp",
    athleteId: "_temp",
    staffId: "_temp",
    assessmentType: "F1_Acute",
    injuryRegion: "general",
    priors: currentBeliefs,
    answeredNodes: new Set(answeredNodeIds),
    responses: [],
    isEmergency: false,
    startedAt: new Date().toISOString(),
  };

  return candidates.sort((a, b) => {
    // Phase priority first (RedFlag = 0 takes precedence)
    const pA = PHASE_PRIORITY[a.phase] ?? 99;
    const pB = PHASE_PRIORITY[b.phase] ?? 99;
    if (pA !== pB) return pA - pB;
    // Within same phase, maximise expected information gain
    return calculateInformationGain(b, tempState) - calculateInformationGain(a, tempState);
  })[0];
}

/**
 * Check all 6 Red Flag items against the current answers.
 * A Red Flag is triggered when a node with phase "RedFlag" has been answered "yes".
 * Immediate emergency referral is required when hasRedFlag === true.
 *
 * Returns:
 *   hasRedFlag      — true if any Red Flag criteria is met
 *   triggeredFlags  — node_ids of triggered Red Flag nodes
 */
export function checkRedFlags(
  answers: Record<string, "yes" | "no" | "unknown">
): { hasRedFlag: boolean; triggeredFlags: string[] } {
  // Red Flag node IDs defined in §4.5: RF_001 through RF_006
  // Any node_id that starts with "RF_" is treated as a Red Flag gate item.
  const triggeredFlags: string[] = Object.entries(answers)
    .filter(([nodeId, answer]) => {
      const isRedFlagNode = nodeId.startsWith("RF_") || nodeId.startsWith("REDFLAG_");
      return isRedFlagNode && answer === "yes";
    })
    .map(([nodeId]) => nodeId);

  return {
    hasRedFlag: triggeredFlags.length > 0,
    triggeredFlags,
  };
}
