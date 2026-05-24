import type { Request, Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { UserProfileModel } from "../models/user-profile.model";
import { comparePassword, hashPassword, signAuthToken } from "../utils/auth";
import { HttpError } from "../utils/http-error";
import { buildEmptyProfileWithPersonalInfo } from "../utils/personal-info";

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

function optionalString(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readRegistrationPersonalInfo(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const personalInfo =
    input.personalInfo && typeof input.personalInfo === "object"
      ? (input.personalInfo as Record<string, unknown>)
      : {};

  return {
    fullName: optionalString(input.fullName) ?? optionalString(personalInfo.fullName),
    phone: optionalString(input.phone) ?? optionalString(personalInfo.phone),
    location: optionalString(input.location) ?? optionalString(personalInfo.location),
    linkedinUrl: optionalString(input.linkedinUrl) ?? optionalString(personalInfo.linkedinUrl),
    portfolioOrGithubUrl:
      optionalString(input.portfolioOrGithubUrl) ?? optionalString(personalInfo.portfolioOrGithubUrl),
  };
}

function authUser(user: {
  _id: unknown;
  email: string;
  personalInfo?: {
    fullName?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    portfolioOrGithubUrl?: string | null;
  } | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    personalInfo: user.personalInfo ?? {},
  };
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = requirePassword(req.body?.password);
    const personalInfo = readRegistrationPersonalInfo(req.body);

    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new HttpError(400, "VALIDATION_ERROR", "Email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({
      email,
      passwordHash,
      personalInfo,
      profile: {
        skills: [],
        experienceYears: 0,
        projects: [],
      },
    });

    await UserProfileModel.create({
      userId: user._id,
      profile: buildEmptyProfileWithPersonalInfo(user),
    });

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(201).json({
      token,
      user: authUser(user),
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

    await UserProfileModel.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: { profile: buildEmptyProfileWithPersonalInfo(user) } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(200).json({
      token,
      user: authUser(user),
    });
  } catch (err) {
    next(err);
  }
}