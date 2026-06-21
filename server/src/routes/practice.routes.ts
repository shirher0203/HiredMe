import { Router } from "express";
import { z } from "zod";
import {
  completePracticeSession,
  createPracticeSession,
  sendPracticeMessage,
} from "../controllers/practice.controller";
import { validate } from "../middlewares/validate.middleware";

const createSessionSchema = z.object({
  body: z.object({
    interviewType: z.enum(["hr", "technical"]),
    count: z.coerce.number().int().min(1).max(10).optional(),
    jobId: z.string().trim().min(1).optional(),
    language: z.enum(["he", "en"]).optional(),
    profileSkills: z.array(z.string()).optional(),
    jobRequiredSkills: z.array(z.string()).optional(),
  }),
});

export const practiceRouter = Router();

practiceRouter.post(
  "/sessions",
  validate(createSessionSchema),
  createPracticeSession
);
practiceRouter.post("/sessions/:id/msg", sendPracticeMessage);
practiceRouter.patch("/sessions/:id/complete", completePracticeSession);
