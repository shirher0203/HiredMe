import type { NextFunction, Request, Response } from "express";
import type { ParsedResume } from "../services/ai/parsed-resume.types";
import { UserProfileModel } from "../models/user-profile.model";
import { UserModel } from "../models/user.model";
import { requireUser } from "./controller-utils";
import { HttpError } from "../utils/http-error";
import { buildEmptyProfileWithPersonalInfo, personalInfoFromAccount, withAccountPersonalInfo } from "../utils/personal-info";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", `${fieldName} must be an array`);
  }
  return value;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new HttpError(400, "VALIDATION_ERROR", `${fieldName} must be an object`);
  }
  return value;
}

function validateProfilePayload(raw: unknown): ParsedResume {
  const profile = requireObject(raw, "profile");
  requireObject(profile.personal_info, "personal_info");
  requireArray(profile.work_experience, "work_experience");
  requireArray(profile.education, "education");
  requireObject(profile.skills, "skills");
  requireArray(profile.projects, "projects");
  requireArray(profile.languages, "languages");
  requireArray(profile.certifications, "certifications");
  requireArray(profile.awards, "awards");
  requireObject(profile.parsed_metadata, "parsed_metadata");

  return profile as unknown as ParsedResume;
}

async function requireAccountUser(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }
  return user;
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const user = await requireAccountUser(userId);
    const saved = await UserProfileModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { profile: buildEmptyProfileWithPersonalInfo(user) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    const profile = withAccountPersonalInfo(saved.profile as ParsedResume, user);

    return res.status(200).json({
      status: "success",
      data: {
        profile,
        personalInfo: personalInfoFromAccount(user),
        rawCvFileUrl: saved.rawCvFileUrl ?? null,
        updatedAt: saved.updatedAt ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const user = await requireAccountUser(userId);
    const profile = withAccountPersonalInfo(validateProfilePayload(req.body?.profile), user);

    const saved = await UserProfileModel.findOneAndUpdate(
      { userId },
      { $set: { profile } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      status: "success",
      data: {
        profile: saved.profile,
        personalInfo: personalInfoFromAccount(user),
        rawCvFileUrl: saved.rawCvFileUrl ?? null,
        updatedAt: saved.updatedAt ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}