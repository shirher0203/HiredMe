// The one and only place where the Gemini SDK is imported.
//
// Contract: callAi takes a prompt and returns raw provider text. It does NOT
// parse JSON, validate shape, clamp numbers, or apply business logic —
// downstream layers (safe-json.ts, ai.service.ts) own that. Keeping this
// wrapper thin is what makes the system provider-agnostic: swapping to a
// different SDK later only changes this file.
//
// It does own the reliability envelope, because that is transport concern:
// a per-attempt timeout, a bounded retry for transient provider failures, and
// turning a truncated or blocked response into a specific error instead of a
// confusing parse failure further down.

import "dotenv/config";
import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type GenerationConfig,
} from "@google/generative-ai";

import { logAiClientCall, logAiClientError, logAiClientRetry } from "./ai.logger";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const SYSTEM_INSTRUCTION =
  "You are a precise JSON API. Respond with valid JSON only.";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;

/**
 * Backoff before retry attempt n. Worst case with the default two retries is
 * three attempts plus 2s of waiting, which keeps the whole call inside a
 * predictable ceiling: TIMEOUT_MS * 3 + 2000.
 */
export const RETRY_BACKOFF_MS = [500, 1500] as const;

/** Provider states worth trying again: overload, throttling and transport. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Provider states that will fail identically on a second attempt. */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

const RETRYABLE_MESSAGE_PATTERN =
  /(timeout|timed out|etimedout|econnreset|econnrefused|enotfound|eai_again|socket hang up|network|fetch failed)/i;

export const DEFAULT_TEMPERATURE = 0.2;

export interface AiCallOptions {
  /** Sampling temperature. Extraction wants low, question generation wants high. */
  temperature?: number;
  /** Cap on response length. Sized per operation by the caller. */
  maxOutputTokens?: number;
  /** Ask the provider for `application/json` instead of free text. */
  jsonMode?: boolean;
}

export class AiClientError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly finishReason?: string;

  constructor(
    message: string,
    options: { status?: number; retryable: boolean; finishReason?: string }
  ) {
    super(message);
    this.name = "AiClientError";
    this.status = options.status;
    this.retryable = options.retryable;
    this.finishReason = options.finishReason;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function readPositiveIntEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function getAiTimeoutMs(): number {
  const value = readPositiveIntEnv("AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 600_000);
  return value === 0 ? DEFAULT_TIMEOUT_MS : value;
}

export function getAiMaxRetries(): number {
  return readPositiveIntEnv("AI_MAX_RETRIES", DEFAULT_MAX_RETRIES, 5);
}

export function getActiveModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function isApiKeyConfigured(): boolean {
  const k = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_KEY;
  return typeof k === "string" && k.trim() !== "";
}

function resolveGenerationConfig(options: AiCallOptions): GenerationConfig {
  const config: GenerationConfig = {
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
  };
  if (typeof options.maxOutputTokens === "number") {
    config.maxOutputTokens = options.maxOutputTokens;
  }
  if (options.jsonMode) {
    config.responseMimeType = "application/json";
  }
  return config;
}

// ---------------------------------------------------------------------------
// Model cache — one model per (key, model name, generation config)
// ---------------------------------------------------------------------------

const modelCache = new Map<string, GenerativeModel>();

/** Visible to the metrics layer so a cache miss is distinguishable in logs. */
let lastModelWasCached = false;

function getModel(config: GenerationConfig): GenerativeModel {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_KEY;
  if (!apiKey) {
    throw new AiClientError(
      "Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_KEY",
      { retryable: false }
    );
  }

  const modelName = getActiveModelName();
  const key = `${apiKey}::${modelName}::${JSON.stringify(config)}`;

  const cached = modelCache.get(key);
  if (cached) {
    lastModelWasCached = true;
    return cached;
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: config,
  });
  modelCache.set(key, model);
  lastModelWasCached = false;
  return model;
}

export function __clearAiModelCacheForTesting(): void {
  modelCache.clear();
  lastModelWasCached = false;
}

/** Number of distinct (key, model, config) combinations currently cached. */
export function __aiModelCacheSizeForTesting(): number {
  return modelCache.size;
}

/**
 * Resolves and caches the model for a set of call options without issuing a
 * request, so cache-key behaviour is testable without the network.
 */
export function __primeAiModelForTesting(options: AiCallOptions = {}): {
  cacheHit: boolean;
} {
  getModel(resolveGenerationConfig(options));
  return { cacheHit: lastModelWasCached };
}

// ---------------------------------------------------------------------------
// Transport seam — swapped in tests so retry/timeout logic needs no network
// ---------------------------------------------------------------------------

export interface AiTransportRequest {
  prompt: string;
  timeoutMs: number;
  config: GenerationConfig;
}

export interface AiTransportResponse {
  text: string;
  finishReason?: string;
}

export type AiTransport = (
  request: AiTransportRequest
) => Promise<AiTransportResponse>;

const geminiTransport: AiTransport = async ({ prompt, timeoutMs, config }) => {
  const model = getModel(config);
  const result = await model.generateContent(prompt, { timeout: timeoutMs });
  const candidate = result.response.candidates?.[0];
  return {
    text: result.response.text(),
    finishReason: candidate?.finishReason as string | undefined,
  };
};

let activeTransport: AiTransport = geminiTransport;

export function __setAiTransportForTesting(transport: AiTransport): void {
  activeTransport = transport;
}

export function __resetAiTransportForTesting(): void {
  activeTransport = geminiTransport;
}

type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Never let a pending backoff hold the process open.
    if (typeof timer.unref === "function") timer.unref();
  });

let activeSleep: Sleep = realSleep;

export function __setAiSleepForTesting(sleep: Sleep): void {
  activeSleep = sleep;
}

export function __resetAiSleepForTesting(): void {
  activeSleep = realSleep;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && Number.isFinite(status)) return status;

  // The SDK folds the HTTP status into the message, e.g.
  // "[GoogleGenerativeAI Error]: ... [503 Service Unavailable] ...".
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") {
    const match = message.match(/\[(\d{3})\s/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

export function isRetryableAiError(err: unknown): boolean {
  if (err instanceof AiClientError) return err.retryable;

  const status = extractStatus(err);
  if (status !== undefined) {
    if (NON_RETRYABLE_STATUSES.has(status)) return false;
    return RETRYABLE_STATUSES.has(status);
  }

  const message = err instanceof Error ? err.message : String(err);
  return RETRYABLE_MESSAGE_PATTERN.test(message);
}

/**
 * A truncated or blocked response is a dead end: the same prompt produces the
 * same outcome, so it is raised as a specific non-retryable error rather than
 * left to fail as an unexplained parse error two layers up.
 */
function assertUsableFinishReason(finishReason: string | undefined): void {
  if (finishReason === undefined) return;

  switch (finishReason) {
    case "MAX_TOKENS":
      throw new AiClientError(
        "AI response was truncated before it completed (finishReason MAX_TOKENS). Raise maxOutputTokens or shorten the prompt.",
        { retryable: false, finishReason }
      );
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
      throw new AiClientError(
        `AI response was blocked by a safety filter (finishReason ${finishReason}).`,
        { retryable: false, finishReason }
      );
    case "RECITATION":
      throw new AiClientError(
        "AI response was blocked as recitation of protected content (finishReason RECITATION).",
        { retryable: false, finishReason }
      );
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One provider attempt: timed out on its own, never retried.
 * Exported so the retry policy can be tested independently of it.
 */
export async function callAiOnce(
  prompt: string,
  options: AiCallOptions = {}
): Promise<string> {
  if (process.env.USE_MOCK_AI === "true") {
    throw new AiClientError("AI client should not be called in mock mode", {
      retryable: false,
    });
  }

  const timeoutMs = getAiTimeoutMs();
  const config = resolveGenerationConfig(options);
  const modelName = getActiveModelName();
  const start = Date.now();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new AiClientError(
          `AI request timed out after ${timeoutMs}ms`,
          { retryable: true }
        )
      );
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
  });

  try {
    const { text, finishReason } = await Promise.race([
      activeTransport({ prompt, timeoutMs, config }),
      timeout,
    ]);

    assertUsableFinishReason(finishReason);

    if (!text || text.trim() === "") {
      throw new AiClientError("Empty response from AI Provider", {
        retryable: true,
        finishReason,
      });
    }

    logAiClientCall({
      model: modelName,
      durationMs: Date.now() - start,
      outputChars: text.length,
      promptChars: prompt.length,
      cacheHit: lastModelWasCached,
    });

    return text;
  } catch (err) {
    logAiClientError({
      model: modelName,
      durationMs: Date.now() - start,
      error: err,
    });
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Provider call with a bounded retry for transient failures.
 *
 * Retries only overload/throttle/transport classes, at most `AI_MAX_RETRIES`
 * times, with a fixed backoff. Config, auth and validation failures fail on the
 * first attempt — retrying those only delays the error the caller needs to see.
 */
export async function callAiWithRetry(
  prompt: string,
  options: AiCallOptions = {}
): Promise<string> {
  const maxRetries = getAiMaxRetries();
  let attempt = 0;

  for (;;) {
    try {
      return await callAiOnce(prompt, options);
    } catch (err) {
      const canRetry = attempt < maxRetries && isRetryableAiError(err);
      if (!canRetry) throw err;

      const backoff =
        RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
      logAiClientRetry({
        model: getActiveModelName(),
        attempt: attempt + 1,
        maxRetries,
        backoffMs: backoff,
        error: err,
      });
      await activeSleep(backoff);
      attempt += 1;
    }
  }
}

/**
 * Default entry point for the service layer: a single logical AI request,
 * retried within its budget.
 */
export async function callAi(
  prompt: string,
  options: AiCallOptions = {}
): Promise<string> {
  return callAiWithRetry(prompt, options);
}
