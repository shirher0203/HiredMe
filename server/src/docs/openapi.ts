import { authPaths } from "./routes/auth.routes.doc";
import { userPaths } from "./routes/user.routes.doc";
import { jobsPaths } from "./routes/jobs.routes.doc";
import { practicePaths } from "./routes/practice.routes.doc";
import { matchPaths } from "./routes/match.routes.doc";

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
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
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
    },
  };
}

