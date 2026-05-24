export const cvPaths = {
  "/api/v1/cv/parse": {
    post: {
      tags: ["CV"],
      summary: "Parse a PDF CV into structured profile JSON",
      security: [{ bearerAuth: [] }],
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
                  description: "PDF CV, up to 5MB",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Structured parsed resume JSON",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ParseCvResponse" },
            },
          },
        },
        "400": {
          description: "Missing file, invalid file type, or empty/scanned PDF",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "401": { description: "Unauthorized" },
        "413": {
          description: "Uploaded file is larger than 5MB",
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
      },
    },
  },
  "/api/v1/cv/analyze-profile": {
    post: {
      tags: ["CV"],
      summary: "Analyze saved profile CV against a job description",
      description:
        "Uses the authenticated user's saved structured profile instead of accepting a CV upload.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["jobDescription"],
              properties: {
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
          description: "Job analysis, match report, and saved parsed resume",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AnalyzeResumeMatchResponse" },
            },
          },
        },
        "400": {
          description: "Missing jobDescription",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "401": { description: "Unauthorized" },
        "404": {
          description: "No saved profile exists for the authenticated user",
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
      },
    },
  },
  "/api/v1/cv/extract-text": {
    post: {
      tags: ["CV"],
      summary: "Extract text from a PDF CV",
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
          description: "Extracted CV text",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExtractCvTextResponse" },
            },
          },
        },
        "400": {
          description: "Missing file, invalid file type, or empty/scanned PDF",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "413": {
          description: "Uploaded file is larger than 5MB",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
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
};
