import { Router } from "express";
import { analyzeMyProfile, getMe, updateMe } from "../controllers/user.controller";

export const userRouter = Router();

userRouter.get("/me", getMe);
userRouter.put("/me", updateMe);
userRouter.post("/me/analyze-profile", analyzeMyProfile);

