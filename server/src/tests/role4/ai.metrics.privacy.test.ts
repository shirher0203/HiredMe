/**
 * AI performance metrics exist to answer "how long did this take and how often
 * did it retry". They must never become a content log.
 *
 * These tests assert the negative: with metrics fully enabled, no prompt text,
 * no model output, no CV or job content and no API key reaches the log sink.
 * The truncated-preview hooks stay silent unless DEBUG_AI_PAYLOADS is explicitly
 * turned on, which must never happen in production.
 */

import {
  getAiRequestMetrics,
  logAiOutputPreview,
  logAiPromptPreview,
  logAiRequestSummary,
  runWithAiMetrics,
  __resetAiLoggerSinkForTesting,
  __setAiLoggerSinkForTesting,
} from "../../services/ai/ai.logger";
import {
  callAi,
  __resetAiSleepForTesting,
  __resetAiTransportForTesting,
  __setAiSleepForTesting,
  __setAiTransportForTesting,
} from "../../services/ai/ai.client";

const RESUME_MARKER = "CANDIDATE-CV-SECRET-42";
const OUTPUT_MARKER = "MODEL-OUTPUT-SECRET-99";
const KEY_MARKER = "AIza-metrics-secret-key";

const ENV_KEYS = [
  "DEBUG_AI",
  "DEBUG_AI_PAYLOADS",
  "USE_MOCK_AI",
  "GEMINI_API_KEY",
  "AI_MAX_RETRIES",
] as const;

type Snapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

interface Captured {
  level: string;
  event: string;
  data: Record<string, unknown>;
}

let snapshot: Snapshot;
let captured: Captured[];

function serializeCaptured(): string {
  return JSON.stringify(captured);
}

function statusError(status: number): Error {
  const err = new Error(`provider said [${status} nope]`);
  (err as unknown as { status: number }).status = status;
  return err;
}

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];

  captured = [];
  __setAiLoggerSinkForTesting((event) => {
    captured.push({ level: event.level, event: event.event, data: event.data });
  });

  process.env.DEBUG_AI = "true";
  delete process.env.DEBUG_AI_PAYLOADS;
  process.env.USE_MOCK_AI = "false";
  process.env.GEMINI_API_KEY = KEY_MARKER;
  delete process.env.AI_MAX_RETRIES;

  __setAiSleepForTesting(async () => {});
});

afterEach(() => {
  __resetAiLoggerSinkForTesting();
  __resetAiTransportForTesting();
  __resetAiSleepForTesting();
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("payload previews are off unless explicitly enabled", () => {
  it("emits nothing when DEBUG_AI_PAYLOADS is unset", () => {
    logAiPromptPreview("parseResume", `resume text ${RESUME_MARKER}`);
    logAiOutputPreview("parseResume", `output ${OUTPUT_MARKER}`);

    expect(captured).toEqual([]);
  });

  it("emits nothing when DEBUG_AI_PAYLOADS is set to anything but true", () => {
    for (const value of ["false", "1", "yes", ""]) {
      process.env.DEBUG_AI_PAYLOADS = value;
      logAiPromptPreview("parseResume", `resume text ${RESUME_MARKER}`);
      logAiOutputPreview("parseResume", `output ${OUTPUT_MARKER}`);
    }

    expect(captured).toEqual([]);
  });

  it("emits nothing when DEBUG_AI itself is off, even with payloads requested", () => {
    process.env.DEBUG_AI = "false";
    process.env.DEBUG_AI_PAYLOADS = "true";

    logAiPromptPreview("parseResume", `resume text ${RESUME_MARKER}`);
    logAiOutputPreview("parseResume", `output ${OUTPUT_MARKER}`);

    expect(captured).toEqual([]);
  });
});

describe("client call metrics carry no content", () => {
  it("logs sizes and timings but neither the prompt nor the output", async () => {
    __setAiTransportForTesting(async () => ({
      text: `{"value":"${OUTPUT_MARKER}"}`,
    }));

    await callAi(`Analyse this resume: ${RESUME_MARKER}`);

    const serialized = serializeCaptured();
    expect(captured.length).toBeGreaterThan(0);
    expect(serialized).not.toContain(RESUME_MARKER);
    expect(serialized).not.toContain(OUTPUT_MARKER);
    expect(serialized).not.toContain(KEY_MARKER);

    const call = captured.find((entry) => entry.event === "ai.client.call");
    expect(call).toBeDefined();
    expect(typeof call!.data.promptChars).toBe("number");
    expect(typeof call!.data.outputChars).toBe("number");
    expect(typeof call!.data.durationMs).toBe("number");
    expect(Object.keys(call!.data).sort()).toEqual([
      "cacheHit",
      "durationMs",
      "model",
      "outputChars",
      "promptChars",
    ]);
  });

  it("logs a retry without leaking the prompt", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      if (attempts === 1) throw statusError(503);
      return { text: '{"ok":true}' };
    });

    await callAi(`Job description: ${RESUME_MARKER}`);

    const retry = captured.find((entry) => entry.event === "ai.client.retry");
    expect(retry).toBeDefined();
    expect(retry!.data.attempt).toBe(1);
    expect(retry!.data.backoffMs).toBe(500);
    expect(serializeCaptured()).not.toContain(RESUME_MARKER);
  });
});

describe("per-request aggregate", () => {
  it("accumulates call count, duration and retries within one request", async () => {
    __setAiTransportForTesting(async () => ({ text: '{"ok":true}' }));

    const metrics = await runWithAiMetrics(async (m) => {
      await callAi("first");
      await callAi("second");
      return m;
    });

    expect(metrics.aiCallCount).toBe(2);
    expect(metrics.totalAiMs).toBeGreaterThanOrEqual(0);
    expect(metrics.retryCount).toBe(0);
  });

  it("counts retries and the extra attempts they cause", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      if (attempts <= 2) throw statusError(503);
      return { text: '{"ok":true}' };
    });

    const metrics = await runWithAiMetrics(async (m) => {
      await callAi("prompt");
      return m;
    });

    expect(metrics.retryCount).toBe(2);
    // Two failed attempts plus the successful one.
    expect(metrics.aiCallCount).toBe(3);
  });

  it("keeps concurrent requests isolated from each other", async () => {
    __setAiTransportForTesting(async ({ prompt }) => {
      await new Promise((resolve) => setTimeout(resolve, prompt === "slow" ? 15 : 1));
      return { text: '{"ok":true}' };
    });

    const [slow, fast] = await Promise.all([
      runWithAiMetrics(async (m) => {
        await callAi("slow");
        await callAi("slow");
        return { ...m };
      }),
      runWithAiMetrics(async (m) => {
        await callAi("fast");
        return { ...m };
      }),
    ]);

    expect(slow.aiCallCount).toBe(2);
    expect(fast.aiCallCount).toBe(1);
  });

  it("reports no metrics outside a request context", () => {
    expect(getAiRequestMetrics()).toBeUndefined();
  });

  it("does not log a summary for a request that made no AI calls", () => {
    runWithAiMetrics((metrics) => {
      logAiRequestSummary(metrics, {
        method: "GET",
        route: "/api/jobs",
        statusCode: 200,
      });
    });

    expect(captured).toEqual([]);
  });

  it("summarises a request with counts and timings only", async () => {
    __setAiTransportForTesting(async () => ({ text: '{"ok":true}' }));

    await runWithAiMetrics(async (metrics) => {
      await callAi(`resume ${RESUME_MARKER}`);
      logAiRequestSummary(metrics, {
        method: "POST",
        route: "/api/jobs/:id/analyze",
        statusCode: 200,
      });
    });

    const summary = captured.find((entry) => entry.event === "ai.request.summary");
    expect(summary).toBeDefined();
    expect(Object.keys(summary!.data).sort()).toEqual([
      "aiCallCount",
      "method",
      "retryCount",
      "route",
      "statusCode",
      "totalAiMs",
    ]);
    expect(serializeCaptured()).not.toContain(RESUME_MARKER);
  });
});
