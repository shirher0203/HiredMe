import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/user-profile.controller";

export const userProfileRouter = Router();

userProfileRouter.get("/profile", getProfile);
userProfileRouter.put("/profile", updateProfile);
