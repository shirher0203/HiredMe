/// <reference path="../types/express.d.ts" />

import type { Request } from "express";
import { Types } from "mongoose";
import { HttpError } from "../utils/http-error";

export function requireUser(req: Request): { userId: string; email: string } {
  if (!req.user?.userId || !req.user.email) {
    throw new HttpError(401, "UNAUTHORIZED", "Authentication required");
  }
  const userId = req.user.userId;
  const email = req.user.email;
  if (typeof userId !== "string" || typeof email !== "string") {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid auth payload");
  }
  return { userId, email };
}

export function asObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid id");
  }
  return new Types.ObjectId(id);
}

export function requireIdParam(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid id");
  }
  return value;
}
