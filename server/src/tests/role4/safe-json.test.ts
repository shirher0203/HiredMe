import { parseJsonFromAi } from "../../utils/safe-json";

describe("parseJsonFromAi", () => {
  it("parses a valid JSON string directly", () => {
    const result = parseJsonFromAi<{ a: number; b: string }>(
      '{"a":1,"b":"two"}'
    );
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("parses JSON with surrounding prose", () => {
    const raw =
      'Here is your result:\n{"score":85,"feedback":"good"}\nHope this helps.';
    const result = parseJsonFromAi<{ score: number; feedback: string }>(raw);
    expect(result).toEqual({ score: 85, feedback: "good" });
  });

  it("parses JSON wrapped in a ```json markdown fence", () => {
    const raw = '```json\n{"a":1,"nested":{"b":2}}\n```';
    const result = parseJsonFromAi<{ a: number; nested: { b: number } }>(raw);
    expect(result).toEqual({ a: 1, nested: { b: 2 } });
  });

  it("parses JSON wrapped in a plain ``` fence", () => {
    const raw = '```\n{"ok":true}\n```';
    const result = parseJsonFromAi<{ ok: boolean }>(raw);
    expect(result).toEqual({ ok: true });
  });

  it("throws a descriptive error on invalid JSON", () => {
    expect(() => parseJsonFromAi("not json at all")).toThrow(
      "Failed to parse AI JSON response"
    );
  });

  it("throws when a brace pair exists but the contents are malformed", () => {
    expect(() => parseJsonFromAi('prefix {not: "valid", json} suffix')).toThrow(
      "Failed to parse AI JSON response"
    );
  });
});
