import { Router } from "express";
import { z } from "zod";
import {
  analyzeJobForUser,
  createJob,
  deleteJob,
  getJobs,
  patchJob,
  patchJobStatus,
  scheduleJob,
  unscheduleJob,
  VALID_STATUSES,
} from "../controllers/jobs.controller";
import { JOB_SOURCES } from "../models/job.model";
import { validate } from "../middlewares/validate.middleware";

const listJobsQuerySchema = z.object({
  query: z.object({
    view: z.enum(["board", "list"]).optional(),
    q: z.string().trim().min(1).optional(),
    status: z.enum(VALID_STATUSES).optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    cursor: z.string().min(1).optional(),
  }),
});

const createJobSchema = z.object({
  body: z.object({
    description: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    company: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    contact: z.string().trim().optional(),
    jobUrl: z.string().trim().optional(),
    source: z.enum(JOB_SOURCES).optional(),
    status: z.enum(VALID_STATUSES).optional(),
  }),
});

const patchJobSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      title: z.string().trim().min(1).optional(),
      company: z.string().trim().optional(),
      description: z.string().trim().min(1).optional(),
      notes: z.string().trim().optional(),
      contact: z.string().trim().optional(),
      jobUrl: z.string().trim().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

const patchJobStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.enum(VALID_STATUSES),
  }),
});

const jobIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const scheduleJobSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    startAt: z.string().min(1),
  }),
});

export const jobsRouter = Router();

jobsRouter.get("/", validate(listJobsQuerySchema), getJobs);
jobsRouter.post("/", validate(createJobSchema), createJob);
jobsRouter.patch("/:id", validate(patchJobSchema), patchJob);
jobsRouter.patch("/:id/status", validate(patchJobStatusSchema), patchJobStatus);
jobsRouter.post("/:id/schedule", validate(scheduleJobSchema), scheduleJob);
jobsRouter.delete("/:id/schedule", validate(jobIdParamsSchema), unscheduleJob);
jobsRouter.delete("/:id", validate(jobIdParamsSchema), deleteJob);
jobsRouter.post("/:id/analyze", analyzeJobForUser);
