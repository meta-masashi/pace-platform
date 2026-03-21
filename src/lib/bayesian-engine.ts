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
 * Simulate the posterior after answering `node` with `answer`,
 * restricted to diagnoses relevant to this node's target_axis.
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
      updated[code] = updated[code] * lr;
    }
  }
  return normalize(updated);
}

// ============================================================
// Public API
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
 * >= 8 nodes answered AND top diagnosis confidence > 0.65,
 * OR the session is flagged as an emergency.
 */
export function isSessionComplete(state: InferenceState): boolean {
  if (state.isEmergency) return true;
  if (state.answeredNodes.size < 8) return false;
  const top = getResults(state)[0];
  return top !== undefined && top.probability > 0.65;
}
