// Centralized logging helper for the AI service layer.
//
// All AI-related debug output funnels through this module so the rest of the
// service stays free of console.* sprinkles. Logging is gated by two env
// flags:
//
//   DEBUG_AI=true            — emit safe metadata (function names, timings,
//                              char counts, mock flag, key-configured flag).
//   DEBUG_AI_PAYLOADS=true   — additionally emit truncated previews of the
//                              prompt and the raw provider output.
//
// Sensitive values (GEMINI_API_KEY, full resume text, full profile object,
// full prompts, full provider output) must never reach this module; the API
// is shaped so callers can only pass safe metadata or strings that go
// through truncateForLog().
//
// The current sink is console. To swap for a different sink later (e.g.
// MongoDB), replace `consoleSink` — service call sites do not change.
//
// no DB. no Mongoose. no external logging dependency.

import "dotenv/config";
import { AsyncLocalStorage } from "async_hooks";

type LogLevel = "info" | "debug" | "error";

interface LogEvent {
  level: LogLevel;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

type Sink = (event: LogEvent) => void;

const consoleSink: Sink = (event) => {
  const line = `[ai] ${event.timestamp} ${event.event} ${JSON.stringify(event.data)}`;
  if (event.level === "error") {
    console.error(line);
    return;
  }
  if (event.level === "debug") {
    console.debug(line);
    return;
  }
  console.log(line);
};

let activeSink: Sink = consoleSink;

export function __setAiLoggerSinkForTesting(sink: Sink): void {
  activeSink = sink;
}

export function __resetAiLoggerSinkForTesting(): void {
  activeSink = consoleSink;
}

function isDebugAi(): boolean {
  return process.env.DEBUG_AI === "true";
}

function isDebugAiPayloads(): boolean {
  return process.env.DEBUG_AI_PAYLOADS === "true";
}

function emit(level: LogLevel, event: string, data: Record<string, unknown>): void {
  if (!isDebugAi()) return;
  activeSink({
    level,
    event,
    timestamp: new Date().toISOString(),
    data,
  });
}

export const MAX_PREVIEW_CHARS = 1000;

export function truncateForLog(text: string, max: number = MAX_PREVIEW_CHARS): string {
  if (typeof text !== "string") return "";
  if (max <= 0) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated, total ${text.length} chars]`;
}

export interface AiStartMeta {
  functionName: string;
  model?: string;
  mock: boolean;
  keyConfigured: boolean;
}

export function logAiStart(meta: AiStartMeta): void {
  emit("info", "ai.start", {
    functionName: meta.functionName,
    model: meta.model,
    mock: meta.mock,
    keyConfigured: meta.keyConfigured,
  });
}

export interface AiSuccessMeta {
  functionName: string;
  durationMs: number;
  promptChars?: number;
  outputChars?: number;
  mock: boolean;
}

export function logAiSuccess(meta: AiSuccessMeta): void {
  const data: Record<string, unknown> = {
    functionName: meta.functionName,
    durationMs: meta.durationMs,
    mock: meta.mock,
  };
  if (typeof meta.promptChars === "number") data.promptChars = meta.promptChars;
  if (typeof meta.outputChars === "number") data.outputChars = meta.outputChars;
  emit("info", "ai.success", data);
}

export interface AiFailureMeta {
  functionName: string;
  durationMs: number;
  error: unknown;
  mock: boolean;
}

export function logAiFailure(meta: AiFailureMeta): void {
  const message =
    meta.error instanceof Error ? meta.error.message : String(meta.error);
  emit("error", "ai.failure", {
    functionName: meta.functionName,
    durationMs: meta.durationMs,
    error: message,
    mock: meta.mock,
  });
}

export function logAiPromptPreview(functionName: string, prompt: string): void {
  if (!isDebugAi() || !isDebugAiPayloads()) return;
  emit("debug", "ai.prompt.preview", {
    functionName,
    promptPreview: truncateForLog(prompt),
  });
}

export function logAiOutputPreview(functionName: string, output: string): void {
  if (!isDebugAi() || !isDebugAiPayloads()) return;
  emit("debug", "ai.output.preview", {
    functionName,
    outputPreview: truncateForLog(output),
  });
}

export interface AiClientCallMeta {
  model: string;
  durationMs: number;
  outputChars: number;
  promptChars?: number;
  cacheHit?: boolean;
}

export function logAiClientCall(meta: AiClientCallMeta): void {
  recordAiCall(meta.durationMs);
  const data: Record<string, unknown> = {
    model: meta.model,
    durationMs: meta.durationMs,
    outputChars: meta.outputChars,
  };
  if (typeof meta.promptChars === "number") data.promptChars = meta.promptChars;
  if (typeof meta.cacheHit === "boolean") data.cacheHit = meta.cacheHit;
  emit("debug", "ai.client.call", data);
}

export interface AiClientRetryMeta {
  model: string;
  attempt: number;
  maxRetries: number;
  backoffMs: number;
  error: unknown;
}

export function logAiClientRetry(meta: AiClientRetryMeta): void {
  recordAiRetry();
  const message =
    meta.error instanceof Error ? meta.error.message : String(meta.error);
  emit("info", "ai.client.retry", {
    model: meta.model,
    attempt: meta.attempt,
    maxRetries: meta.maxRetries,
    backoffMs: meta.backoffMs,
    error: message,
  });
}

export interface AiClientErrorMeta {
  model: string;
  durationMs: number;
  error: unknown;
}

export function logAiClientError(meta: AiClientErrorMeta): void {
  recordAiCall(meta.durationMs);
  const message =
    meta.error instanceof Error ? meta.error.message : String(meta.error);
  emit("error", "ai.client.error", {
    model: meta.model,
    durationMs: meta.durationMs,
    error: message,
  });
}

// ---------------------------------------------------------------------------
// Per-request AI aggregate
//
// Counts and timings only. No prompt text, no output text, no user content, no
// identifiers — the aggregate exists to answer "how much AI time did this
// request spend", which is a performance question, not a content question.
// ---------------------------------------------------------------------------

export interface AiRequestMetrics {
  aiCallCount: number;
  totalAiMs: number;
  retryCount: number;
}

const metricsStore = new AsyncLocalStorage<AiRequestMetrics>();

function currentMetrics(): AiRequestMetrics | undefined {
  return metricsStore.getStore();
}

function recordAiCall(durationMs: number): void {
  const metrics = currentMetrics();
  if (!metrics) return;
  metrics.aiCallCount += 1;
  metrics.totalAiMs += durationMs;
}

function recordAiRetry(): void {
  const metrics = currentMetrics();
  if (!metrics) return;
  metrics.retryCount += 1;
}

/**
 * Runs `fn` with a fresh AI metrics accumulator. Async-local, so concurrent
 * requests never contaminate each other's totals.
 */
export function runWithAiMetrics<T>(
  fn: (metrics: AiRequestMetrics) => T
): T {
  const metrics: AiRequestMetrics = {
    aiCallCount: 0,
    totalAiMs: 0,
    retryCount: 0,
  };
  return metricsStore.run(metrics, () => fn(metrics));
}

/** Read the current request's AI totals, if the caller is inside a request. */
export function getAiRequestMetrics(): AiRequestMetrics | undefined {
  const metrics = currentMetrics();
  return metrics ? { ...metrics } : undefined;
}

export function logAiRequestSummary(
  metrics: AiRequestMetrics,
  context: { method: string; route: string; statusCode: number }
): void {
  if (metrics.aiCallCount === 0) return;
  emit("info", "ai.request.summary", {
    method: context.method,
    route: context.route,
    statusCode: context.statusCode,
    aiCallCount: metrics.aiCallCount,
    totalAiMs: metrics.totalAiMs,
    retryCount: metrics.retryCount,
  });
}
