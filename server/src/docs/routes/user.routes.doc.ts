export const userPaths = {
  "/api/user/me": {
    get: {
      tags: ["User"],
      summary: "Get current user profile and cached profile analysis",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": { description: "Current user data" },
        "401": { description: "Unauthorized" },
      },
    },
    put: {
      tags: ["User"],
      summary: "Update current user profile",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["profile"],
              properties: {
                profile: {
                  type: "object",
                  properties: {
                    skills: { type: "array", items: { type: "string" } },
                    experienceYears: { type: "number" },
                    projects: { type: "array", items: { type: "string" } },
                    education: { type: "string" },
                    goals: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Profile updated" },
        "400": { description: "Validation error" },
      },
    },
  },
  "/api/user/me/analyze-profile": {
    post: {
      tags: ["User"],
      summary: "Analyze profile with Role-4 AI service and cache result",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "force",
          required: false,
          schema: { type: "string", enum: ["true", "false"] },
          description: "Force re-analysis even if cached hash matches",
        },
      ],
      responses: {
        "200": { description: "Profile analysis result" },
        "401": { description: "Unauthorized" },
      },
    },
  },
};

