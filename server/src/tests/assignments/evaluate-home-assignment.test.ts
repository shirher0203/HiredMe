import { evaluateHomeAssignment } from "../../services/ai/ai.service";

describe("evaluateHomeAssignment (mock mode)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_AI = "true";
  });

  afterAll(() => {
    delete process.env.USE_MOCK_AI;
  });

  it("returns an evaluation with score in 0-100 and string-array fields", async () => {
    const result = await evaluateHomeAssignment({
      code: "function add(a, b) { return a + b; }",
      language: "javascript",
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(Array.isArray(result.improvements)).toBe(true);
    expect(result.strengths.every((s) => typeof s === "string")).toBe(true);
    expect(result.improvements.every((s) => typeof s === "string")).toBe(true);
  });

  it("rejects empty / whitespace-only code", async () => {
    await expect(evaluateHomeAssignment({ code: "   " })).rejects.toThrow(
      "code must be a non-empty string"
    );
  });
});
