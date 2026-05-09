import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/auth";
import { HttpError } from "../utils/http-error";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new HttpError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const decoded = verifyAuthToken(token);
    if (typeof decoded !== "object" || !decoded || !("userId" in decoded)) {
      return next(new HttpError(401, "UNAUTHORIZED", "Invalid token payload"));
    }
    req.user = decoded as Request["user"];
    return next();
  } catch {
    return next(new HttpError(401, "UNAUTHORIZED", "Invalid token"));
  }
}

