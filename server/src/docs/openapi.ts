import { authPaths } from "./routes/auth.routes.doc";
import { userPaths } from "./routes/user.routes.doc";
import { jobsPaths } from "./routes/jobs.routes.doc";
import { practicePaths } from "./routes/practice.routes.doc";
import { matchPaths } from "./routes/match.routes.doc";
import { cvPaths } from "./routes/cv.routes.doc";

export function createOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "HiredMe Server API",
      version: "1.0.0",
      description: "Backend POC API for HiredMe",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT ?? 5000}`,
        description: "Local server",
      },
    ],
    tags: [
      { name: "Auth" },
      { name: "User" },
      { name: "Jobs" },
      { name: "Practice" },
      { name: "Match" },
      { name: "CV" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          required: ["status", "error"],
          properties: {
            status: { type: "string", enum: ["error"] },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
        ExtractCvTextResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: ["filename", "pageCount", "extractedText"],
              properties: {
                filename: { type: "string" },
                pageCount: { type: "number" },
                extractedText: { type: "string" },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["Auth"],
          summary: "Health check",
          responses: {
            "200": { description: "OK" },
          },
        },
      },
      ...authPaths,
      ...userPaths,
      ...jobsPaths,
      ...practicePaths,
      ...matchPaths,
      ...cvPaths,
    },
  };
}
