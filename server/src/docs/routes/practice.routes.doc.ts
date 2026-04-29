export const practicePaths = {
  "/api/practice/sessions": {
    post: {
      tags: ["Practice"],
      summary: "Start a practice session and generate questions",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["interviewType"],
              properties: {
                interviewType: { type: "string", enum: ["hr", "technical"] },
                count: { type: "number", minimum: 1, maximum: 10 },
                profileSkills: { type: "array", items: { type: "string" } },
                jobRequiredSkills: { type: "array", items: { type: "string" } },
                language: { type: "string", enum: ["en", "he"] },
                jobId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Session created" },
      },
    },
  },
  "/api/practice/sessions/{id}/msg": {
    post: {
      tags: ["Practice"],
      summary: "Evaluate a user answer and append turn",
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
              required: ["questionId", "userAnswer"],
              properties: {
                questionId: { type: "string" },
                userAnswer: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Answer evaluation" },
      },
    },
  },
  "/api/practice/sessions/{id}/complete": {
    patch: {
      tags: ["Practice"],
      summary: "Mark a practice session as completed",
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
        "200": { description: "Session completed" },
      },
    },
  },
};

