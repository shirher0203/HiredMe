/**
 * Total-budget bound for one logical AI operation.
 *
 * The client's per-attempt timeout and retry count bound `callAiWithRetry`, but
 * `withOneRetry` calls it twice — once normally, once with a stricter prompt —
 * so those two limits used to compose multiplicatively: two calls x three
 * attempts x a 30s timeout, roughly three minutes for one service function, and
 * twice that for a Match, which runs two service functions in sequence.
 *
 * A single deadline, created once per operation and shared by every call made on
 * its behalf, is what actually bounds the wait. These tests prove that bound
 * holds no matter how the two layers interleave.
 *
 * Determinism: `Date.now` is stubbed and advanced explicitly by the sleep stub
 * and the transport stub, so elapsed time is exact and nothing really waits.
 */

import {
  AiClientError,
  DEFAULT_TOTAL_BUDGET_MS,
  callAi,
  callAiOnce,
  createAiDeadline,
  getAiTotalBudgetMs,
  __clearAiModelCacheForTesting,
  __resetAiSleepForTesting,
  __resetAiTransportForTesting,
  __setAiSleepForTesting,
  __setAiTransportForTesting,
  type AiTransport,
} from "../../services/ai/ai.client";
import { analyzeJob } from "../../services/ai/ai.service";

const ENV_KEYS = [
  "USE_MOCK_AI",
  "AI_TIMEOUT_MS",
  "AI_MAX_RETRIES",
  "AI_TOTAL_BUDGET_MS",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_KEY",
  "DEBUG_AI",
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

let snapshot: EnvSnapshot;
let now: number;
let sleeps: number[];
let requestedTimeouts: number[];
let nowSpy: jest.SpyInstance<number, []>;

function statusError(status: number): Error {
  const err = new Error(
    `[GoogleGenerativeAI Error]: fetch failed [${status} Provider Says No]`
  );
  (err as unknown as { status: number }).status = status;
  return err;
}

const NO_THROW = Symbol("no-throw");

/** Awaits a rejection and hands back the Error, so its fields can be asserted. */
async function captureError(run: () => Promise<unknown>): Promise<Error> {
  const outcome = await run().then(
    () => NO_THROW,
    (err: unknown) => err
  );
  if (outcome === NO_THROW) {
    throw new Error("expected the operation to reject, but it resolved");
  }
  return outcome instanceof Error ? outcome : new Error(String(outcome));
}

/** Transport that burns the whole timeout it was granted, then fails retryably. */
const hangingThenFailing: AiTransport = async ({ timeoutMs }) => {
  requestedTimeouts.push(timeoutMs);
  now += timeoutMs;
  throw statusError(503);
};

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];

  process.env.USE_MOCK_AI = "false";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.DEBUG_AI = "false";
  delete process.env.AI_TIMEOUT_MS;
  delete process.env.AI_MAX_RETRIES;
  delete process.env.AI_TOTAL_BUDGET_MS;

  now = 1_000_000;
  sleeps = [];
  requestedTimeouts = [];
  nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

  __setAiSleepForTesting(async (ms) => {
    sleeps.push(ms);
    now += ms;
  });
  __clearAiModelCacheForTesting();
});

afterEach(() => {
  // Date.now is a global: leaving it stubbed would give every later suite a
  // frozen 1970 clock. Restore explicitly, then belt-and-braces for any other spy.
  nowSpy.mockRestore();
  jest.restoreAllMocks();
  __resetAiTransportForTesting();
  __resetAiSleepForTesting();
  __clearAiModelCacheForTesting();
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("total budget configuration", () => {
  it("defaults to the documented ceiling", () => {
    expect(getAiTotalBudgetMs()).toBe(DEFAULT_TOTAL_BUDGET_MS);
  });

  it("reads an override from the environment", () => {
    process.env.AI_TOTAL_BUDGET_MS = "12000";
    expect(getAiTotalBudgetMs()).toBe(12_000);
  });

  it("ignores a nonsense override instead of disabling the bound", () => {
    process.env.AI_TOTAL_BUDGET_MS = "not-a-number";
    expect(getAiTotalBudgetMs()).toBe(DEFAULT_TOTAL_BUDGET_MS);
    process.env.AI_TOTAL_BUDGET_MS = "0";
    expect(getAiTotalBudgetMs()).toBe(DEFAULT_TOTAL_BUDGET_MS);
  });

  it("creates a deadline one budget ahead of the clock", () => {
    process.env.AI_TOTAL_BUDGET_MS = "20000";
    expect(createAiDeadline()).toBe(now + 20_000);
  });
});

describe("per-attempt timeout clamping", () => {
  it("clamps the attempt timeout to the budget that remains", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    __setAiTransportForTesting(hangingThenFailing);

    // Only 5s of budget left, so the attempt must not be granted 30s.
    await expect(
      callAiOnce("prompt", { deadlineAt: now + 5_000 })
    ).rejects.toThrow();

    expect(requestedTimeouts).toEqual([5_000]);
  });

  it("uses the full per-attempt timeout when the budget is larger", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    __setAiTransportForTesting(hangingThenFailing);

    await expect(
      callAiOnce("prompt", { deadlineAt: now + 120_000 })
    ).rejects.toThrow();

    expect(requestedTimeouts).toEqual([30_000]);
  });

  it("refuses to start an attempt once the deadline has passed", async () => {
    let called = 0;
    __setAiTransportForTesting(async () => {
      called += 1;
      return { text: '{"ok":true}' };
    });

    await expect(
      callAiOnce("prompt", { deadlineAt: now - 1 })
    ).rejects.toThrow(/exceeded its .*total budget/);

    // The point of the guard: no provider request is issued at all.
    expect(called).toBe(0);
  });

  it("marks budget exhaustion non-retryable so no layer retries into it", async () => {
    __setAiTransportForTesting(async () => ({ text: '{"ok":true}' }));

    await expect(
      callAi("prompt", { deadlineAt: now - 1 })
    ).rejects.toMatchObject({
      name: "AiClientError",
      retryable: false,
    });
    expect(sleeps).toEqual([]);
  });
});

describe("retry abandonment when the budget runs out", () => {
  it("stops retrying rather than waiting out a backoff it cannot afford", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_TOTAL_BUDGET_MS = "45000";
    __setAiTransportForTesting(hangingThenFailing);

    const start = now;
    await expect(callAi("prompt", { deadlineAt: createAiDeadline() })).rejects.toThrow(
      /503/
    );

    // 30000 (clamped to the full timeout) + 500 backoff + 14500 (clamped to the
    // remainder) = exactly the budget, at which point the 1500ms backoff is
    // unaffordable and the loop gives up instead of running over.
    expect(requestedTimeouts).toEqual([30_000, 14_500]);
    expect(sleeps).toEqual([500]);
    expect(now - start).toBe(45_000);
  });

  it("surfaces the provider error, not a budget error, when it gives up mid-retry", async () => {
    process.env.AI_TOTAL_BUDGET_MS = "45000";
    __setAiTransportForTesting(hangingThenFailing);

    const err = await captureError(() =>
      callAi("prompt", { deadlineAt: createAiDeadline() })
    );

    // The caller needs the reason the provider failed; the budget only decided
    // when to stop asking.
    expect(err.message).toMatch(/503/);
  });

  it("still fails fast on a non-retryable status even with budget to spare", async () => {
    process.env.AI_TOTAL_BUDGET_MS = "600000";
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      throw statusError(400);
    });

    await expect(
      callAi("prompt", { deadlineAt: createAiDeadline() })
    ).rejects.toThrow(/400/);

    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("still fails fast on a missing provider key", async () => {
    process.env.AI_TOTAL_BUDGET_MS = "600000";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_KEY;
    __resetAiTransportForTesting();

    await expect(
      callAi("prompt", { deadlineAt: createAiDeadline() })
    ).rejects.toThrow(/Missing GEMINI_API_KEY/);

    expect(sleeps).toEqual([]);
  });

  it("leaves an unbudgeted call on the per-call limits alone", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    __setAiTransportForTesting(hangingThenFailing);

    // No deadlineAt: remaining budget is infinite, so the retry count is the
    // only limit and every attempt gets the full timeout.
    await expect(callAi("prompt")).rejects.toThrow(/503/);

    expect(requestedTimeouts).toEqual([30_000, 30_000, 30_000]);
    expect(sleeps).toEqual([500, 1500]);
  });
});

describe("the bound holds across the service layer's validation retry", () => {
  const INVALID_BUT_PARSEABLE = '{"roleTitle":"x"}';

  it("bounds a whole service function when the transport keeps hanging", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_TOTAL_BUDGET_MS = "45000";
    __setAiTransportForTesting(hangingThenFailing);

    const start = now;
    await expect(analyzeJob("some job description")).rejects.toThrow();

    // Without the shared deadline this path could reach six attempts across the
    // two calls; the budget stops it at two and the total never exceeds it.
    expect(now - start).toBeLessThanOrEqual(45_000);
    expect(requestedTimeouts.length).toBeLessThanOrEqual(3);
  });

  it("spans both calls: a fast invalid answer then a hang still stays in budget", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_TOTAL_BUDGET_MS = "45000";

    let call = 0;
    __setAiTransportForTesting(async ({ timeoutMs }) => {
      call += 1;
      requestedTimeouts.push(timeoutMs);
      if (call === 1) {
        // Valid JSON, invalid shape: transport succeeds, validation fails, so
        // the service layer re-asks with the stricter prompt.
        return { text: INVALID_BUT_PARSEABLE };
      }
      now += timeoutMs;
      throw statusError(503);
    });

    const start = now;
    await expect(analyzeJob("some job description")).rejects.toThrow();

    // Both calls happened, proving the deadline is shared rather than per-call.
    expect(call).toBeGreaterThan(1);
    expect(now - start).toBeLessThanOrEqual(45_000);
  });

  it("gives the second call only what the first left behind", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_TOTAL_BUDGET_MS = "45000";

    let call = 0;
    const grants: number[] = [];
    __setAiTransportForTesting(async ({ timeoutMs }) => {
      call += 1;
      grants.push(timeoutMs);
      if (call === 1) {
        // Consume 20s and hand back an unusable shape.
        now += 20_000;
        return { text: INVALID_BUT_PARSEABLE };
      }
      now += timeoutMs;
      throw statusError(503);
    });

    await expect(analyzeJob("some job description")).rejects.toThrow();

    expect(grants[0]).toBe(30_000);
    // 45000 - 20000 already spent: the stricter re-ask cannot be granted 30s.
    expect(grants[1]).toBe(25_000);
  });

  it("fails the stricter re-ask immediately when the first call spent it all", async () => {
    process.env.AI_TIMEOUT_MS = "30000";
    process.env.AI_TOTAL_BUDGET_MS = "30000";

    let call = 0;
    __setAiTransportForTesting(async ({ timeoutMs }) => {
      call += 1;
      if (call === 1) {
        now += 30_000;
        return { text: INVALID_BUT_PARSEABLE };
      }
      now += timeoutMs;
      return { text: INVALID_BUT_PARSEABLE };
    });

    const err = await captureError(() => analyzeJob("some job description"));

    expect(err).toBeInstanceOf(AiClientError);
    expect(err.message).toMatch(/exceeded its .*total budget/);
    // The second call was refused before reaching the provider.
    expect(call).toBe(1);
  });
});
