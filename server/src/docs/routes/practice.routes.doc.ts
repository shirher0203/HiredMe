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
  "/api/practice/sessions/list": {
    get: {
      tags: ["Practice"],
      summary: "List the caller's practice sessions",
      description:
        "Newest first. Returns a lightweight view without questions or turns. Served at GET /api/practice/sessions.",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "query",
          name: "jobId",
          required: false,
          schema: { type: "string" },
        },
        {
          in: "query",
          name: "interviewType",
          required: false,
          schema: { type: "string", enum: ["hr", "technical"] },
        },
        {
          in: "query",
          name: "status",
          required: false,
          schema: { type: "string", enum: ["active", "completed"] },
        },
      ],
      responses: {
        "200": { description: "Session list" },
      },
    },
  },
  "/api/practice/sessions/{id}/regenerate": {
    post: {
      tags: ["Practice"],
      summary: "Replace the unanswered questions in a session",
      description:
        "Regenerates only the questions that have not been answered yet, excluding questions already asked in this session and in the user's recent sessions for the same job. Answered questions and their turns are preserved.",
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
        "200": { description: "The session's full question list after replacement" },
        "400": {
          description: "Session is completed, or every question has been answered",
        },
        "404": { description: "Session not found" },
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

