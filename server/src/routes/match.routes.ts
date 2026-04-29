import { Router } from "express";
import { analyzeMatchPreview } from "../controllers/match.controller";

export const matchRouter = Router();

matchRouter.post("/analyze", analyzeMatchPreview);

