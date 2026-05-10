import { Router } from "express";
import { extractCvText } from "../controllers/cv.controller";
import { upload } from "../middlewares/upload.middleware";

export const cvRouter = Router();

cvRouter.post("/extract-text", upload.single("file"), extractCvText);
