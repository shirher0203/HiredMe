import { Router } from "express";
import {
  analyzeJobForUser,
  createJob,
  getJobs,
  patchJobStatus,
} from "../controllers/jobs.controller";

export const jobsRouter = Router();

jobsRouter.get("/", getJobs);
jobsRouter.post("/", createJob);
jobsRouter.patch("/:id/status", patchJobStatus);
jobsRouter.post("/:id/analyze", analyzeJobForUser);

