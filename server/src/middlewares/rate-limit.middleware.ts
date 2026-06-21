import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import type { ErrorResponse } from "../types/api.types";

const isTestEnv = process.env.NODE_ENV === "test";

const RATE_LIMITED_RESPONSE: ErrorResponse = {
  status: "error",
  error: {
    code: "RATE_LIMITED",
    message: "Too many requests, please slow down and try again later.",
  },
};

/**
 * Rate limiter for AI-backed endpoints, to protect the AI credits from
 * abuse / runaway clients. Effectively disabled under tests so the suite
 * is not throttled.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTestEnv ? 1_000_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json(RATE_LIMITED_RESPONSE);
  },
});
