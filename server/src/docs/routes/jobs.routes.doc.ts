import { JOB_SOURCES, JOB_STATUSES } from "../../models/job.model";

export const jobsPaths = {
  "/api/jobs": {
    get: {
      tags: ["Jobs"],
      summary: "Get current user's jobs grouped by status",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": { description: "Grouped jobs by pipeline status" },
      },
    },
    post: {
      tags: ["Jobs"],
      summary: "Create a job application entry",
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
                company: { type: "string" },
                description: { type: "string" },
                notes: { type: "string" },
                contact: { type: "string" },
                jobUrl: { type: "string" },
                source: { type: "string", enum: [...JOB_SOURCES] },
                status: { type: "string", enum: [...JOB_STATUSES] },
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
  "/api/jobs/{id}": {
    patch: {
      tags: ["Jobs"],
      summary: "Update job application details",
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
              properties: {
                title: { type: "string" },
                company: { type: "string" },
                description: { type: "string" },
                notes: { type: "string" },
                contact: { type: "string" },
                jobUrl: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Job updated" },
      },
    },
    delete: {
      tags: ["Jobs"],
      summary: "Delete a job application",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": { description: "Job deleted" },
      },
    },
  },
  "/api/jobs/{id}/status": {
    patch: {
      tags: ["Jobs"],
      summary: "Update recruitment pipeline status",
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
                  enum: [...JOB_STATUSES],
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
