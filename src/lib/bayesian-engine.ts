import type { AssessmentNode, AssessmentType, AnswerValue, DiagnosisResult } from "@/types";
import type { RiskLevel, AxisFinding, AssessmentSummary } from "@/types";

// ============================================================
// Core interfaces
// ============================================================

export interface InferenceState {
  sessionId: string;
  athleteId: string;
  staffId: string;
  assessmentType: AssessmentType;
  responses: Array<{
    node_id: string;
    answer: AnswerValue;
    lr_yes: number;
    lr_no: number;
    target_axis: string;
    prescription_tags: string[];
    contraindication_tags: string[];
  }>;
  answeredNodes: Set<string>;
  isEmergency: boolean;
  startedAt: string;
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
  // injuryRegion kept for backward compat with start/route.ts call signature
  _injuryRegion = "general"
): InferenceState {
  return {
    sessionId,
    athleteId,
    staffId,
    assessmentType,
    responses: [],
    answeredNodes: new Set(),
    isEmergency: false,
    startedAt: new Date().toISOString(),
  };
}

/** Receive a new answer and return updated InferenceState. */
export function processAnswer(
  state: InferenceState,
  node: AssessmentNode,
  answer: AnswerValue
): InferenceState {
  const newResponses = [
    ...state.responses,
    {
      node_id: node.node_id,
      answer,
      lr_yes: node.lr_yes,
      lr_no: node.lr_no,
      target_axis: node.target_axis,
      prescription_tags: node.prescription_tags ?? [],
      contraindication_tags: node.contraindication_tags ?? [],
    },
  ];

  const newAnswered = new Set(state.answeredNodes);
  newAnswered.add(node.node_id);

  // Emergency: RedFlag axis with a "yes" answer that has a high LR
  const isEmergency =
    state.isEmergency ||
    (node.target_axis === "RedFlag" && answer === "yes" && node.lr_yes >= 5);

  return {
    ...state,
    responses: newResponses,
    answeredNodes: newAnswered,
    isEmergency,
  };
}

/**
 * Alias kept for backward compat with answer/route.ts which still calls updatePosterior.
 * Internally delegates to processAnswer.
 */
export function updatePosterior(
  state: InferenceState,
  node: AssessmentNode,
  answer: AnswerValue
): InferenceState {
  return processAnswer(state, node, answer);
}

/**
 * Select the next question to ask.
 * Priority: RedFlag > Acute > Acute_Tissue > Meta > highest information gain
 */
export function selectNextNode(
  state: InferenceState,
  availableNodes: AssessmentNode[]
): AssessmentNode | null {
  const unanswered = availableNodes.filter(
    (n) => !state.answeredNodes.has(n.node_id)
  );
  if (unanswered.length === 0) return null;

  const PRIORITY_AXES = ["RedFlag", "Acute", "Acute_Tissue", "Meta"];

  for (const priorityAxis of PRIORITY_AXES) {
    const highPriority = unanswered.filter(
      (n) => n.target_axis === priorityAxis
    );
    if (highPriority.length > 0) {
      return highPriority.sort((a, b) => b.lr_yes - a.lr_yes)[0];
    }
  }

  // Fallback: pick by highest information gain proxy = |log(LR_yes) - log(LR_no)|
  return unanswered.sort((a, b) => {
    const igA = Math.abs(
      Math.log(Math.max(a.lr_yes, 0.01)) - Math.log(Math.max(a.lr_no, 0.01))
    );
    const igB = Math.abs(
      Math.log(Math.max(b.lr_yes, 0.01)) - Math.log(Math.max(b.lr_no, 0.01))
    );
    return igB - igA;
  })[0];
}

/** Determine whether the session should end. */
export function shouldTerminate(state: InferenceState): boolean {
  const n = state.responses.length;
  if (state.isEmergency) return true;
  if (n < 5) return false;
  if (n >= 15) return true;

  const sigFindings = state.responses.filter(
    (r) =>
      (r.answer === "yes" && r.lr_yes > 2) ||
      (r.answer === "no" && r.lr_no < 0.5)
  ).length;
  return sigFindings >= 3;
}

/**
 * Alias for shouldTerminate — kept for backward compat with answer/route.ts
 * which calls isSessionComplete.
 */
export function isSessionComplete(state: InferenceState): boolean {
  return shouldTerminate(state);
}

/**
 * Build a multi-axis AssessmentSummary from the current state.
 */
export function computeSummary(
  state: InferenceState,
  allNodes: AssessmentNode[]
): AssessmentSummary {
  const nodeMap = new Map(allNodes.map((n) => [n.node_id, n]));

  // Build positive findings from yes-answers with LR_yes > 1.5
  const positiveFindings: AxisFinding[] = state.responses
    .filter((r) => r.answer === "yes" && r.lr_yes > 1.5)
    .map((r) => {
      const node = nodeMap.get(r.node_id);
      return {
        axis: r.target_axis,
        nodeId: r.node_id,
        question: node?.question_text ?? r.node_id,
        answer: "yes" as const,
        isSignificant: r.lr_yes > 2.0,
        prescriptionTags: r.prescription_tags.filter((t) => t !== "—"),
        contraindicationTags: r.contraindication_tags.filter((t) => t !== "—"),
      };
    });

  const hasRedFlag =
    positiveFindings.some((f) => f.axis === "RedFlag") || state.isEmergency;
  const hasAcuteInjury = positiveFindings.some(
    (f) =>
      f.axis === "Acute" || f.axis === "Acute_Tissue" || f.axis === "Grade"
  );

  // Risk level
  let riskLevel: RiskLevel = "green";
  if (hasRedFlag) {
    riskLevel = "red";
  } else if (
    hasAcuteInjury ||
    positiveFindings.filter((f) => f.isSignificant).length >= 2
  ) {
    riskLevel = "yellow";
  }

  // Aggregate tags (deduplicated)
  const allPrescriptionTags = [
    ...new Set(positiveFindings.flatMap((f) => f.prescriptionTags)),
  ];
  const allContraindicationTags = [
    ...new Set(positiveFindings.flatMap((f) => f.contraindicationTags)),
  ];

  // Confidence score
  const sigCount = positiveFindings.filter((f) => f.isSignificant).length;
  const confidenceScore = Math.min(
    0.95,
    0.4 + sigCount * 0.15 + state.responses.length * 0.03
  );

  // Human-readable interpretation
  let interpretation = "";
  if (hasRedFlag) {
    interpretation = "緊急所見あり。即座に医師へのエスカレーションが必要です。";
  } else if (hasAcuteInjury) {
    const acuteCount = positiveFindings.filter((f) =>
      f.axis.startsWith("Acute")
    ).length;
    interpretation = `急性外傷の所見が${acuteCount}件確認されました。安静と画像評価を検討してください。`;
  } else if (riskLevel === "yellow") {
    const axes = [...new Set(positiveFindings.map((f) => f.axis))].join("、");
    interpretation = `${axes} に有意な所見が確認されました。段階的負荷管理と定期的なモニタリングを推奨します。`;
  } else {
    interpretation = `現時点では重篤な所見は認められません（${state.responses.length}項目評価済み）。引き続きモニタリングを継続してください。`;
  }

  return {
    riskLevel,
    hasRedFlag,
    hasAcuteInjury,
    positiveFindings,
    allPrescriptionTags,
    allContraindicationTags,
    confidenceScore,
    nodesAnswered: state.responses.length,
    interpretation,
  };
}

/**
 * Backward-compat wrapper for /api/assessment/result (and any other callers
 * that expect DiagnosisResult[]).
 */
export function computeResult(
  state: InferenceState,
  allNodes: AssessmentNode[]
): DiagnosisResult[] {
  const summary = computeSummary(state, allNodes);

  if (summary.hasRedFlag) {
    return [
      {
        diagnosis_code: "RED_FLAG",
        label: "⚠️ 緊急所見 — 医師へのエスカレーション必要",
        probability: 0.99,
        prescriptionTags: [],
        contraindicationTags: summary.allContraindicationTags,
      },
    ];
  }

  const findings = summary.positiveFindings.slice(0, 5).map((f, i) => ({
    diagnosis_code: `FINDING_${i + 1}`,
    label: `[${f.axis}] ${f.question.slice(0, 60)}`,
    probability:
      Math.max(0.3, 0.9 - i * 0.1) * (f.isSignificant ? 1 : 0.7),
    prescriptionTags: f.prescriptionTags,
    contraindicationTags: f.contraindicationTags,
  }));

  if (findings.length === 0) {
    return [
      {
        diagnosis_code: "NO_FINDING",
        label: `現時点で有意な所見なし（${summary.nodesAnswered}項目評価）`,
        probability: 0.85,
        prescriptionTags: [],
        contraindicationTags: [],
      },
    ];
  }

  return findings;
}

/**
 * Alias kept for backward compat with answer/route.ts which calls getResults.
 * Returns DiagnosisResult[] from the current session state.
 * Note: allNodes is not available in the answer route so we pass an empty array
 * and let computeResult handle the empty-node-map case gracefully.
 */
export function getResults(state: InferenceState): DiagnosisResult[] {
  return computeResult(state, []);
}

// ============================================================
// Legacy functions retained for any remaining callers
// ============================================================

/**
 * @deprecated Use processAnswer instead.
 * Kept because start/route.ts passes a 5th injuryRegion arg to initializeSession;
 * the new initializeSession already accepts it (as _injuryRegion).
 */
export function applyAnswer(
  state: InferenceState,
  node: AssessmentNode,
  answer: AnswerValue
): InferenceState {
  return processAnswer(state, node, answer);
}
