/**
 * Reliability envelope of the AI client: timeout, bounded retry, finishReason
 * handling and model-cache keying.
 *
 * No network and no real waiting — the provider transport and the backoff sleep
 * are both swapped for stubs, so a retry sequence that would take two seconds in
 * production runs instantly and its requested delays are asserted directly.
 */

import {
  AiClientError,
  DEFAULT_MAX_RETRIES,
  RETRY_BACKOFF_MS,
  callAi,
  callAiOnce,
  getAiMaxRetries,
  getAiTimeoutMs,
  isRetryableAiError,
  __aiModelCacheSizeForTesting,
  __clearAiModelCacheForTesting,
  __primeAiModelForTesting,
  __resetAiSleepForTesting,
  __resetAiTransportForTesting,
  __setAiSleepForTesting,
  __setAiTransportForTesting,
  type AiTransport,
} from "../../services/ai/ai.client";

const ENV_KEYS = [
  "USE_MOCK_AI",
  "AI_TIMEOUT_MS",
  "AI_MAX_RETRIES",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_KEY",
  "GEMINI_MODEL",
  "DEBUG_AI",
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

let snapshot: EnvSnapshot;
let sleeps: number[];

function statusError(status: number): Error {
  const err = new Error(`[GoogleGenerativeAI Error]: fetch failed [${status} Provider Says No]`);
  (err as unknown as { status: number }).status = status;
  return err;
}

function okResponse(text = '{"ok":true}') {
  return { text };
}

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];

  process.env.USE_MOCK_AI = "false";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.DEBUG_AI = "false";
  delete process.env.AI_TIMEOUT_MS;
  delete process.env.AI_MAX_RETRIES;

  sleeps = [];
  __setAiSleepForTesting(async (ms) => {
    sleeps.push(ms);
  });
  __clearAiModelCacheForTesting();
});

afterEach(() => {
  __resetAiTransportForTesting();
  __resetAiSleepForTesting();
  __clearAiModelCacheForTesting();
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("AI client configuration", () => {
  it("defaults the timeout and retry budget", () => {
    expect(getAiTimeoutMs()).toBe(30_000);
    expect(getAiMaxRetries()).toBe(DEFAULT_MAX_RETRIES);
  });

  it("reads overrides from the environment", () => {
    process.env.AI_TIMEOUT_MS = "1234";
    process.env.AI_MAX_RETRIES = "1";

    expect(getAiTimeoutMs()).toBe(1234);
    expect(getAiMaxRetries()).toBe(1);
  });

  it("ignores nonsense overrides instead of disabling the guard", () => {
    process.env.AI_TIMEOUT_MS = "not-a-number";
    process.env.AI_MAX_RETRIES = "-4";

    expect(getAiTimeoutMs()).toBe(30_000);
    expect(getAiMaxRetries()).toBe(DEFAULT_MAX_RETRIES);
  });

  it("caps the retry budget so a misconfiguration cannot retry forever", () => {
    process.env.AI_MAX_RETRIES = "999";

    expect(getAiMaxRetries()).toBe(5);
  });
});

describe("error classification", () => {
  it("treats overload, throttling and gateway failures as retryable", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableAiError(statusError(status))).toBe(true);
    }
  });

  it("never retries client-side failures", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableAiError(statusError(status))).toBe(false);
    }
  });

  it("reads the status out of the SDK message when no status field is set", () => {
    expect(
      isRetryableAiError(new Error("[GoogleGenerativeAI Error]: [503 Service Unavailable]"))
    ).toBe(true);
    expect(
      isRetryableAiError(new Error("[GoogleGenerativeAI Error]: [400 Bad Request]"))
    ).toBe(false);
  });

  it("treats transport failures as retryable", () => {
    for (const message of [
      "request timed out",
      "ECONNRESET",
      "fetch failed",
      "socket hang up",
      "getaddrinfo ENOTFOUND generativelanguage.googleapis.com",
    ]) {
      expect(isRetryableAiError(new Error(message))).toBe(true);
    }
  });

  it("does not retry an unrecognised error", () => {
    expect(isRetryableAiError(new Error("analyzeJob: field 'roleTitle' is missing"))).toBe(
      false
    );
  });
});

describe("callAi retry policy", () => {
  it("retries a 503 twice and then succeeds, using the documented backoff", async () => {
    let attempts = 0;
    const transport: AiTransport = async () => {
      attempts += 1;
      if (attempts <= 2) throw statusError(503);
      return okResponse('{"recovered":true}');
    };
    __setAiTransportForTesting(transport);

    await expect(callAi("prompt")).resolves.toBe('{"recovered":true}');
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([...RETRY_BACKOFF_MS]);
  });

  it("fails after a single attempt on a 400", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      throw statusError(400);
    });

    await expect(callAi("prompt")).rejects.toThrow(/400/);
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("gives up once the retry budget is exhausted", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      throw statusError(429);
    });

    await expect(callAi("prompt")).rejects.toThrow(/429/);
    expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
  });

  it("keeps total backoff inside the documented ceiling", async () => {
    __setAiTransportForTesting(async () => {
      throw statusError(503);
    });

    await expect(callAi("prompt")).rejects.toThrow();

    const totalBackoff = sleeps.reduce((sum, ms) => sum + ms, 0);
    expect(sleeps).toHaveLength(DEFAULT_MAX_RETRIES);
    expect(totalBackoff).toBe(2000);
    expect(totalBackoff).toBeLessThanOrEqual(
      RETRY_BACKOFF_MS.reduce((sum, ms) => sum + ms, 0)
    );
  });

  it("honours a reduced retry budget", async () => {
    process.env.AI_MAX_RETRIES = "0";
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      throw statusError(503);
    });

    await expect(callAi("prompt")).rejects.toThrow();
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("retries an empty provider response", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      if (attempts === 1) return { text: "   " };
      return okResponse('{"second":true}');
    });

    await expect(callAi("prompt")).resolves.toBe('{"second":true}');
    expect(attempts).toBe(2);
  });
});

describe("callAiOnce", () => {
  it("times out a hanging provider call", async () => {
    process.env.AI_TIMEOUT_MS = "20";
    __setAiTransportForTesting(
      () =>
        new Promise(() => {
          /* never settles */
        })
    );

    await expect(callAiOnce("prompt")).rejects.toThrow(/timed out after 20ms/);
  });

  it("does not retry, even for a retryable failure", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      throw statusError(503);
    });

    await expect(callAiOnce("prompt")).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("refuses to run in mock mode", async () => {
    process.env.USE_MOCK_AI = "true";

    await expect(callAiOnce("prompt")).rejects.toThrow(/mock mode/);
  });

  it("passes the resolved generation config to the provider", async () => {
    const seen: unknown[] = [];
    __setAiTransportForTesting(async ({ config, timeoutMs }) => {
      seen.push({ config, timeoutMs });
      return okResponse();
    });

    await callAiOnce("prompt", { temperature: 0.9, maxOutputTokens: 512, jsonMode: true });

    expect(seen).toEqual([
      {
        config: {
          temperature: 0.9,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
        timeoutMs: 30_000,
      },
    ]);
  });

  it("defaults temperature and omits JSON mode when not requested", async () => {
    const seen: unknown[] = [];
    __setAiTransportForTesting(async ({ config }) => {
      seen.push(config);
      return okResponse();
    });

    await callAiOnce("prompt");

    expect(seen).toEqual([{ temperature: 0.2 }]);
  });
});

describe("finishReason handling", () => {
  const cases: Array<[string, RegExp]> = [
    ["MAX_TOKENS", /truncated/i],
    ["SAFETY", /safety/i],
    ["PROHIBITED_CONTENT", /safety/i],
    ["RECITATION", /recitation/i],
  ];

  it.each(cases)("turns %s into a specific error", async (reason, pattern) => {
    __setAiTransportForTesting(async () => ({
      text: '{"partial":true}',
      finishReason: reason,
    }));

    await expect(callAiOnce("prompt")).rejects.toThrow(pattern);
  });

  it("does not retry a truncated response, because the wall is deterministic", async () => {
    let attempts = 0;
    __setAiTransportForTesting(async () => {
      attempts += 1;
      return { text: '{"partial":true}', finishReason: "MAX_TOKENS" };
    });

    await expect(callAi("prompt")).rejects.toBeInstanceOf(AiClientError);
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("accepts a normal STOP response", async () => {
    __setAiTransportForTesting(async () => ({
      text: '{"complete":true}',
      finishReason: "STOP",
    }));

    await expect(callAiOnce("prompt")).resolves.toBe('{"complete":true}');
  });
});

describe("model cache keying", () => {
  it("reuses one model for identical call options", () => {
    expect(__primeAiModelForTesting({ temperature: 0.2, jsonMode: true }).cacheHit).toBe(
      false
    );
    expect(__primeAiModelForTesting({ temperature: 0.2, jsonMode: true }).cacheHit).toBe(
      true
    );
    expect(__aiModelCacheSizeForTesting()).toBe(1);
  });

  it("keeps a separate model per distinct temperature", () => {
    __primeAiModelForTesting({ temperature: 0.2 });
    __primeAiModelForTesting({ temperature: 0.8 });

    expect(__aiModelCacheSizeForTesting()).toBe(2);
  });

  it("keys on JSON mode and token cap as well as temperature", () => {
    __primeAiModelForTesting({ temperature: 0.2 });
    __primeAiModelForTesting({ temperature: 0.2, jsonMode: true });
    __primeAiModelForTesting({ temperature: 0.2, jsonMode: true, maxOutputTokens: 512 });

    expect(__aiModelCacheSizeForTesting()).toBe(3);
  });

  it("keys on the model name so switching GEMINI_MODEL is not masked", () => {
    process.env.GEMINI_MODEL = "model-a";
    __primeAiModelForTesting({ temperature: 0.2 });
    process.env.GEMINI_MODEL = "model-b";
    __primeAiModelForTesting({ temperature: 0.2 });

    expect(__aiModelCacheSizeForTesting()).toBe(2);
  });

  it("fails clearly when no provider key is configured", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_KEY;

    expect(() => __primeAiModelForTesting()).toThrow(/Missing GEMINI_API_KEY/);
  });
});
