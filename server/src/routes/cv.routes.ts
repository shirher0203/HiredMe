import { Router } from "express";
import {
  extractCvText,
  analyzeProfileMatch,
  analyzeResumeMatch,
  parseCv,
} from "../controllers/cv.controller";
import { upload } from "../middlewares/upload.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";

export const cvRouter = Router();

cvRouter.post("/extract-text", upload.single("file"), extractCvText);
cvRouter.post("/analyze-resume", upload.single("file"), analyzeResumeMatch);
cvRouter.post("/analyze-profile", authMiddleware, analyzeProfileMatch);
cvRouter.post("/parse", authMiddleware, upload.single("file"), parseCv);
