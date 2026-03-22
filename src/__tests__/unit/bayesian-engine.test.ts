import {
  initializeSession,
  selectNextNode,
  updatePosterior,
  getResults,
  isSessionComplete,
  computeSummary,
} from "@/lib/bayesian-engine";
import type { AssessmentNode, AssessmentType } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal valid AssessmentNode factory */
function makeNode(overrides: Partial<AssessmentNode> & { node_id: string }): AssessmentNode {
  return {
    file_type: "F1_Acute",
    phase: "主訴",
    category: "pain",
    question_text: "Test question?",
    target_axis: "Axis 5A",
    lr_yes: 2.0,
    lr_no: 0.5,
    kappa: 0.6,
    routing_rules: [],
    prescription_tags: ["rest"],
    contraindication_tags: [],
    time_decay_lambda: 0.01,
    information_gain: 0.5,
    ...overrides,
  };
}

const HIGH_GAIN_NODE = makeNode({
  node_id: "node-high-gain",
  lr_yes: 8.0,
  lr_no: 0.2,
  information_gain: 0.9,
  target_axis: "Axis 5A",
  phase: "主訴",
  prescription_tags: ["load_reduction"],
  contraindication_tags: [],
});

const LOW_GAIN_NODE = makeNode({
  node_id: "node-low-gain",
  lr_yes: 1.2,
  lr_no: 0.9,
  information_gain: 0.1,
  target_axis: "Axis 2A",
  phase: "主訴",
});

const REDFLAG_NODE = makeNode({
  node_id: "node-redflag",
  phase: "RedFlag",
  target_axis: "RedFlag",
  lr_yes: 50,
  lr_no: 0.1,
  information_gain: 0.8,
  contraindication_tags: ["no_sport"],
});

const ANKLE_NODE = makeNode({
  node_id: "node-ankle",
  target_axis: "Axis 5E",
  phase: "触診",
  lr_yes: 3.0,
  lr_no: 0.4,
  information_gain: 0.6,
});

const ASSESSMENT_TYPE: AssessmentType = "F1_Acute";

// ---------------------------------------------------------------------------
// initializeSession
// ---------------------------------------------------------------------------

describe("initializeSession", () => {
  it("creates a session with correct identifiers", () => {
    const session = initializeSession("sess-1", "athlete-1", "staff-1", ASSESSMENT_TYPE);

    expect(session.sessionId).toBe("sess-1");
    expect(session.athleteId).toBe("athlete-1");
    expect(session.staffId).toBe("staff-1");
    expect(session.assessmentType).toBe(ASSESSMENT_TYPE);
  });

  it("starts with an empty answered-node set and empty responses", () => {
    const session = initializeSession("sess-2", "a", "s", ASSESSMENT_TYPE);

    expect(session.answeredNodes.size).toBe(0);
    expect(session.responses).toHaveLength(0);
  });

  it("is not an emergency by default", () => {
    const session = initializeSession("sess-3", "a", "s", ASSESSMENT_TYPE);
    expect(session.isEmergency).toBe(false);
  });

  it("sets a valid ISO startedAt timestamp", () => {
    const before = new Date().toISOString();
    const session = initializeSession("sess-7", "a", "s", ASSESSMENT_TYPE);
    const after = new Date().toISOString();

    expect(session.startedAt >= before).toBe(true);
    expect(session.startedAt <= after).toBe(true);
  });

  it("accepts an optional injuryRegion parameter without throwing", () => {
    // _injuryRegion is accepted but not stored on new InferenceState
    expect(() =>
      initializeSession("sess-5", "a", "s", ASSESSMENT_TYPE, "lower_limb")
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// selectNextNode
// ---------------------------------------------------------------------------

describe("selectNextNode", () => {
  it("returns null when no nodes are available", () => {
    const state = initializeSession("sess-a", "a", "s", ASSESSMENT_TYPE);
    expect(selectNextNode(state, [])).toBeNull();
  });

  it("returns null when all nodes have already been answered", () => {
    let state = initializeSession("sess-b", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");
    state = updatePosterior(state, LOW_GAIN_NODE, "no");

    expect(selectNextNode(state, [HIGH_GAIN_NODE, LOW_GAIN_NODE])).toBeNull();
  });

  it("selects a RedFlag node before other nodes (priority axis)", () => {
    const state = initializeSession("sess-c", "a", "s", ASSESSMENT_TYPE);

    const chosen = selectNextNode(state, [LOW_GAIN_NODE, REDFLAG_NODE]);
    expect(chosen).not.toBeNull();
    expect(chosen!.node_id).toBe(REDFLAG_NODE.node_id);
  });

  it("within non-priority axes, selects the higher LR node", () => {
    const state = initializeSession("sess-d", "a", "s", ASSESSMENT_TYPE);
    // Both nodes are non-priority axes (Axis 5A, Axis 2A)
    const chosen = selectNextNode(state, [LOW_GAIN_NODE, HIGH_GAIN_NODE]);

    expect(chosen).not.toBeNull();
    expect(chosen!.node_id).toBe(HIGH_GAIN_NODE.node_id);
  });

  it("skips an already-answered node", () => {
    let state = initializeSession("sess-e", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");

    const chosen = selectNextNode(state, [HIGH_GAIN_NODE, LOW_GAIN_NODE]);
    expect(chosen).not.toBeNull();
    expect(chosen!.node_id).toBe(LOW_GAIN_NODE.node_id);
  });
});

// ---------------------------------------------------------------------------
// updatePosterior (delegates to processAnswer)
// ---------------------------------------------------------------------------

describe("updatePosterior", () => {
  it("adds the answered node to answeredNodes", () => {
    let state = initializeSession("sess-f", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");

    expect(state.answeredNodes.has(HIGH_GAIN_NODE.node_id)).toBe(true);
  });

  it("appends a response entry with correct node_id and answer", () => {
    let state = initializeSession("sess-g", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "no");

    expect(state.responses).toHaveLength(1);
    expect(state.responses[0].node_id).toBe(HIGH_GAIN_NODE.node_id);
    expect(state.responses[0].answer).toBe("no");
  });

  it("accumulates multiple responses correctly", () => {
    let state = initializeSession("sess-j", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");
    state = updatePosterior(state, LOW_GAIN_NODE, "no");
    state = updatePosterior(state, ANKLE_NODE, "unclear");

    expect(state.responses).toHaveLength(3);
    expect(state.answeredNodes.size).toBe(3);
  });

  it("does not mutate the original state object", () => {
    const state0 = initializeSession("sess-k", "a", "s", ASSESSMENT_TYPE);
    updatePosterior(state0, HIGH_GAIN_NODE, "yes");

    expect(state0.answeredNodes.size).toBe(0);
    expect(state0.responses).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Red flag detection
// ---------------------------------------------------------------------------

describe("Red flag detection", () => {
  it("answering 'yes' to a RedFlag node with high LR sets isEmergency to true", () => {
    let state = initializeSession("sess-l", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, REDFLAG_NODE, "yes");

    expect(state.isEmergency).toBe(true);
  });

  it("answering 'no' to a RedFlag node does not trigger emergency", () => {
    let state = initializeSession("sess-m", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, REDFLAG_NODE, "no");

    expect(state.isEmergency).toBe(false);
  });

  it("isEmergency remains true even after additional non-red-flag answers", () => {
    let state = initializeSession("sess-n", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, REDFLAG_NODE, "yes");
    state = updatePosterior(state, HIGH_GAIN_NODE, "no");
    state = updatePosterior(state, LOW_GAIN_NODE, "no");

    expect(state.isEmergency).toBe(true);
  });

  it("isSessionComplete returns true immediately when isEmergency is set", () => {
    let state = initializeSession("sess-o", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, REDFLAG_NODE, "yes");

    expect(isSessionComplete(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getResults
// ---------------------------------------------------------------------------

describe("getResults", () => {
  it("returns a non-empty array of DiagnosisResult objects", () => {
    const state = initializeSession("sess-p", "a", "s", ASSESSMENT_TYPE);
    const results = getResults(state);

    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) => {
      expect(typeof r.diagnosis_code).toBe("string");
      expect(typeof r.label).toBe("string");
      expect(typeof r.probability).toBe("number");
    });
  });

  it("results are sorted in descending probability order", () => {
    let state = initializeSession("sess-q", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");

    const results = getResults(state);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].probability).toBeGreaterThanOrEqual(results[i].probability);
    }
  });
});

// ---------------------------------------------------------------------------
// computeSummary
// ---------------------------------------------------------------------------

describe("computeSummary", () => {
  it("returns green risk level with no significant findings", () => {
    const state = initializeSession("sess-sum1", "a", "s", ASSESSMENT_TYPE);
    const summary = computeSummary(state, [HIGH_GAIN_NODE, LOW_GAIN_NODE]);
    expect(summary.riskLevel).toBe("green");
    expect(summary.hasRedFlag).toBe(false);
    expect(summary.positiveFindings).toHaveLength(0);
  });

  it("returns red risk level when emergency is flagged", () => {
    let state = initializeSession("sess-sum2", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, REDFLAG_NODE, "yes");
    const summary = computeSummary(state, [REDFLAG_NODE]);
    expect(summary.riskLevel).toBe("red");
    expect(summary.hasRedFlag).toBe(true);
  });

  it("collects prescription tags from yes answers with LR_yes > 1.5", () => {
    let state = initializeSession("sess-sum3", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");
    const summary = computeSummary(state, [HIGH_GAIN_NODE]);
    expect(summary.allPrescriptionTags).toContain("load_reduction");
  });

  it("nodesAnswered reflects number of responses", () => {
    let state = initializeSession("sess-sum4", "a", "s", ASSESSMENT_TYPE);
    state = updatePosterior(state, HIGH_GAIN_NODE, "yes");
    state = updatePosterior(state, LOW_GAIN_NODE, "no");
    const summary = computeSummary(state, [HIGH_GAIN_NODE, LOW_GAIN_NODE]);
    expect(summary.nodesAnswered).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isSessionComplete
// ---------------------------------------------------------------------------

describe("isSessionComplete", () => {
  it("returns false for a fresh session with no answers", () => {
    const state = initializeSession("sess-v", "a", "s", ASSESSMENT_TYPE);
    expect(isSessionComplete(state)).toBe(false);
  });

  it("returns false when fewer than 5 nodes are answered", () => {
    let state = initializeSession("sess-w", "a", "s", ASSESSMENT_TYPE);
    for (const node of [HIGH_GAIN_NODE, LOW_GAIN_NODE, ANKLE_NODE]) {
      state = updatePosterior(state, node, "yes");
    }
    expect(state.answeredNodes.size).toBe(3);
    expect(isSessionComplete(state)).toBe(false);
  });
});
