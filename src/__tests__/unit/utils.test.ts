import { formatDateTime } from "@/lib/utils";

describe("Utils", () => {
  it("formatDateTime returns a string", () => {
    const result = formatDateTime("2026-03-22T00:00:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
