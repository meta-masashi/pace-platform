/**
 * @jest-environment node
 */
/**
 * Integration tests for the triage API route:
 *   GET /api/triage?team_id=<id>
 *
 * Tests both the Supabase data path and the mock-data fallback.
 * Mocks: @/lib/supabase/server, next/headers
 */

// ── Mock next/headers ────────────────────────────────────────────────────────
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    getAll: jest.fn(() => []),
    set: jest.fn(),
  })),
}));

// ── Supabase mock setup ───────────────────────────────────────────────────────
// We capture the mock factory so individual tests can override return values.

const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    from: mockFrom,
  })),
}));

import { GET as triageRoute } from "@/app/api/triage/route";

// ============================================================
// Test data
// ============================================================

const MOCK_ATHLETES_DB = [
  { id: "athlete-1", name: "田中 健太", position: "FW" },
  { id: "athlete-2", name: "鈴木 大輔", position: "MF" },
  { id: "athlete-3", name: "山田 翔", position: "DF" },
];

function buildDailyMetric(
  athleteId: string,
  dayOffset: number,
  nrs: number,
  hrv: number,
  acwr: number,
  subjectiveCondition = 3
) {
  const date = new Date("2026-03-21");
  date.setDate(date.getDate() - dayOffset);
  return {
    id: `metric-${athleteId}-${dayOffset}`,
    athlete_id: athleteId,
    date: date.toISOString().split("T")[0],
    nrs,
    hrv,
    acwr,
    sleep_score: 3,
    subjective_condition: subjectiveCondition,
    hp_computed: 70,
  };
}

/**
 * Build 14 days of metrics for an athlete. Day 0 = today (latest).
 * Days 1-13 = historical (used for 7-day rolling averages).
 */
function buildMetricsForAthlete(
  athleteId: string,
  opts: {
    latestNrs: number;
    latestHrv: number;
    latestAcwr: number;
    latestSubjective?: number;
    historicalNrs?: number;
    historicalHrv?: number;
    historicalAcwr?: number;
  }
) {
  const {
    latestNrs,
    latestHrv,
    latestAcwr,
    latestSubjective = 3,
    historicalNrs = 2,
    historicalHrv = 65,
    historicalAcwr = 1.1,
  } = opts;

  const metrics = [];
  // Add 13 historical days (indices 13 down to 1)
  for (let i = 13; i >= 1; i--) {
    metrics.push(
      buildDailyMetric(athleteId, i, historicalNrs, historicalHrv, historicalAcwr)
    );
  }
  // Today (day 0 = latest / most recent)
  metrics.push(
    buildDailyMetric(athleteId, 0, latestNrs, latestHrv, latestAcwr, latestSubjective)
  );
  return metrics;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Set up the Supabase mock to return specific athletes and metrics.
 */
function setupSupabaseMock(
  athletes: Array<{ id: string; name: string; position: string }>,
  metricsRows: Array<ReturnType<typeof buildDailyMetric>>
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "athletes") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: athletes,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "daily_metrics") {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: metricsRows,
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: jest.fn().mockReturnValue({
        data: null,
        error: { message: `Unknown table: ${table}` },
      }),
    };
  });
}

/**
 * Set up the Supabase mock to throw an error (forcing fallback to mock data).
 */
function setupSupabaseError() {
  mockFrom.mockImplementation(() => {
    throw new Error("Supabase connection error");
  });
}

// ============================================================
// Tests
// ============================================================

describe("GET /api/triage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("必須パラメータなし: team_id なし -> 400", async () => {
    const req = new Request("http://localhost/api/triage");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toMatch(/team_id/);
  });

  it("正常系: Supabase データからトリアージリストを返す", async () => {
    const athleteMetrics = [
      ...buildMetricsForAthlete("athlete-1", {
        latestNrs: 7, latestHrv: 42, latestAcwr: 1.62,
        historicalNrs: 2, historicalHrv: 65, historicalAcwr: 1.1,
      }),
      ...buildMetricsForAthlete("athlete-2", {
        latestNrs: 4, latestHrv: 60, latestAcwr: 1.35,
        historicalNrs: 2, historicalHrv: 60, historicalAcwr: 1.1,
      }),
      ...buildMetricsForAthlete("athlete-3", {
        latestNrs: 1, latestHrv: 65, latestAcwr: 1.05,
        historicalNrs: 1, historicalHrv: 65, historicalAcwr: 1.0,
      }),
    ];

    setupSupabaseMock(MOCK_ATHLETES_DB, athleteMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("team_id", "team-1");
    expect(data).toHaveProperty("computed_at");
    expect(data).toHaveProperty("entries");
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBe(3);
  });

  it("各エントリが正しい shape を持つ", async () => {
    const athleteMetrics = buildMetricsForAthlete("athlete-1", {
      latestNrs: 2, latestHrv: 65, latestAcwr: 1.0,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[0]], athleteMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries[0];
    expect(entry).toHaveProperty("athlete_id");
    expect(entry).toHaveProperty("athlete_name");
    expect(entry).toHaveProperty("position");
    expect(entry).toHaveProperty("priority");
    expect(["critical", "watchlist", "normal"]).toContain(entry.priority);
    expect(entry).toHaveProperty("triggers");
    expect(Array.isArray(entry.triggers)).toBe(true);
    expect(entry).toHaveProperty("nrs");
    expect(entry).toHaveProperty("hrv");
    expect(entry).toHaveProperty("acwr");
    expect(entry).toHaveProperty("last_updated");
  });

  it("NRS >= 7 の選手は priority: critical になる", async () => {
    const criticalMetrics = buildMetricsForAthlete("athlete-1", {
      latestNrs: 7,
      latestHrv: 65,
      latestAcwr: 1.1,
      historicalNrs: 2,
      historicalHrv: 65,
      historicalAcwr: 1.1,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[0]], criticalMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries.find(
      (e: { athlete_id: string; priority: string }) => e.athlete_id === "athlete-1"
    );
    expect(entry).toBeDefined();
    // NRS 7 >= NRS_CRITICAL(6), so must be critical
    expect(entry.priority).toBe("critical");
  });

  it("NRS 4-5 の選手は priority: watchlist 以上になる", async () => {
    const watchlistMetrics = buildMetricsForAthlete("athlete-2", {
      latestNrs: 5,
      latestHrv: 60,
      latestAcwr: 1.2,
      historicalNrs: 2,
      historicalHrv: 60,
      historicalAcwr: 1.1,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[1]], watchlistMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries.find(
      (e: { athlete_id: string; priority: string }) => e.athlete_id === "athlete-2"
    );
    expect(entry).toBeDefined();
    // NRS 5 >= NRS_WATCHLIST(4) => watchlist or critical
    expect(["watchlist", "critical"]).toContain(entry.priority);
  });

  it("ACWR > 1.5 の選手は priority: critical になる", async () => {
    const highAcwrMetrics = buildMetricsForAthlete("athlete-1", {
      latestNrs: 1,
      latestHrv: 65,
      latestAcwr: 1.6, // > ACWR_CRITICAL(1.5)
      historicalNrs: 1,
      historicalHrv: 65,
      historicalAcwr: 1.1,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[0]], highAcwrMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries.find(
      (e: { athlete_id: string; priority: string }) => e.athlete_id === "athlete-1"
    );
    expect(entry).toBeDefined();
    expect(entry.priority).toBe("critical");
  });

  it("エントリが priority 順（critical -> watchlist -> normal）でソートされる", async () => {
    const athleteMetrics = [
      // athlete-3: normal (low NRS, normal ACWR)
      ...buildMetricsForAthlete("athlete-3", {
        latestNrs: 0, latestHrv: 70, latestAcwr: 1.0,
        historicalNrs: 0, historicalHrv: 70, historicalAcwr: 1.0,
      }),
      // athlete-2: watchlist (NRS 5)
      ...buildMetricsForAthlete("athlete-2", {
        latestNrs: 5, latestHrv: 60, latestAcwr: 1.2,
        historicalNrs: 2, historicalHrv: 60, historicalAcwr: 1.1,
      }),
      // athlete-1: critical (NRS 8)
      ...buildMetricsForAthlete("athlete-1", {
        latestNrs: 8, latestHrv: 42, latestAcwr: 1.62,
        historicalNrs: 2, historicalHrv: 65, historicalAcwr: 1.1,
      }),
    ];

    setupSupabaseMock(MOCK_ATHLETES_DB, athleteMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const priorities: string[] = data.entries.map(
      (e: { priority: string }) => e.priority
    );

    // Verify sorted order: critical entries come before watchlist, watchlist before normal
    const priorityRank: Record<string, number> = { critical: 0, watchlist: 1, normal: 2 };
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(priorityRank[priorities[i]]).toBeLessThanOrEqual(
        priorityRank[priorities[i + 1]]
      );
    }
  });

  it("Supabase がゼロ件の場合: モックデータにフォールバックする", async () => {
    // Return empty athletes array from Supabase
    mockFrom.mockImplementation((table: string) => {
      if (table === "athletes") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      };
    });

    // Use team-1 which has athletes in mock data
    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("entries");
    // Mock data has 6 athletes for team-1
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it("Supabase エラー時: モックデータにフォールバックする", async () => {
    setupSupabaseError();

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("team_id", "team-1");
    expect(Array.isArray(data.entries)).toBe(true);
  });

  it("存在しない team_id: 空エントリを返す", async () => {
    // Return empty athletes (Supabase fallback)
    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    }));

    const req = new Request("http://localhost/api/triage?team_id=unknown-team");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("entries");
    expect(data.entries).toEqual([]);
  });

  it("NRS スパイクトリガーが検出される", async () => {
    // Historical NRS is 2, but today's is 6 (spike of 4 >= NRS_SPIKE_THRESHOLD=3)
    const spikeMetrics = buildMetricsForAthlete("athlete-1", {
      latestNrs: 6,
      latestHrv: 65,
      latestAcwr: 1.1,
      historicalNrs: 2, // avg ~2
      historicalHrv: 65,
      historicalAcwr: 1.1,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[0]], spikeMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries.find(
      (e: { athlete_id: string }) => e.athlete_id === "athlete-1"
    );
    expect(entry).toBeDefined();
    expect(entry.triggers).toContain("nrs_spike");
  });

  it("HRV 急落トリガーが検出される", async () => {
    // Historical HRV avg ~70, today drops to 55 (21% drop >= HRV_DROP_PERCENT=15%)
    const hrvDropMetrics = buildMetricsForAthlete("athlete-1", {
      latestNrs: 1,
      latestHrv: 55,
      latestAcwr: 1.1,
      historicalNrs: 1,
      historicalHrv: 70, // avg ~70
      historicalAcwr: 1.1,
    });

    setupSupabaseMock([MOCK_ATHLETES_DB[0]], hrvDropMetrics);

    const req = new Request("http://localhost/api/triage?team_id=team-1");
    const res = await triageRoute(req as Parameters<typeof triageRoute>[0]);
    const data = await res.json();

    const entry = data.entries.find(
      (e: { athlete_id: string }) => e.athlete_id === "athlete-1"
    );
    expect(entry).toBeDefined();
    expect(entry.triggers).toContain("hrv_drop");
  });
});
