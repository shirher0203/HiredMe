import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/user.model";
import { requireUser } from "./controller-utils";
import { HttpError } from "../utils/http-error";
import { analyzeJob, calculateMatch } from "../services/ai/ai.service";

export async function analyzeMatchPreview(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const jobDescription = req.body?.jobDescription;
    if (typeof jobDescription !== "string" || jobDescription.trim() === "") {
      throw new HttpError(400, "VALIDATION_ERROR", "jobDescription is required");
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    const profileOverride = req.body?.profileOverride;
    const profile = profileOverride && typeof profileOverride === "object"
      ? {
          skills: Array.isArray(profileOverride.skills)
            ? profileOverride.skills.filter((s: unknown): s is string => typeof s === "string")
            : user.profile.skills,
          experienceYears:
            typeof profileOverride.experienceYears === "number"
              ? profileOverride.experienceYears
              : user.profile.experienceYears,
          projects: Array.isArray(profileOverride.projects)
            ? profileOverride.projects.filter((p: unknown): p is string => typeof p === "string")
            : user.profile.projects,
          education:
            typeof profileOverride.education === "string"
              ? profileOverride.education
              : user.profile.education,
          goals:
            typeof profileOverride.goals === "string"
              ? profileOverride.goals
              : user.profile.goals,
        }
      : {
          skills: user.profile.skills,
          experienceYears: user.profile.experienceYears,
          projects: user.profile.projects,
          education: user.profile.education,
          goals: user.profile.goals,
        };

    const job = await analyzeJob(jobDescription.trim());
    const match = await calculateMatch(profile, job);

    return res.status(200).json({ job, match });
  } catch (err) {
    return next(err);
  }
}

