// Safe JSON parsing for AI provider responses.
// AI output is often "mostly JSON" — fenced in markdown, surrounded by prose,
// or otherwise non-strict. This utility tolerates those cases without doing
// any schema validation or value normalization (that lives in ai.service.ts).

function tryParse<T>(candidate: string): T | undefined {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return undefined;
  }
}

function extractJsonSubstring(raw: string): string | undefined {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return undefined;
  }
  return raw.slice(first, last + 1);
}

/**
 * Parse JSON produced by an AI provider.
 *
 * Strategy:
 *   1. JSON.parse the raw string.
 *   2. If that fails, slice between the first `{` and last `}` and try again.
 *   3. If that still fails, throw.
 *
 * This function does NOT validate shape, coerce types, clamp numbers, or
 * strip `%` suffixes — callers (ai.service.ts) own that.
 */
export function parseJsonFromAi<T>(raw: string): T {
  const cleaned = raw.trim();

  const direct = tryParse<T>(cleaned);
  if (direct !== undefined) {
    return direct;
  }

  const candidate = extractJsonSubstring(cleaned);
  if (candidate !== undefined) {
    const extracted = tryParse<T>(candidate);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  throw new Error(
    "Failed to parse AI JSON response: no valid JSON object found"
  );
}
