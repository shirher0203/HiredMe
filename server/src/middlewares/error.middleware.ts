import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  });
}

