export const authPaths = {
  "/api/auth/register": {
    post: {
      tags: ["Auth"],
      summary: "Register a new user",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 6 },
                personalInfo: {
                  type: "object",
                  description: "Account-owned personal information. CV uploads do not overwrite these fields.",
                  properties: {
                    fullName: { type: "string" },
                    phone: { type: "string" },
                    location: { type: "string" },
                    linkedinUrl: { type: "string" },
                    portfolioOrGithubUrl: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        "201": {
          description: "User created",
        },
        "400": {
          description: "Validation error",
        },
      },
    },
  },
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Login and receive JWT",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email" },
                password: { type: "string", minLength: 6 },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Authenticated" },
        "401": { description: "Invalid credentials" },
      },
    },
  },
  "/api/auth/google/start": {
    get: {
      tags: ["Auth"],
      summary: "Start Google OAuth sign-in",
      parameters: [
        {
          in: "query",
          name: "redirect",
          required: false,
          schema: { type: "string" },
          description: "App-relative path to return to after sign-in",
        },
      ],
      responses: {
        "302": { description: "Redirect to Google OAuth" },
        "500": { description: "Google auth is not configured" },
      },
    },
  },
  "/api/auth/google/callback": {
    get: {
      tags: ["Auth"],
      summary: "Handle Google OAuth callback",
      responses: {
        "302": { description: "Redirect to client callback with HiredMe session or error" },
      },
    },
  },
};
