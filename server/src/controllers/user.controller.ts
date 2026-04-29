import type { Request, Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { requireUser } from "./controller-utils";
import { HttpError } from "../utils/http-error";
import { hashPayload } from "../utils/hash";
import { analyzeProfile } from "../services/ai/ai.service";
import type { ProfileInput } from "../services/matching/matching.types";

function toProfileInput(profile: Record<string, unknown>): ProfileInput {
  const skills = Array.isArray(profile.skills)
    ? profile.skills.filter((s): s is string => typeof s === "string")
    : [];
  const projects = Array.isArray(profile.projects)
    ? profile.projects.filter((p): p is string => typeof p === "string")
    : [];
  const experienceYears =
    typeof profile.experienceYears === "number" && Number.isFinite(profile.experienceYears)
      ? profile.experienceYears
      : 0;
  const education = typeof profile.education === "string" ? profile.education : undefined;
  const goals = typeof profile.goals === "string" ? profile.goals : undefined;
  return { skills, experienceYears, projects, education, goals };
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }
    res.status(200).json({
      id: String(user._id),
      email: user.email,
      profile: user.profile,
      profileAnalysis: user.profileAnalysis ?? null,
      profileAnalyzedAt: user.profileAnalyzedAt ?? null,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const input = req.body?.profile;
    if (!input || typeof input !== "object") {
      throw new HttpError(400, "VALIDATION_ERROR", "profile object is required");
    }

    const nextProfile = toProfileInput(input as Record<string, unknown>);
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { profile: nextProfile } },
      { new: true }
    ).lean();
    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    res.status(200).json({
      id: String(updated._id),
      email: updated.email,
      profile: updated.profile,
    });
  } catch (err) {
    next(err);
  }
}

export async function analyzeMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const force = req.query.force === "true";
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    const profile = toProfileInput(user.profile as unknown as Record<string, unknown>);
    const hash = hashPayload(profile);
    if (!force && user.profileAnalysis && user.profileAnalysisHash === hash) {
      return res.status(200).json({
        profileAnalysis: user.profileAnalysis,
        cached: true,
        analyzedAt: user.profileAnalyzedAt ?? null,
      });
    }

    const profileAnalysis = await analyzeProfile(profile);
    user.profileAnalysis = profileAnalysis;
    user.profileAnalysisHash = hash;
    user.profileAnalyzedAt = new Date();
    await user.save();

    return res.status(200).json({
      profileAnalysis: user.profileAnalysis,
      cached: false,
      analyzedAt: user.profileAnalyzedAt,
    });
  } catch (err) {
    next(err);
  }
}

