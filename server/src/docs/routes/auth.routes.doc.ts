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
};

