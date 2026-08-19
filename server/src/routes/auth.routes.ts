import { Router } from "express";
import {
  googleCallback,
  login,
  register,
  startGoogleAuth,
} from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/google/start", startGoogleAuth);
authRouter.get("/google/callback", googleCallback);
