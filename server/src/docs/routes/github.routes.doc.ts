export const githubPaths = {
  "/api/github/analyze": {
    post: {
      tags: ["Github"],
      summary: "Analyze a GitHub repository (metadata + AI analysis)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["url"],
              properties: {
                url: {
                  type: "string",
                  description: "Public github.com repository URL",
                  example: "https://github.com/shirher0203/HiredMe",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Repository metadata and AI analysis" },
        "400": {
          description: "Invalid or missing URL",
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
          description: "Repository not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "429": {
          description: "Rate limit exceeded (local or GitHub API)",
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
