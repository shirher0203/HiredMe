import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { HttpError } from "../utils/http-error";

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * Builds an Express middleware that validates the request against a Zod
 * schema describing `{ body, params, query }`. On success the parsed
 * (and coerced) values are written back onto the request so controllers
 * read clean, typed input. On failure it forwards a
 * `HttpError(400, "VALIDATION_ERROR")` to the error middleware.
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return next(
        new HttpError(
          400,
          "VALIDATION_ERROR",
          formatZodError(result.error),
          result.error.issues
        )
      );
    }

    const data = result.data as {
      body?: unknown;
      params?: unknown;
      query?: unknown;
    };

    if (data.body !== undefined) {
      req.body = data.body;
    }
    if (data.params !== undefined) {
      Object.assign(req.params, data.params as Record<string, unknown>);
    }
    if (data.query !== undefined) {
      // In Express 5 `req.query` can be a read-only getter; mutate in place
      // and tolerate environments where that is not allowed.
      try {
        Object.assign(req.query as Record<string, unknown>, data.query as Record<string, unknown>);
      } catch {
        /* query left as-is when not writable */
      }
    }

    return next();
  };
}
