import { initializeSession } from "@/lib/bayesian-engine";

describe("Bayesian Engine", () => {
  it("initializes session with correct state", () => {
    const state = initializeSession("test-session", "athlete-1", "staff-1");
    expect(state.sessionId).toBe("test-session");
    expect(state.priors).toBeDefined();
    expect(state.answeredNodes.size).toBe(0);
    expect(Object.keys(state.priors).length).toBeGreaterThan(0);
  });

  it("accepts injuryRegion parameter", () => {
    const state = initializeSession("test-session-2", "athlete-1", "staff-1", "F1_Acute", "lower_limb");
    expect(state.injuryRegion).toBe("lower_limb");
  });

  it("defaults injuryRegion to general", () => {
    const state = initializeSession("test-session-3", "athlete-1", "staff-1");
    expect(state.injuryRegion).toBe("general");
  });
});
