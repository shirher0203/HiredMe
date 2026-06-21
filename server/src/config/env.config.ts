import { z } from "zod";

const portSchema = z.preprocess(
  (value) => (value === undefined || value === "" ? 5000 : Number(value)),
  z
    .number({
      invalid_type_error: "must be a valid port number",
    })
    .int("must be a whole number")
    .min(1, "must be between 1 and 65535")
    .max(65535, "must be between 1 and 65535")
);

const optionalKeySchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().min(1, "must not be empty").optional()
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"], {
      required_error: "is required",
      invalid_type_error: "must be development, production, or test",
    }),
    PORT: portSchema,
    MONGODB_URI: z
      .string({
        required_error: "is required",
        invalid_type_error: "must be a string",
      })
      .trim()
      .regex(
        /^mongodb(\+srv)?:\/\//,
        "must start with mongodb:// or mongodb+srv://"
      ),
    JWT_SECRET: z
      .string({
        required_error: "is required",
        invalid_type_error: "must be a string",
      })
      .min(32, "must be at least 32 characters"),
    OPENAI_API_KEY: optionalKeySchema,
    GOOGLE_GENERATIVE_AI_KEY: optionalKeySchema,
    GEMINI_API_KEY: optionalKeySchema,
    USE_MOCK_AI: z.preprocess(
      (value) => (value === undefined || value === "" ? "false" : value),
      z.enum(["true", "false"])
    ),
  })
  .superRefine((env, ctx) => {
    if (
      env.USE_MOCK_AI !== "true" &&
      !env.OPENAI_API_KEY &&
      !env.GOOGLE_GENERATIVE_AI_KEY &&
      !env.GEMINI_API_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY/GOOGLE_GENERATIVE_AI_KEY/GEMINI_API_KEY"],
        message: "at least one primary LLM API key is required when USE_MOCK_AI is not true",
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

function formatEnvValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const variable = issue.path.join(".") || "ENV";
      return `${variable} ${issue.message}`;
    })
    .join(", ");
}

export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      `Environment Validation Error: ${formatEnvValidationError(result.error)}`
    );
    process.exit(1);
  }

  console.log("[Env] Environment variables validated successfully");
  return result.data;
}
