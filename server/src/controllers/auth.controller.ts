import type { Request, Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { comparePassword, hashPassword, signAuthToken } from "../utils/auth";
import { HttpError } from "../utils/http-error";

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "Email is required");
  }
  return raw.trim().toLowerCase();
}

function requirePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 6) {
    throw new HttpError(400, "VALIDATION_ERROR", "Password must be at least 6 characters");
  }
  return raw;
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = requirePassword(req.body?.password);

    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new HttpError(400, "VALIDATION_ERROR", "Email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({
      email,
      passwordHash,
      profile: {
        skills: [],
        experienceYears: 0,
        projects: [],
      },
    });

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(201).json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = requirePassword(req.body?.password);

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(200).json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

