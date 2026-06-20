import { Router } from "express";
import { z } from "zod";
import {
  analyzeJobForUser,
  createJob,
  getJobs,
  patchJobStatus,
  VALID_STATUSES,
} from "../controllers/jobs.controller";
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

export const jobsRouter = Router();

jobsRouter.get("/", validate(listJobsQuerySchema), getJobs);
jobsRouter.post("/", createJob);
jobsRouter.patch("/:id/status", patchJobStatus);
jobsRouter.post("/:id/analyze", analyzeJobForUser);
