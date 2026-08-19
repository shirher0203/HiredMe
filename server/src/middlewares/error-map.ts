/**
 * AI service throws descriptive `Error` messages (not always `HttpError`)
 * with these prefixes after validation/retry failure. Map them to HTTP 422.
 *
 * Every exported AI function is listed. A missing prefix meant the caller got a
 * 500 for what is really an unusable-model-output condition, which is a 422.
 */
const AI_VALIDATION_PREFIXES = [
  "analyzeProfile:",
  "parseResume:",
  "analyzeJob:",
  "calculateMatch:",
  "generateInterviewQuestions:",
  "evaluateAnswer:",
  "evaluateHomeAssignment:",
  "analyzeGithubRepo:",
  "summarizeInterviewAttempt:",
] as const;

export function isAiValidationErrorMessage(message: string): boolean {
  return AI_VALIDATION_PREFIXES.some((prefix) => message.startsWith(prefix));
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** User-safe message for unexpected 500s in production. */
export const INTERNAL_ERROR_PUBLIC_MESSAGE = "Internal server error";
