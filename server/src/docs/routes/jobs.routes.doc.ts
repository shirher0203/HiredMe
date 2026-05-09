export const jobsPaths = {
  "/api/jobs": {
    get: {
      tags: ["Jobs"],
      summary: "Get current user's jobs grouped by status",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": { description: "Grouped jobs" },
      },
    },
    post: {
      tags: ["Jobs"],
      summary: "Create a job entry",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["description"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Job created" },
      },
    },
  },
  "/api/jobs/{id}/status": {
    patch: {
      tags: ["Jobs"],
      summary: "Update recruitment status",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: {
                  type: "string",
                  enum: ["to_apply", "applied", "hr", "technical", "offer"],
                },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Status updated" },
      },
    },
  },
  "/api/jobs/{id}/analyze": {
    post: {
      tags: ["Jobs"],
      summary: "Analyze job and calculate match",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
        },
        {
          in: "query",
          name: "force",
          required: false,
          schema: { type: "string", enum: ["true", "false"] },
          description: "Force re-analysis even if cached hash matches",
        },
      ],
      responses: {
        "200": { description: "Job and match analysis" },
      },
    },
  },
};

