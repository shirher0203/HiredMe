import { authPaths } from "./routes/auth.routes.doc";
import { userPaths } from "./routes/user.routes.doc";
import { jobsPaths } from "./routes/jobs.routes.doc";
import { practicePaths } from "./routes/practice.routes.doc";
import { matchPaths } from "./routes/match.routes.doc";
import { cvPaths } from "./routes/cv.routes.doc";
import { assignmentsPaths } from "./routes/assignments.routes.doc";
import { githubPaths } from "./routes/github.routes.doc";
import { matchFlowPaths } from "./routes/match-flow.routes.doc";

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
      { name: "Assignments" },
      { name: "Github" },
      { name: "CV" },
      { name: "Match flow" },
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
        MatchFlowResumeUploadResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: [
                "matchFlowId",
                "resumeTextHash",
                "textLength",
                "pageCount",
                "filename",
              ],
              properties: {
                matchFlowId: { type: "string" },
                resumeTextHash: { type: "string" },
                textLength: { type: "number" },
                pageCount: { type: "number" },
                filename: { type: "string" },
              },
            },
          },
        },
        MatchFlowParseResumeResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: ["parsedResume", "cached"],
              properties: {
                cached: { type: "boolean" },
                parsedResume: { type: "object", additionalProperties: true },
              },
            },
          },
        },
        MatchFlowJobAnalysisResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: ["jobAnalysis", "cached"],
              properties: {
                cached: { type: "boolean" },
                jobAnalysis: { type: "object", additionalProperties: true },
              },
            },
          },
        },
        MatchFlowMatchResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: ["matchReport", "cached"],
              properties: {
                cached: { type: "boolean" },
                matchReport: { type: "object", additionalProperties: true },
              },
            },
          },
        },
        MatchFlowFullPipelineResponse: {
          type: "object",
          required: ["status", "data"],
          properties: {
            status: { type: "string", enum: ["success"] },
            data: {
              type: "object",
              required: [
                "matchFlowId",
                "filename",
                "pageCount",
                "resumeTextHash",
                "jobDescriptionHash",
                "parsedResume",
                "jobAnalysis",
                "matchReport",
                "pipelineCached",
                "usedCached",
              ],
              properties: {
                matchFlowId: { type: "string" },
                filename: { type: "string" },
                pageCount: { type: "number" },
                resumeTextHash: { type: "string" },
                jobDescriptionHash: { type: "string" },
                parsedResume: { type: "object", additionalProperties: true },
                jobAnalysis: { type: "object", additionalProperties: true },
                matchReport: { type: "object", additionalProperties: true },
                pipelineCached: { type: "boolean" },
                usedCached: {
                  type: "object",
                  required: ["parseResume", "jobAnalysis", "match"],
                  properties: {
                    parseResume: { type: "boolean" },
                    jobAnalysis: { type: "boolean" },
                    match: { type: "boolean" },
                  },
                },
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
      ...assignmentsPaths,
      ...githubPaths,
      ...cvPaths,
      ...matchFlowPaths,
    },
  };
}
