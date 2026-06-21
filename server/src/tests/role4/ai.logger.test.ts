/**
 * Tests for ai.logger.ts and service-level logging behavior.
 *
 * Strategy:
 *   - Spy on console.log / console.error / console.debug.
 *   - Toggle DEBUG_AI / DEBUG_AI_PAYLOADS env flags per test and restore them.
 *   - For service-level integration, mock ./ai.client so no network I/O happens.
 *
 * Verifies:
 *   - DEBUG_AI=false logs nothing.
 *   - DEBUG_AI=true emits safe metadata only.
 *   - GEMINI_API_KEY value never appears in any log output.
 *   - DEBUG_AI_PAYLOADS=false suppresses prompt/output previews.
 *   - DEBUG_AI_PAYLOADS=true emits truncated previews.
 *   - Failure path emits an ai.failure log with the error message.
 *   - truncateForLog is bounds-correct.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
  getActiveModelName: jest.fn(() => "gemini-test-model"),
  isApiKeyConfigured: jest.fn(() => true),
}));

import {
  logAiStart,
  logAiSuccess,
  logAiFailure,
  truncateForLog,
  MAX_PREVIEW_CHARS,
} from "../../services/ai/ai.logger";
import { callAi } from "../../services/ai/ai.client";
import {
  analyzeJob,
  parseResume,
} from "../../services/ai/ai.service";

const mockedCallAi = callAi as unknown as jest.Mock;

interface EnvSnapshot {
  DEBUG_AI: string | undefined;
  DEBUG_AI_PAYLOADS: string | undefined;
  USE_MOCK_AI: string | undefined;
  GEMINI_API_KEY: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    DEBUG_AI: process.env.DEBUG_AI,
    DEBUG_AI_PAYLOADS: process.env.DEBUG_AI_PAYLOADS,
    USE_MOCK_AI: process.env.USE_MOCK_AI,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
}

function restoreEnv(snap: EnvSnapshot): void {
  if (snap.DEBUG_AI === undefined) delete process.env.DEBUG_AI;
  else process.env.DEBUG_AI = snap.DEBUG_AI;
  if (snap.DEBUG_AI_PAYLOADS === undefined) delete process.env.DEBUG_AI_PAYLOADS;
  else process.env.DEBUG_AI_PAYLOADS = snap.DEBUG_AI_PAYLOADS;
  if (snap.USE_MOCK_AI === undefined) delete process.env.USE_MOCK_AI;
  else process.env.USE_MOCK_AI = snap.USE_MOCK_AI;
  if (snap.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = snap.GEMINI_API_KEY;
}

interface ConsoleSpies {
  log: jest.SpyInstance;
  error: jest.SpyInstance;
  debug: jest.SpyInstance;
}

function spyConsole(): ConsoleSpies {
  return {
    log: jest.spyOn(console, "log").mockImplementation(() => {}),
    error: jest.spyOn(console, "error").mockImplementation(() => {}),
    debug: jest.spyOn(console, "debug").mockImplementation(() => {}),
  };
}

function restoreConsole(spies: ConsoleSpies): void {
  spies.log.mockRestore();
  spies.error.mockRestore();
  spies.debug.mockRestore();
}

function allOutput(spies: ConsoleSpies): string {
  const collect = (s: jest.SpyInstance): string =>
    s.mock.calls
      .map((call: unknown[]) => call.map((c) => String(c)).join(" "))
      .join("\n");
  return [collect(spies.log), collect(spies.error), collect(spies.debug)].join("\n");
}

describe("truncateForLog", () => {
  it("returns the input unchanged when shorter than max", () => {
    expect(truncateForLog("hello", 10)).toBe("hello");
  });

  it("truncates and tags long input", () => {
    const long = "a".repeat(50);
    const out = truncateForLog(long, 10);
    expect(out.startsWith("aaaaaaaaaa")).toBe(true);
    expect(out).toContain("truncated");
    expect(out).toContain("50");
    expect(out.length).toBeLessThan(long.length);
  });

  it("uses MAX_PREVIEW_CHARS by default", () => {
    const long = "x".repeat(MAX_PREVIEW_CHARS + 100);
    const out = truncateForLog(long);
    expect(out).toContain("truncated");
    expect(out.length).toBeLessThanOrEqual(
      MAX_PREVIEW_CHARS + " … [truncated, total  chars]".length + 10
    );
  });

  it("returns empty string when max is zero or negative", () => {
    expect(truncateForLog("anything", 0)).toBe("");
    expect(truncateForLog("anything", -5)).toBe("");
  });
});

describe("ai.logger — direct API gating", () => {
  let spies: ConsoleSpies;
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    spies = spyConsole();
  });

  afterEach(() => {
    restoreConsole(spies);
    restoreEnv(envSnap);
  });

  it("DEBUG_AI=false logs nothing for any helper", () => {
    process.env.DEBUG_AI = "false";
    process.env.DEBUG_AI_PAYLOADS = "false";

    logAiStart({
      functionName: "analyzeJob",
      model: "gemini-test",
      mock: false,
      keyConfigured: true,
    });
    logAiSuccess({
      functionName: "analyzeJob",
      durationMs: 12,
      mock: false,
    });
    logAiFailure({
      functionName: "analyzeJob",
      durationMs: 12,
      error: new Error("boom"),
      mock: false,
    });

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it("DEBUG_AI=true emits safe metadata via console.log/error", () => {
    process.env.DEBUG_AI = "true";
    process.env.DEBUG_AI_PAYLOADS = "false";

    logAiStart({
      functionName: "analyzeJob",
      model: "gemini-test",
      mock: false,
      keyConfigured: true,
    });
    logAiSuccess({
      functionName: "analyzeJob",
      durationMs: 12,
      promptChars: 100,
      outputChars: 200,
      mock: false,
    });

    const combined = allOutput(spies);
    expect(combined).toContain("ai.start");
    expect(combined).toContain("analyzeJob");
    expect(combined).toContain("ai.success");
    expect(combined).toContain("\"durationMs\":12");
    expect(combined).toContain("\"promptChars\":100");
    expect(combined).toContain("\"outputChars\":200");
  });

  it("does not include the API key value when DEBUG_AI=true", () => {
    process.env.DEBUG_AI = "true";
    process.env.GEMINI_API_KEY = "supersecret-AIzaXYZ-12345";

    logAiStart({
      functionName: "analyzeJob",
      model: "gemini-test",
      mock: false,
      keyConfigured: true,
    });
    logAiSuccess({
      functionName: "analyzeJob",
      durationMs: 1,
      mock: false,
    });
    logAiFailure({
      functionName: "analyzeJob",
      durationMs: 1,
      error: new Error("nope"),
      mock: false,
    });

    const combined = allOutput(spies);
    expect(combined).not.toContain("supersecret-AIzaXYZ-12345");
  });

  it("failure logs the error message via console.error", () => {
    process.env.DEBUG_AI = "true";

    logAiFailure({
      functionName: "evaluateAnswer",
      durationMs: 7,
      error: new Error("validation failed"),
      mock: false,
    });

    expect(spies.error).toHaveBeenCalled();
    const combined = allOutput(spies);
    expect(combined).toContain("ai.failure");
    expect(combined).toContain("validation failed");
    expect(combined).toContain("evaluateAnswer");
  });
});

describe("ai.logger — service integration", () => {
  let spies: ConsoleSpies;
  let envSnap: EnvSnapshot;

  beforeEach(() => {
    envSnap = snapshotEnv();
    spies = spyConsole();
    mockedCallAi.mockReset();
  });

  afterEach(() => {
    restoreConsole(spies);
    restoreEnv(envSnap);
  });

  it("DEBUG_AI=false: analyzeJob succeeds without any logs", async () => {
    process.env.DEBUG_AI = "false";
    process.env.DEBUG_AI_PAYLOADS = "false";
    delete process.env.USE_MOCK_AI;

    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        roleTitle: "Junior Dev",
        requiredSkills: ["react"],
        advantageSkills: ["docker"],
        seniorityLevel: "junior",
        summary: "ok",
      })
    );

    const result = await analyzeJob("Junior Frontend Developer using React.");

    expect(result.roleTitle).toBe("Junior Dev");
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();
  });

  it("DEBUG_AI=true, DEBUG_AI_PAYLOADS=false: emits start/success metadata but no prompt or output preview", async () => {
    process.env.DEBUG_AI = "true";
    process.env.DEBUG_AI_PAYLOADS = "false";
    delete process.env.USE_MOCK_AI;

    const longPrompt = "x".repeat(2000);
    const longOutput = JSON.stringify({
      roleTitle: "T",
      requiredSkills: [],
      advantageSkills: [],
      seniorityLevel: "junior",
      summary: longPrompt,
    });

    mockedCallAi.mockResolvedValueOnce(longOutput);

    await analyzeJob("Junior dev role");

    const combined = allOutput(spies);
    expect(combined).toContain("ai.start");
    expect(combined).toContain("ai.success");
    expect(combined).toContain("analyzeJob");
    expect(combined).not.toContain("ai.prompt.preview");
    expect(combined).not.toContain("ai.output.preview");
    expect(combined).not.toContain("promptPreview");
    expect(combined).not.toContain("outputPreview");
  });

  it("DEBUG_AI_PAYLOADS=true: emits truncated previews of prompt and raw output", async () => {
    process.env.DEBUG_AI = "true";
    process.env.DEBUG_AI_PAYLOADS = "true";
    delete process.env.USE_MOCK_AI;

    const aiOutput = JSON.stringify({
      roleTitle: "Eng",
      requiredSkills: ["react"],
      advantageSkills: [],
      seniorityLevel: "junior",
      summary: "y".repeat(1500),
    });

    mockedCallAi.mockResolvedValueOnce(aiOutput);

    await analyzeJob("Junior Frontend role");

    const combined = allOutput(spies);
    expect(combined).toContain("ai.prompt.preview");
    expect(combined).toContain("ai.output.preview");
    expect(combined).toContain("truncated");
  });

  it("does not log the GEMINI_API_KEY in any service log", async () => {
    process.env.DEBUG_AI = "true";
    process.env.DEBUG_AI_PAYLOADS = "true";
    process.env.GEMINI_API_KEY = "AIza-supersecret-key-9876543210";
    delete process.env.USE_MOCK_AI;

    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        roleTitle: "Eng",
        requiredSkills: ["react"],
        advantageSkills: [],
        seniorityLevel: "junior",
        summary: "ok",
      })
    );

    await analyzeJob("Junior Frontend role");

    const combined = allOutput(spies);
    expect(combined).not.toContain("AIza-supersecret-key-9876543210");
  });

  it("logs ai.failure when the underlying call throws", async () => {
    process.env.DEBUG_AI = "true";
    process.env.DEBUG_AI_PAYLOADS = "false";
    delete process.env.USE_MOCK_AI;

    mockedCallAi.mockRejectedValue(new Error("Missing GEMINI_API_KEY"));

    await expect(parseResume("some resume text")).rejects.toThrow();

    const combined = allOutput(spies);
    expect(combined).toContain("ai.failure");
    expect(combined).toContain("parseResume");
    expect(combined).toContain("Missing GEMINI_API_KEY");
  });
});
