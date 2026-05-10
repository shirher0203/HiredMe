import { Router } from "express";
import { postMatchFlowResume } from "../controllers/match-flow.controller";
import { upload } from "../middlewares/upload.middleware";

export const matchFlowRouter = Router();

matchFlowRouter.post("/resume", upload.single("file"), postMatchFlowResume);
