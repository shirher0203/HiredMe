export const matchPaths = {
  "/api/match/analyze": {
    post: {
      tags: ["Match"],
      summary: "Analyze fit preview for a job description",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["jobDescription"],
              properties: {
                jobDescription: { type: "string" },
                profileOverride: {
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
        "200": { description: "Match preview with job and match analysis" },
      },
    },
  },
};

