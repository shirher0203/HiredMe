import { Router } from "express";
import {
  completePracticeSession,
  createPracticeSession,
  sendPracticeMessage,
} from "../controllers/practice.controller";

export const practiceRouter = Router();

practiceRouter.post("/sessions", createPracticeSession);
practiceRouter.post("/sessions/:id/msg", sendPracticeMessage);
practiceRouter.patch("/sessions/:id/complete", completePracticeSession);

