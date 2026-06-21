export const userProfilePaths = {
  "/api/v1/users/profile": {
    get: {
      tags: ["User profile"],
      summary: "Fetch the authenticated user's structured CV profile",
      security: [{ bearerAuth: [] }],
      responses: {
        "200": {
          description: "Saved structured profile, or null when none exists",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserProfileResponse" },
            },
          },
        },
        "401": { description: "Unauthorized" },
      },
    },
    put: {
      tags: ["User profile"],
      summary: "Save the authenticated user's verified structured CV profile",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["profile"],
              properties: {
                profile: { $ref: "#/components/schemas/ParsedResume" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Saved structured profile",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserProfileResponse" },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Unauthorized" },
      },
    },
  },
};
