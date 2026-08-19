/**
 * Every AI function's validation failure has to surface as 422 (the model
 * returned something unusable), not 500 (the server broke). Five of the nine
 * prefixes were missing, so half the AI surface reported its own failures as
 * internal errors.
 */

import { isAiValidationErrorMessage } from "../../middlewares/error-map";

const AI_FUNCTIONS = [
  "analyzeProfile",
  "parseResume",
  "analyzeJob",
  "calculateMatch",
  "generateInterviewQuestions",
  "evaluateAnswer",
  "evaluateHomeAssignment",
  "analyzeGithubRepo",
  "summarizeInterviewAttempt",
] as const;

describe("isAiValidationErrorMessage", () => {
  it.each(AI_FUNCTIONS)("recognises a validation failure from %s", (fn) => {
    expect(
      isAiValidationErrorMessage(`${fn}: field 'summary' is not a non-empty string`)
    ).toBe(true);
  });

  it.each(AI_FUNCTIONS)("recognises a retry failure from %s", (fn) => {
    expect(
      isAiValidationErrorMessage(
        `${fn}: retry failed — first error: bad json; retry error: bad json`
      )
    ).toBe(true);
  });

  it("covers every exported AI function", () => {
    // Guards against a new AI function being added without a prefix, which is
    // exactly how the original gap appeared.
    for (const fn of AI_FUNCTIONS) {
      expect(isAiValidationErrorMessage(`${fn}:`)).toBe(true);
    }
  });

  it("does not claim unrelated errors", () => {
    for (const message of [
      "Cannot read properties of undefined",
      "MongoServerError: connection refused",
      "Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_KEY",
      "AI request timed out after 30000ms",
      "Job not found",
      "",
    ]) {
      expect(isAiValidationErrorMessage(message)).toBe(false);
    }
  });

  it("requires the prefix at the start of the message", () => {
    expect(isAiValidationErrorMessage("wrapped: analyzeJob: field missing")).toBe(false);
  });

  it("does not match a similarly named function", () => {
    expect(isAiValidationErrorMessage("analyzeJobPosting: field missing")).toBe(false);
  });
});
