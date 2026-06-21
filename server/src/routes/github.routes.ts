import { Router } from "express";
import { z } from "zod";
import { analyzeRepo } from "../controllers/github.controller";
import { validate } from "../middlewares/validate.middleware";
import { aiRateLimiter } from "../middlewares/rate-limit.middleware";

const analyzeRepoSchema = z.object({
  body: z.object({
    url: z.string().trim().min(1),
  }),
});

export const githubRouter = Router();

githubRouter.post(
  "/analyze",
  aiRateLimiter,
  validate(analyzeRepoSchema),
  analyzeRepo
);
