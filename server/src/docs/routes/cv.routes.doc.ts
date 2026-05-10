export const cvPaths = {
  "/api/v1/cv/extract-text": {
    post: {
      tags: ["CV"],
      summary: "Extract text from a PDF CV",
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: {
                  type: "string",
                  format: "binary",
                  description: "PDF file, up to 5MB",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Extracted CV text",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExtractCvTextResponse" },
            },
          },
        },
        "400": {
          description: "Missing file, invalid file type, or empty/scanned PDF",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "413": {
          description: "Uploaded file is larger than 5MB",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
        "500": {
          description: "PDF parsing failed",
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
