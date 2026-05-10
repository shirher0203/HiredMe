import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { ErrorResponse } from "../types/api.types";
import { HttpError } from "../utils/http-error";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    const response: ErrorResponse = {
      status: "error",
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };

    return res.status(err.status).json(response);
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const code = err.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "UPLOAD_ERROR";
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "PDF file must be 5MB or smaller" : err.message;

    const response: ErrorResponse = {
      status: "error",
      error: {
        code,
        message,
      },
    };

    return res.status(status).json(response);
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const response: ErrorResponse = {
    status: "error",
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  };

  return res.status(500).json(response);
}
