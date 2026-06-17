import { Router } from "express";
import { extractCvText, analyzeResumeMatch } from "../controllers/cv.controller";
import { upload } from "../middlewares/upload.middleware";

export const cvRouter = Router();

cvRouter.post("/extract-text", upload.single("file"), extractCvText);
cvRouter.post("/analyze-resume", upload.single("file"), analyzeResumeMatch);
