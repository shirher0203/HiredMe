import type { NextFunction, Request, Response } from "express";
import { logAiRequestSummary, runWithAiMetrics } from "../services/ai/ai.logger";

/**
 * Gives each request its own AI metrics accumulator and logs the totals once
 * the response finishes. Requests that made no AI calls log nothing.
 *
 * Only counts and durations are recorded — never prompt or response content.
 * Like every other AI log, output is gated behind DEBUG_AI.
 */
export function aiMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  runWithAiMetrics((metrics) => {
    res.on("finish", () => {
      logAiRequestSummary(metrics, {
        method: req.method,
        route: req.baseUrl + (req.route?.path ?? req.path),
        statusCode: res.statusCode,
      });
    });
    next();
  });
}
