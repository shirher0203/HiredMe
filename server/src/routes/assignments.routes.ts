import { Router } from "express";
import { z } from "zod";
import { uploadAssignment } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { aiRateLimiter } from "../middlewares/rate-limit.middleware";
import {
  createAssignment,
  getAssignments,
  getAssignmentById,
} from "../controllers/assignments.controller";

const createAssignmentSchema = z.object({
  body: z.object({
    language: z.string().trim().min(1).optional(),
    jobId: z.string().trim().min(1).optional(),
  }),
});

export const assignmentsRouter = Router();

assignmentsRouter.get("/", getAssignments);
assignmentsRouter.get("/:id", getAssignmentById);
assignmentsRouter.post(
  "/",
  aiRateLimiter,
  uploadAssignment.single("file"),
  validate(createAssignmentSchema),
  createAssignment
);
