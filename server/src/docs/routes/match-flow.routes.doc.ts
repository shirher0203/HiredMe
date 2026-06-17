/** OpenAPI paths for `/api/v1/match-flow` (resume → job → match pipeline). */

const matchFlowSecurity = [{ bearerAuth: [] }] as const;

const errorResponses = {
  "400": {
    description: "Validation or upload error",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
  "401": {
    description: "Missing or invalid JWT",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
  "404": {
    description: "Match flow or user not found",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
  "413": {
    description: "PDF larger than 5MB",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
  "422": {
    description: "AI output validation failed",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
};

const idParameter = {
  name: "id",
  in: "path" as const,
  required: true,
  description: "Match flow document id",
  schema: { type: "string" as const },
};

export const matchFlowPaths = {
  "/api/v1/match-flow": {
    post: {
      tags: ["Match flow"],
      summary: "Run full pipeline (PDF + job description → match)",
      description:
        "Multipart: PDF `file` and form field `jobDescription`. Extracts text, parses resume, analyzes job, computes hybrid match. Idempotent when the same user repeats identical PDF+job (cached pipeline).",
      security: [...matchFlowSecurity],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file", "jobDescription"],
              properties: {
                file: {
                  type: "string",
                  format: "binary",
                  description: "PDF CV, up to 5MB",
                },
                jobDescription: {
                  type: "string",
                  description: "Raw job posting text",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description:
            "Pipeline result: parsed resume, job analysis, match report; `pipelineCached` when no AI re-run was needed",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MatchFlowFullPipelineResponse",
              },
            },
          },
        },
        ...errorResponses,
        "500": {
          description: "PDF parse or internal error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/api/v1/match-flow/resume": {
    post: {
      tags: ["Match flow"],
      summary: "Upload resume PDF (extract text only for this flow step)",
      security: [...matchFlowSecurity],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: {
                  type: "string",
                  format: "binary",
                  description: "PDF file, up to 5MB",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Created match flow with extracted text and hash",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MatchFlowResumeUploadResponse",
              },
            },
          },
        },
        ...errorResponses,
        "500": {
          description: "PDF parsing failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/api/v1/match-flow/{id}/parse-resume": {
    post: {
      tags: ["Match flow"],
      summary: "Parse extracted resume text (AI)",
      security: [...matchFlowSecurity],
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Structured resume; `cached` if hash unchanged",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MatchFlowParseResumeResponse",
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/v1/match-flow/{id}/job": {
    patch: {
      tags: ["Match flow"],
      summary: "Analyze job description (AI)",
      security: [...matchFlowSecurity],
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["jobDescription"],
              properties: {
                jobDescription: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Job analysis; `cached` if description hash unchanged",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MatchFlowJobAnalysisResponse",
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/v1/match-flow/{id}/match": {
    post: {
      tags: ["Match flow"],
      summary: "Compute hybrid match (profile + job + parsed resume)",
      security: [...matchFlowSecurity],
      parameters: [idParameter],
      responses: {
        "200": {
          description: "Match report; `cached` if fingerprint unchanged",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/MatchFlowMatchResponse",
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
};
