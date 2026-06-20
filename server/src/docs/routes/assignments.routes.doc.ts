export const assignmentsPaths = {
  "/api/assignments": {
    get: {
      tags: ["Assignments"],
      summary: "List the authenticated user's home assignments",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": { description: "Array of home assignments" },
        "401": {
          description: "Missing or invalid token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
    post: {
      tags: ["Assignments"],
      summary: "Upload a home assignment and get an AI evaluation",
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
                  description: "Assignment file (code, text, or PDF), up to 5MB",
                },
                language: {
                  type: "string",
                  description: "Programming language (optional)",
                },
                jobId: {
                  type: "string",
                  description: "Linked job id (optional)",
                },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Assignment created with evaluation" },
        "400": {
          description: "Missing file, empty file, or invalid input",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "401": {
          description: "Missing or invalid token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "404": {
          description: "Linked job not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "429": {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
    },
  },
  "/api/assignments/{id}": {
    get: {
      tags: ["Assignments"],
      summary: "Get a single home assignment by id",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": { description: "The home assignment" },
        "401": {
          description: "Missing or invalid token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "404": {
          description: "Assignment not found",
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
