/**
 * @jest-environment node
 */
/**
 * Integration tests for the 3-step assessment API flow:
 *   POST /api/assessment/start -> POST /api/assessment/answer -> GET /api/assessment/result
 *
 * Uses real bayesian-engine and session-store (in-memory).
 * Mocks only @/lib/supabase/server and next/headers.
 */

// Mock next/headers (used by supabase/server.ts)
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    getAll: jest.fn(() => []),
    set: jest.fn(),
  })),
}));

// Minimal assessment node fixture — enough for bayesian engine to start a session
const MOCK_NODES = [
  {
    node_id: "P0_001",
    file_type: "F1_Acute",
    phase: "P0",
    category: "context",
    question_text: "テスト質問1",
    target_axis: "pain",
    lr_yes: 2.0,
    lr_no: 0.5,
    kappa: 0.1,
    routing_rules: null,
    prescription_tags: [],
    contraindication_tags: [],
    time_decay_lambda: 0.01,
    evidence_level: "A",
    sort_order: 1,
  },
  {
    node_id: "P0_002",
    file_type: "F1_Acute",
    phase: "P0",
    category: "context",
    question_text: "テスト質問2",
    target_axis: "function",
    lr_yes: 1.5,
    lr_no: 0.7,
    kappa: 0.05,
    routing_rules: null,
    prescription_tags: [],
    contraindication_tags: [],
    time_decay_lambda: 0.01,
    evidence_level: "B",
    sort_order: 2,
  },
];

// Mock Supabase server client — returns fixture nodes so assessment/start works without DB
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    from: jest.fn((table: string) => {
      if (table === "assessment_nodes") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(async () => ({
                data: MOCK_NODES,
                error: null,
              })),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(async () => ({ data: [], error: null })),
          })),
        })),
      };
    }),
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: "staff-1" } },
        error: null,
      })),
    },
  })),
}));

import { POST as startRoute } from "@/app/api/assessment/start/route";
import { POST as answerRoute } from "@/app/api/assessment/answer/route";
import { GET as resultRoute } from "@/app/api/assessment/result/route";

// Clear session store globals between tests so sessions don't leak
beforeEach(() => {
  if (global.__paceSessionStore) {
    global.__paceSessionStore.clear();
  }
  if (global.__paceSessionNodes) {
    global.__paceSessionNodes.clear();
  }
});

// ============================================================
// Helper
// ============================================================

function makePostRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================
// Tests
// ============================================================

describe("Assessment API — /api/assessment/start", () => {
  it("正常系: セッションIDと最初の質問を返す", async () => {
    const req = makePostRequest("http://localhost/api/assessment/start", {
      athlete_id: "athlete-1",
      staff_id: "staff-1",
      assessment_type: "F1_Acute",
    });

    const res = await startRoute(req as Parameters<typeof startRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("session_id");
    expect(typeof data.session_id).toBe("string");
    expect(data.session_id).toMatch(/^session-/);
    expect(data).toHaveProperty("first_question");
    expect(data.first_question).toHaveProperty("node_id");
    expect(data.first_question).toHaveProperty("question_text");
  });

  it("エラー系: 必須フィールド不足 -> 400", async () => {
    const req = makePostRequest("http://localhost/api/assessment/start", {
      // athlete_id missing
      staff_id: "staff-1",
      assessment_type: "F1_Acute",
    });

    const res = await startRoute(req as Parameters<typeof startRoute>[0]);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("エラー系: assessment_type が空 -> 400", async () => {
    const req = makePostRequest("http://localhost/api/assessment/start", {
      athlete_id: "athlete-1",
      staff_id: "staff-1",
      // assessment_type missing
    });

    const res = await startRoute(req as Parameters<typeof startRoute>[0]);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("assessment_type");
  });
});

describe("Assessment API — /api/assessment/answer", () => {
  it("正常系: 回答を処理して次の質問を返す", async () => {
    // First start a session
    const startReq = makePostRequest("http://localhost/api/assessment/start", {
      athlete_id: "athlete-1",
      staff_id: "staff-1",
      assessment_type: "F1_Acute",
    });
    const startRes = await startRoute(startReq as Parameters<typeof startRoute>[0]);
    const startData = await startRes.json();

    const { session_id, first_question } = startData;

    // Then answer the first question
    const answerReq = makePostRequest("http://localhost/api/assessment/answer", {
      session_id,
      node_id: first_question.node_id,
      answer: "no",
    });

    const answerRes = await answerRoute(answerReq as Parameters<typeof answerRoute>[0]);
    expect(answerRes.status).toBe(200);

    const answerData = await answerRes.json();
    expect(answerData).toHaveProperty("is_complete");
    expect(typeof answerData.is_complete).toBe("boolean");
    expect(answerData).toHaveProperty("current_results");
    expect(Array.isArray(answerData.current_results)).toBe(true);
    expect(answerData).toHaveProperty("is_emergency");
  });

  it("エラー系: 存在しないセッションID -> 404", async () => {
    const answerReq = makePostRequest("http://localhost/api/assessment/answer", {
      session_id: "nonexistent-session",
      node_id: "RF_001",
      answer: "no",
    });

    const res = await answerRoute(answerReq as Parameters<typeof answerRoute>[0]);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/session/i);
  });

  it("エラー系: 不正な answer 値 -> 400", async () => {
    // Start a session
    const startReq = makePostRequest("http://localhost/api/assessment/start", {
      athlete_id: "athlete-1",
      staff_id: "staff-1",
      assessment_type: "F1_Acute",
    });
    const startRes = await startRoute(startReq as Parameters<typeof startRoute>[0]);
    const { session_id, first_question } = await startRes.json();

    const answerReq = makePostRequest("http://localhost/api/assessment/answer", {
      session_id,
      node_id: first_question.node_id,
      answer: "maybe", // invalid
    });

    const res = await answerRoute(answerReq as Parameters<typeof answerRoute>[0]);
    expect(res.status).toBe(400);
  });

  it("エラー系: 必須フィールドが空 -> 400", async () => {
    const answerReq = makePostRequest("http://localhost/api/assessment/answer", {
      // session_id missing
      node_id: "RF_001",
      answer: "no",
    });

    const res = await answerRoute(answerReq as Parameters<typeof answerRoute>[0]);
    expect(res.status).toBe(400);
  });
});

describe("Assessment API — Full flow (start -> answer* -> result)", () => {
  it("フルフロー: セッション完了まで回答してresultを取得する", async () => {
    // 1. Start session
    const startReq = makePostRequest("http://localhost/api/assessment/start", {
      athlete_id: "athlete-1",
      staff_id: "staff-1",
      assessment_type: "F1_Acute",
      injury_region: "lower_limb",
    });
    const startRes = await startRoute(startReq as Parameters<typeof startRoute>[0]);
    expect(startRes.status).toBe(200);

    const startData = await startRes.json();
    const sessionId = startData.session_id;
    let currentQuestion = startData.first_question;

    // 2. Answer questions until complete (max 30 iterations to prevent infinite loop)
    let isComplete = false;
    let iterations = 0;
    const MAX_ITERATIONS = 30;

    while (!isComplete && iterations < MAX_ITERATIONS) {
      iterations++;

      const answerReq = makePostRequest("http://localhost/api/assessment/answer", {
        session_id: sessionId,
        node_id: currentQuestion.node_id,
        answer: "no", // always answer "no" to progress through non-emergency path
      });

      const answerRes = await answerRoute(answerReq as Parameters<typeof answerRoute>[0]);
      expect(answerRes.status).toBe(200);

      const answerData = await answerRes.json();
      isComplete = answerData.is_complete;

      if (!isComplete && answerData.next_question) {
        currentQuestion = answerData.next_question;
      } else if (!isComplete && !answerData.next_question) {
        // No more questions to answer but not yet marked complete
        // This can happen when all nodes are answered; break to avoid infinite loop
        break;
      }
    }

    // 3. Get result
    const resultUrl = `http://localhost/api/assessment/result?session_id=${sessionId}`;
    const resultReq = new Request(resultUrl);
    const resultRes = await resultRoute(resultReq as Parameters<typeof resultRoute>[0]);
    expect(resultRes.status).toBe(200);

    const resultData = await resultRes.json();

    // Verify the result shape
    expect(resultData).toHaveProperty("session_id", sessionId);
    expect(resultData).toHaveProperty("athlete_id", "athlete-1");
    expect(resultData).toHaveProperty("staff_id", "staff-1");
    expect(resultData).toHaveProperty("assessment_type", "F1_Acute");
    expect(resultData).toHaveProperty("started_at");
    expect(resultData).toHaveProperty("completed_at");
    expect(resultData).toHaveProperty("is_emergency");
    expect(typeof resultData.is_emergency).toBe("boolean");
    expect(resultData).toHaveProperty("primary_diagnosis");
    expect(resultData).toHaveProperty("differentials");
    expect(Array.isArray(resultData.differentials)).toBe(true);
    expect(resultData).toHaveProperty("prescription_tags");
    expect(Array.isArray(resultData.prescription_tags)).toBe(true);
    expect(resultData).toHaveProperty("contraindication_tags");
    expect(resultData).toHaveProperty("responses");
    expect(Array.isArray(resultData.responses)).toBe(true);
    expect(resultData.responses.length).toBeGreaterThan(0);
  });

  it("result API: session_id なし -> 400", async () => {
    const resultReq = new Request("http://localhost/api/assessment/result");
    const res = await resultRoute(resultReq as Parameters<typeof resultRoute>[0]);
    expect(res.status).toBe(400);
  });

  it("result API: 存在しないセッション -> 404", async () => {
    const resultReq = new Request(
      "http://localhost/api/assessment/result?session_id=nonexistent"
    );
    const res = await resultRoute(resultReq as Parameters<typeof resultRoute>[0]);
    expect(res.status).toBe(404);
  });
});
