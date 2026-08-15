import { envSchema } from "../../config/env.config";

const VALID_SECRET = "a".repeat(32);

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "development",
    PORT: "5000",
    MONGODB_URI: "mongodb://localhost:27017/hiredme",
    JWT_SECRET: VALID_SECRET,
    USE_MOCK_AI: "false",
    ...overrides,
  };
}

function issuePaths(result: ReturnType<typeof envSchema.safeParse>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("envSchema", () => {
  it("accepts real-AI mode with only GEMINI_API_KEY", () => {
    const result = envSchema.safeParse(baseEnv({ GEMINI_API_KEY: "gemini-key" }));

    expect(result.success).toBe(true);
  });

  it("accepts real-AI mode with only GOOGLE_GENERATIVE_AI_KEY", () => {
    const result = envSchema.safeParse(
      baseEnv({ GOOGLE_GENERATIVE_AI_KEY: "google-key" })
    );

    expect(result.success).toBe(true);
  });

  it("rejects real-AI mode when only OPENAI_API_KEY is set", () => {
    // The AI client can only talk to Gemini, so an OpenAI key must not count as
    // a configured provider. Before this was enforced the server booted and
    // then failed on the first AI request instead.
    const result = envSchema.safeParse(baseEnv({ OPENAI_API_KEY: "sk-openai" }));

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("GEMINI_API_KEY/GOOGLE_GENERATIVE_AI_KEY");
  });

  it("rejects real-AI mode with no provider key at all", () => {
    const result = envSchema.safeParse(baseEnv());

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("GEMINI_API_KEY/GOOGLE_GENERATIVE_AI_KEY");
  });

  it("accepts mock mode with no provider key", () => {
    const result = envSchema.safeParse(baseEnv({ USE_MOCK_AI: "true" }));

    expect(result.success).toBe(true);
  });

  it("treats a whitespace-only key as missing", () => {
    const result = envSchema.safeParse(baseEnv({ GEMINI_API_KEY: "   " }));

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("GEMINI_API_KEY/GOOGLE_GENERATIVE_AI_KEY");
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    const result = envSchema.safeParse(
      baseEnv({ JWT_SECRET: "too-short", GEMINI_API_KEY: "gemini-key" })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("JWT_SECRET");
  });

  it("rejects a non-numeric PORT", () => {
    const result = envSchema.safeParse(
      baseEnv({ PORT: "not-a-port", GEMINI_API_KEY: "gemini-key" })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("PORT");
  });

  it("rejects a MONGODB_URI without a mongodb scheme", () => {
    const result = envSchema.safeParse(
      baseEnv({ MONGODB_URI: "http://localhost:27017", GEMINI_API_KEY: "gemini-key" })
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("MONGODB_URI");
  });

  it("defaults PORT and USE_MOCK_AI when they are absent", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "development",
      MONGODB_URI: "mongodb://localhost:27017/hiredme",
      JWT_SECRET: VALID_SECRET,
      GEMINI_API_KEY: "gemini-key",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(5000);
      expect(result.data.USE_MOCK_AI).toBe("false");
    }
  });
});
