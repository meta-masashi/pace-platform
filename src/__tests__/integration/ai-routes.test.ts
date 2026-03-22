/**
 * @jest-environment node
 */
/**
 * Integration tests for AI API routes:
 *   POST /api/ai/soap-assist
 *   POST /api/ai/rehab-menu
 *
 * Mocks: @google/generative-ai, @/lib/supabase/server, @/lib/rate-limit, next/headers
 */

// ── Mock next/headers ────────────────────────────────────────────────────────
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    getAll: jest.fn(() => []),
    set: jest.fn(),
  })),
}));

// ── Mock Supabase server (auth check) ────────────────────────────────────────
const mockGetUser = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// ── Mock @google/generative-ai ───────────────────────────────────────────────
const mockGenerateContent = jest.fn();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// ── Mock @/lib/rate-limit ────────────────────────────────────────────────────
const mockCheckRateLimit = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  extractUserId: jest.fn(() => "test-user"),
}));

// ── Set env vars so auth check fires ────────────────────────────────────────
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

// Default: user is authenticated and rate limit is allowed
beforeEach(() => {
  jest.clearAllMocks();

  mockGetUser.mockResolvedValue({
    data: { user: { id: "staff-1" } },
    error: null,
  });

  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
});

import { POST as soapAssistRoute } from "@/app/api/ai/soap-assist/route";
import { POST as rehabMenuRoute } from "@/app/api/ai/rehab-menu/route";

// ============================================================
// Helpers
// ============================================================

function makePostRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_SOAP_RESPONSE = {
  s_draft: "患者の主訴：膝の痛み（NRS 6/10）",
  o_draft: "膝関節腫脹あり、ROM 屈曲 90° 制限",
  a_draft: "ACL損傷疑い、McMurrayテスト陽性",
  p_draft: "アイシング・圧迫固定。MRI検査を予約。荷重制限 Phase 1。",
};

const MOCK_REHAB_MENU_ITEMS = [
  {
    exercise_name: "アイシング",
    sets: 1,
    reps_or_time: "15",
    unit: "min",
    rpe: undefined,
    cues: "患部を氷嚢で冷却",
    reason: "炎症抑制",
    contraindication_tags: [],
  },
  {
    exercise_name: "タオルハムストリングスストレッチ",
    sets: 3,
    reps_or_time: "30",
    unit: "sec",
    rpe: 12,
    cues: "膝を伸ばしてゆっくり",
    reason: "ハムストリングスの柔軟性改善",
    contraindication_tags: [],
  },
];

// ============================================================
// SOAP Assist tests
// ============================================================

describe("POST /api/ai/soap-assist", () => {
  it("正常系: 有効なリクエストでSOAPドラフトを返す", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue(JSON.stringify(MOCK_SOAP_RESPONSE)),
      },
    });

    const req = makePostRequest("http://localhost/api/ai/soap-assist", {
      athlete_id: "athlete-1",
      assessment_result: {
        primary_diagnosis: {
          diagnosis_code: "KNEE_DX_004",
          label: "膝関節前方不安定性パターン",
          probability: 0.72,
        },
        differentials: [
          { diagnosis_code: "KNEE_DX_003", label: "膝関節メカニカルストレスパターン", probability: 0.18 },
        ],
        prescription_tags: ["ice_compression"],
        contraindication_tags: ["knee_impact"],
        is_emergency: false,
      },
      existing_notes: "膝の痛みで来院",
    });

    const res = await soapAssistRoute(req as Parameters<typeof soapAssistRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("athlete_id", "athlete-1");
    expect(data).toHaveProperty("generated_at");
    expect(data).toHaveProperty("s_draft");
    expect(data).toHaveProperty("o_draft");
    expect(data).toHaveProperty("a_draft");
    expect(data).toHaveProperty("p_draft");
    expect(data).toHaveProperty("fallback_used");
    expect(data).toHaveProperty("cds_disclaimer");
    expect(typeof data.s_draft).toBe("string");
    expect(data.s_draft.length).toBeGreaterThan(0);
  });

  it("認証エラー: user が null -> 401", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = makePostRequest("http://localhost/api/ai/soap-assist", {
      athlete_id: "athlete-1",
      assessment_result: {
        primary_diagnosis: null,
        differentials: [],
        prescription_tags: [],
        contraindication_tags: [],
        is_emergency: false,
      },
    });

    const res = await soapAssistRoute(req as Parameters<typeof soapAssistRoute>[0]);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("バリデーションエラー: 必須フィールドなし -> 400", async () => {
    // Return a user so auth doesn't block
    mockGetUser.mockResolvedValue({
      data: { user: { id: "staff-1" } },
      error: null,
    });

    const req = makePostRequest("http://localhost/api/ai/soap-assist", {
      // athlete_id missing
      assessment_result: null,
    });

    const res = await soapAssistRoute(req as Parameters<typeof soapAssistRoute>[0]);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("レート制限超過 -> 429", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const req = makePostRequest("http://localhost/api/ai/soap-assist", {
      athlete_id: "athlete-1",
      assessment_result: {
        primary_diagnosis: null,
        differentials: [],
        prescription_tags: [],
        contraindication_tags: [],
        is_emergency: false,
      },
    });

    const res = await soapAssistRoute(req as Parameters<typeof soapAssistRoute>[0]);
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    // Should include rate limit headers
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("Gemini 失敗時: フォールバック SOAP ドラフトを返す", async () => {
    // Simulate Gemini returning invalid JSON on all retries
    mockGenerateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue("これはJSON形式ではありません"),
      },
    });

    const req = makePostRequest("http://localhost/api/ai/soap-assist", {
      athlete_id: "athlete-1",
      assessment_result: {
        primary_diagnosis: null,
        differentials: [],
        prescription_tags: [],
        contraindication_tags: [],
        is_emergency: false,
      },
    });

    const res = await soapAssistRoute(req as Parameters<typeof soapAssistRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("fallback_used", true);
    expect(data).toHaveProperty("s_draft");
    expect(data).toHaveProperty("o_draft");
    expect(data).toHaveProperty("a_draft");
    expect(data).toHaveProperty("p_draft");
  });
});

// ============================================================
// Rehab Menu tests
// ============================================================

describe("POST /api/ai/rehab-menu", () => {
  it("正常系: 有効なリクエストでリハビリメニューを返す", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue(JSON.stringify(MOCK_REHAB_MENU_ITEMS)),
      },
    });

    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      diagnosis_code: "KNEE_DX_004",
      phase: 2,
      hard_lock_tags: [],
      soft_lock_tags: [],
      nrs: 3,
      rom: 90,
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("athlete_id", "athlete-1");
    expect(data).toHaveProperty("diagnosis_code", "KNEE_DX_004");
    expect(data).toHaveProperty("phase", 2);
    expect(data).toHaveProperty("generated_at");
    expect(data).toHaveProperty("menu");
    expect(Array.isArray(data.menu)).toBe(true);
    expect(data).toHaveProperty("total_duration_min");
    expect(data).toHaveProperty("fallback_used");
    expect(data).toHaveProperty("cds_disclaimer");

    // Each menu item should have the WorkoutItem shape
    for (const item of data.menu) {
      expect(item).toHaveProperty("exercise_id");
      expect(item).toHaveProperty("exercise_name");
      expect(item).toHaveProperty("sets");
      expect(item).toHaveProperty("reps_or_time");
      expect(item).toHaveProperty("unit");
      expect(item).toHaveProperty("reason");
    }
  });

  it("認証エラー: user が null -> 401", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      diagnosis_code: "KNEE_DX_004",
      phase: 2,
      hard_lock_tags: [],
      soft_lock_tags: [],
      nrs: 3,
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(401);
  });

  it("バリデーションエラー: 必須フィールドなし -> 400", async () => {
    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      // diagnosis_code, phase, nrs missing
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("レート制限超過 -> 429", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      diagnosis_code: "KNEE_DX_004",
      phase: 2,
      hard_lock_tags: [],
      soft_lock_tags: [],
      nrs: 3,
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(429);
  });

  it("Gemini 失敗時: フォールバックメニューを返す", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue("invalid json text"),
      },
    });

    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      diagnosis_code: "KNEE_DX_004",
      phase: 1,
      hard_lock_tags: [],
      soft_lock_tags: [],
      nrs: 5,
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("fallback_used", true);
    expect(Array.isArray(data.menu)).toBe(true);
    expect(data.menu.length).toBeGreaterThan(0);
  });

  it("Hard Lock フィルタリング: hard_lock_tags に一致する種目が除外される", async () => {
    // Menu with one item that has a contraindication matching the hard lock
    const menuWithViolation = [
      {
        exercise_name: "ジャンプスクワット",
        sets: 3,
        reps_or_time: "10",
        unit: "reps",
        rpe: 16,
        cues: "膝を90°まで曲げる",
        reason: "爆発的筋力強化",
        contraindication_tags: ["bilateral_jump"], // matches hard lock
      },
      {
        exercise_name: "レッグプレス",
        sets: 3,
        reps_or_time: "12",
        unit: "reps",
        rpe: 13,
        cues: "フルレンジ",
        reason: "大腿四頭筋強化",
        contraindication_tags: [],
      },
    ];

    mockGenerateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue(JSON.stringify(menuWithViolation)),
      },
    });

    const req = makePostRequest("http://localhost/api/ai/rehab-menu", {
      athlete_id: "athlete-1",
      diagnosis_code: "KNEE_DX_004",
      phase: 3,
      hard_lock_tags: ["bilateral_jump"],
      soft_lock_tags: [],
      nrs: 1,
    });

    const res = await rehabMenuRoute(req as Parameters<typeof rehabMenuRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    // "ジャンプスクワット" should be filtered out
    const exerciseNames = data.menu.map((item: { exercise_name: string }) => item.exercise_name);
    expect(exerciseNames).not.toContain("ジャンプスクワット");
    expect(exerciseNames).toContain("レッグプレス");
  });
});
