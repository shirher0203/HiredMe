import { Router } from "express";
import { z } from "zod";
import {
  completePracticeSession,
  createPracticeSession,
  regeneratePracticeQuestions,
  sendPracticeMessage,
  getPracticeSummary,
} from "../controllers/practice.controller";
import { validate } from "../middlewares/validate.middleware";

const createSessionSchema = z.object({
  body: z.object({
    interviewType: z.enum(["hr", "technical"]),
    count: z.coerce.number().int().min(1).max(10).optional(),
    jobId: z.string().trim().min(1).optional(),
    language: z.enum(["he", "en"]).optional(),
    // Accepted for one release so the current client keeps working; the server
    // reads the candidate's skills from their saved profile instead.
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
practiceRouter.post("/sessions/:id/regenerate", regeneratePracticeQuestions);
practiceRouter.post("/sessions/:id/msg", sendPracticeMessage);
practiceRouter.patch("/sessions/:id/complete", completePracticeSession);
practiceRouter.get("/sessions/:id/summary", getPracticeSummary);
