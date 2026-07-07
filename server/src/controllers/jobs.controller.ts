import type { NextFunction, Request, Response } from "express";
import {
  JOB_SOURCES,
  JOB_STATUSES,
  JobModel,
  SCHEDULABLE_JOB_STATUSES,
  isSchedulableJobStatus,
  type JobSource,
  type JobStatus,
  type SchedulableJobStatus,
} from "../models/job.model";
import { UserModel } from "../models/user.model";
import { HttpError } from "../utils/http-error";
import { requireUser, asObjectId, requireIdParam } from "./controller-utils";
import { analyzeJob, calculateMatch } from "../services/ai/ai.service";
import { hashPayload } from "../utils/hash";
import type { JobAnalysis } from "../services/matching/matching.types";

export const VALID_STATUSES = JOB_STATUSES;

interface ListJobsQuery {
  view?: "board" | "list";
  q?: string;
  status?: JobStatus;
  minScore?: number;
  limit?: number;
  cursor?: string;
}

interface DecodedCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({ c: createdAt.toISOString(), i: id });
  return Buffer.from(payload, "utf8").toString("base64");
}

function decodeCursor(raw: string): DecodedCursor {
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") {
      throw new Error("missing fields");
    }
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("invalid date");
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid cursor");
  }
}

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

function optionalTrimmedString(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", `${field} must be a string`);
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalSource(raw: unknown): JobSource | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string" || !JOB_SOURCES.includes(raw as JobSource)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid source");
  }
  return raw as JobSource;
}

function optionalStatus(raw: unknown): JobStatus | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return requireStatus(raw);
}

const SCHEDULE_DURATION_MS = 60 * 60 * 1000;

function serializeScheduledInterview(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as { startAt?: unknown; endAt?: unknown };
  if (!value.startAt || !value.endAt) {
    return null;
  }
  const startAt =
    value.startAt instanceof Date ? value.startAt.toISOString() : String(value.startAt);
  const endAt = value.endAt instanceof Date ? value.endAt.toISOString() : String(value.endAt);
  return { startAt, endAt };
}

function serializeStageSchedules(job: Record<string, unknown>) {
  const rawStageSchedules =
    job.stageSchedules && typeof job.stageSchedules === "object"
      ? (job.stageSchedules as Record<string, unknown>)
      : {};
  const legacySchedule = serializeScheduledInterview(job.scheduledInterview);
  const status = job.status as JobStatus;

  const result = Object.fromEntries(
    SCHEDULABLE_JOB_STATUSES.map((stage) => [stage, null])
  ) as Record<SchedulableJobStatus, { startAt: string; endAt: string } | null>;

  for (const stage of SCHEDULABLE_JOB_STATUSES) {
    const schedule = serializeScheduledInterview(rawStageSchedules[stage]);
    if (schedule) {
      result[stage] = schedule;
    }
  }

  if (
    legacySchedule &&
    isSchedulableJobStatus(status) &&
    !result[status]
  ) {
    result[status] = legacySchedule;
  }

  return result;
}

function serializeJob(job: Record<string, unknown>) {
  return {
    id: String(job._id),
    title: job.title,
    company: job.company ?? null,
    description: job.description,
    status: job.status,
    notes: job.notes ?? null,
    contact: job.contact ?? null,
    jobUrl: job.jobUrl ?? null,
    source: job.source ?? "manual",
    matchAnalysis: job.matchAnalysis ?? null,
    stageSchedules: serializeStageSchedules(job),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function requireFutureStartAt(raw: unknown): Date {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "startAt is required");
  }
  const startAt = new Date(raw);
  if (Number.isNaN(startAt.getTime())) {
    throw new HttpError(400, "VALIDATION_ERROR", "startAt must be a valid ISO8601 datetime");
  }
  if (startAt.getTime() <= Date.now()) {
    throw new HttpError(400, "VALIDATION_ERROR", "startAt must be in the future");
  }
  return startAt;
}

function requireStatus(raw: unknown): JobStatus {
  if (typeof raw !== "string" || !VALID_STATUSES.includes(raw as JobStatus)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid status");
  }
  return raw as JobStatus;
}

function normalizeStatus(raw: unknown): JobStatus {
  if (raw === "to_apply") {
    return "applied";
  }
  if (typeof raw === "string" && VALID_STATUSES.includes(raw as JobStatus)) {
    return raw as JobStatus;
  }
  return "applied";
}

function groupByStatus(jobs: Array<Record<string, unknown>>) {
  const grouped = Object.fromEntries(
    VALID_STATUSES.map((status) => [status, [] as Array<Record<string, unknown>>])
  ) as Record<JobStatus, Array<Record<string, unknown>>>;

  for (const job of jobs) {
    const serialized = serializeJob(job);
    const status = normalizeStatus(serialized.status);
    grouped[status].push(serialized);
  }
  return grouped;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function buildJobFilter(userId: string, query: ListJobsQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId };
  if (query.status) {
    filter.status = query.status;
  }
  if (typeof query.minScore === "number") {
    filter["matchAnalysis.finalScore"] = { $gte: query.minScore };
  }
  if (query.q) {
    filter.$text = { $search: query.q };
  }
  return filter;
}

export async function getJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const query = (req.validated?.query ?? {}) as ListJobsQuery;
    const view = query.view ?? "board";

    const filter = buildJobFilter(userId, query);

    if (view === "board") {
      const jobs = await JobModel.find(filter).sort({ createdAt: -1 }).lean();
      return res
        .status(200)
        .json(groupByStatus(jobs as Array<Record<string, unknown>>));
    }

    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      filter.$or = [
        { createdAt: { $lt: createdAt } },
        { createdAt, _id: { $lt: asObjectId(id) } },
      ];
    }

    const docs = await JobModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const last = items[items.length - 1] as
      | { createdAt?: Date; _id?: unknown }
      | undefined;
    const nextCursor =
      hasMore && last?.createdAt
        ? encodeCursor(last.createdAt, String(last._id))
        : null;

    return res.status(200).json({ items, nextCursor });
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
    const status = optionalStatus(req.body?.status) ?? "applied";

    const job = await JobModel.create({
      userId: asObjectId(userId),
      title,
      company: optionalTrimmedString(req.body?.company, "company"),
      description,
      status,
      notes: optionalTrimmedString(req.body?.notes, "notes"),
      contact: optionalTrimmedString(req.body?.contact, "contact"),
      jobUrl: optionalTrimmedString(req.body?.jobUrl, "jobUrl"),
      source: optionalSource(req.body?.source) ?? "manual",
    });

    return res.status(201).json(serializeJob(job.toObject() as Record<string, unknown>));
  } catch (err) {
    return next(err);
  }
}

export async function patchJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobId = requireIdParam(req.params.id);
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if ("title" in body) {
      const title = optionalTrimmedString(body.title, "title");
      if (!title) {
        throw new HttpError(400, "VALIDATION_ERROR", "title cannot be empty");
      }
      updates.title = title;
    }
    if ("description" in body) {
      updates.description = requireDescription(body.description);
    }
    if ("company" in body) {
      updates.company = optionalTrimmedString(body.company, "company") ?? null;
    }
    if ("notes" in body) {
      updates.notes = optionalTrimmedString(body.notes, "notes") ?? null;
    }
    if ("contact" in body) {
      updates.contact = optionalTrimmedString(body.contact, "contact") ?? null;
    }
    if ("jobUrl" in body) {
      updates.jobUrl = optionalTrimmedString(body.jobUrl, "jobUrl") ?? null;
    }

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "At least one field is required");
    }

    const job = await JobModel.findOneAndUpdate(
      { _id: asObjectId(jobId), userId: asObjectId(userId) },
      { $set: updates },
      { returnDocument: "after" }
    ).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json(serializeJob(job as Record<string, unknown>));
  } catch (err) {
    return next(err);
  }
}

export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobId = requireIdParam(req.params.id);
    const job = await JobModel.findOneAndDelete({
      _id: asObjectId(jobId),
      userId,
    }).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json({ id: String(job._id) });
  } catch (err) {
    return next(err);
  }
}

export async function scheduleJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobId = requireIdParam(req.params.id);
    const startAt = requireFutureStartAt(req.body?.startAt);
    const endAt = new Date(startAt.getTime() + SCHEDULE_DURATION_MS);

    const existing = await JobModel.findOne({
      _id: asObjectId(jobId),
      userId: asObjectId(userId),
    }).lean();
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    if (!isSchedulableJobStatus(existing.status)) {
      throw new HttpError(
        409,
        "CONFLICT",
        "Interviews cannot be scheduled for jobs in Application, Offer, or Not Relevant stages"
      );
    }

    const job = await JobModel.findOneAndUpdate(
      { _id: asObjectId(jobId), userId: asObjectId(userId) },
      {
        $set: {
          [`stageSchedules.${existing.status}`]: { startAt, endAt },
        },
        $unset: { scheduledInterview: 1 },
      },
      { returnDocument: "after" }
    ).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json(serializeJob(job as Record<string, unknown>));
  } catch (err) {
    return next(err);
  }
}

export async function unscheduleJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobId = requireIdParam(req.params.id);
    const existing = await JobModel.findOne({
      _id: asObjectId(jobId),
      userId: asObjectId(userId),
    }).lean();
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    if (!isSchedulableJobStatus(existing.status)) {
      throw new HttpError(
        409,
        "CONFLICT",
        "Interviews cannot be unscheduled for jobs in Application, Offer, or Not Relevant stages"
      );
    }

    const job = await JobModel.findOneAndUpdate(
      { _id: asObjectId(jobId), userId: asObjectId(userId) },
      {
        $unset: {
          [`stageSchedules.${existing.status}`]: 1,
          scheduledInterview: 1,
        },
      },
      { returnDocument: "after" }
    ).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json(serializeJob(job as Record<string, unknown>));
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
      { _id: asObjectId(jobId), userId: asObjectId(userId) },
      { $set: { status } },
      { returnDocument: "after" }
    ).lean();
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    return res.status(200).json(serializeJob(job as Record<string, unknown>));
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
