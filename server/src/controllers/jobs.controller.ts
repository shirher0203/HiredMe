import type { NextFunction, Request, Response } from "express";
import { JobModel } from "../models/job.model";
import { UserModel } from "../models/user.model";
import { HttpError } from "../utils/http-error";
import { requireUser, asObjectId, requireIdParam } from "./controller-utils";
import { analyzeJob, calculateMatch } from "../services/ai/ai.service";
import { hashPayload } from "../utils/hash";
import type { JobAnalysis } from "../services/matching/matching.types";

const VALID_STATUSES = ["to_apply", "applied", "hr", "technical", "offer"] as const;
type JobStatus = (typeof VALID_STATUSES)[number];

function requireDescription(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "description is required");
  }
  return raw.trim();
}

function deriveTitle(description: string): string {
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, 80) || "Untitled job";
}

function requireStatus(raw: unknown): JobStatus {
  if (typeof raw !== "string" || !VALID_STATUSES.includes(raw as JobStatus)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid status");
  }
  return raw as JobStatus;
}

function groupByStatus(jobs: Array<Record<string, unknown>>) {
  const grouped: Record<JobStatus, Array<Record<string, unknown>>> = {
    to_apply: [],
    applied: [],
    hr: [],
    technical: [],
    offer: [],
  };

  for (const job of jobs) {
    const status = (job.status as JobStatus) ?? "to_apply";
    grouped[status].push(job);
  }
  return grouped;
}

export async function getJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobs = await JobModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.status(200).json(groupByStatus(jobs as Array<Record<string, unknown>>));
  } catch (err) {
    return next(err);
  }
}

export async function createJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const description = requireDescription(req.body?.description);
    const title =
      typeof req.body?.title === "string" && req.body.title.trim() !== ""
        ? req.body.title.trim()
        : deriveTitle(description);

    const job = await JobModel.create({
      userId: asObjectId(userId),
      title,
      description,
      status: "to_apply",
    });

    return res.status(201).json({
      id: String(job._id),
      title: job.title,
      description: job.description,
      status: job.status,
    });
  } catch (err) {
    return next(err);
  }
}

export async function patchJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const status = requireStatus(req.body?.status);
    const jobId = requireIdParam(req.params.id);
    const job = await JobModel.findOneAndUpdate(
      { _id: asObjectId(jobId), userId },
      { $set: { status } },
      { new: true }
    ).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json(job);
  } catch (err) {
    return next(err);
  }
}

function buildMatchInputHash(profileSkills: string[], jobAnalysis: JobAnalysis): string {
  return hashPayload({
    profileSkills,
    requiredSkills: jobAnalysis.requiredSkills,
    advantageSkills: jobAnalysis.advantageSkills,
  });
}

export async function analyzeJobForUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const force = req.query.force === "true";
    const jobId = requireIdParam(req.params.id);
    const [job, user] = await Promise.all([
      JobModel.findOne({ _id: asObjectId(jobId), userId }),
      UserModel.findById(userId),
    ]);
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    const profile = {
      skills: user.profile.skills ?? [],
      experienceYears: user.profile.experienceYears ?? 0,
      projects: user.profile.projects ?? [],
      education: user.profile.education ?? undefined,
      goals: user.profile.goals ?? undefined,
    };

    const jobHash = hashPayload({ description: job.description });
    const cachedJobAnalysis = !force && job.jobAnalysis && job.jobAnalysisHash === jobHash;
    let analyzed = job.jobAnalysis as JobAnalysis | undefined;
    if (!cachedJobAnalysis) {
      analyzed = await analyzeJob(job.description);
      job.jobAnalysis = analyzed;
      job.jobAnalysisHash = jobHash;
      job.jobAnalyzedAt = new Date();
    }

    if (!analyzed) {
      throw new HttpError(500, "INTERNAL_ERROR", "Failed to analyze job");
    }

    const matchHash = buildMatchInputHash(profile.skills, analyzed);
    const canReuseMatch =
      !force && job.matchAnalysis && job.matchAnalysisHash === matchHash && cachedJobAnalysis;
    if (!canReuseMatch) {
      job.matchAnalysis = await calculateMatch(profile, analyzed);
      job.matchAnalysisHash = matchHash;
      job.matchAnalyzedAt = new Date();
    }

    await job.save();

    return res.status(200).json({
      jobAnalysis: job.jobAnalysis,
      matchAnalysis: job.matchAnalysis,
      cached: cachedJobAnalysis && canReuseMatch,
    });
  } catch (err) {
    return next(err);
  }
}
