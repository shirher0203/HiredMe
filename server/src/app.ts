import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { practiceRouter } from "./routes/practice.routes";
import { matchRouter } from "./routes/match.routes";
import { authMiddleware } from "./middlewares/auth.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import { createOpenApiSpec } from "./docs/openapi";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "*",
    })
  );
  app.use(express.json({ limit: "2mb" }));
  const openApiSpec = createOpenApiSpec();

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/docs.json", (_req, res) => {
    res.status(200).json(openApiSpec);
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use("/api/auth", authRouter);
  app.use("/api/user", authMiddleware, userRouter);
  app.use("/api/jobs", authMiddleware, jobsRouter);
  app.use("/api/practice", authMiddleware, practiceRouter);
  app.use("/api/match", authMiddleware, matchRouter);

  app.use(errorMiddleware);

  return app;
}
