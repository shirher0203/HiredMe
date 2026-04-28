/**
 * Live smoke test for the Gemini integration.
 *
 * Purpose: verify that GEMINI_API_KEY in server/.env actually works against
 * the real Gemini API. This is intentionally a throwaway script — not a Jest
 * test — because it hits the network, costs quota, and would be flaky in CI.
 *
 * Usage (from the `server/` directory):
 *   npx ts-node scripts/ai-smoke.ts
 *
 * It forces USE_MOCK_AI=false so the mock path cannot accidentally mask a
 * broken key, then calls the thin client directly with a tiny prompt and
 * prints the raw response.
 */

import "dotenv/config";

process.env.USE_MOCK_AI = "false";

import { callAi } from "../src/services/ai/ai.client";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  if (!apiKey) {
    console.error("FAIL: GEMINI_API_KEY is not set in server/.env");
    process.exit(1);
  }

  console.log(`Model:    ${model}`);
  console.log(`Key:      ${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (len=${apiKey.length})`);
  console.log("Prompt:   Respond with the JSON object {\"ok\": true} and nothing else.");
  console.log("Calling Gemini...");

  const start = Date.now();
  try {
    const text = await callAi(
      'Respond with the JSON object {"ok": true} and nothing else.'
    );
    const ms = Date.now() - start;
    console.log(`\nSUCCESS in ${ms}ms`);
    console.log("Raw response:");
    console.log(text);
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`\nFAIL after ${ms}ms`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
