/**
 * AI service throws descriptive `Error` messages (not always `HttpError`)
 * with these prefixes after validation/retry failure. Map them to HTTP 422.
 */
const AI_VALIDATION_PREFIXES = [
  "parseResume:",
  "analyzeJob:",
  "calculateMatch:",
] as const;

export function isAiValidationErrorMessage(message: string): boolean {
  return AI_VALIDATION_PREFIXES.some((prefix) => message.startsWith(prefix));
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** User-safe message for unexpected 500s in production. */
export const INTERNAL_ERROR_PUBLIC_MESSAGE = "Internal server error";
