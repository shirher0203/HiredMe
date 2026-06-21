/**
 * Tests for the resume parser.
 *
 * All tests either run with USE_MOCK_AI=true or stub `callAi` via jest.mock,
 * so no real network I/O is ever attempted.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
  getActiveModelName: jest.fn(() => "gemini-test-model"),
  isApiKeyConfigured: jest.fn(() => true),
}));

import { createHash } from "crypto";

import { callAi } from "../../services/ai/ai.client";
import { parseResume, __testables } from "../../services/ai/ai.service";
import { mockParsedResume } from "../../services/ai/mock-ai.responses";
import type { ParsedResume } from "../../services/ai/parsed-resume.types";

const mockedCallAi = callAi as unknown as jest.Mock;

const RESUME_TEXT = "Dana Levi — junior full-stack developer. React, Node, MongoDB.";

function validPayload(): Record<string, unknown> {
  return {
    personal_info: {
      full_name: "Dana Levi",
      email: "dana.levi@example.com",
      phone: null,
      location: "Tel Aviv",
      linkedin_url: null,
      portfolio_or_github_url: "https://github.com/dana-levi",
    },
    professional_summary: "Junior full-stack developer.",
    work_experience: [
      {
        company_name: "Acme Labs",
        job_title: "Junior Full-Stack Developer",
        start_date: "2024-07",
        end_date: "present",
        location: "Tel Aviv",
        responsibilities: ["Built React components.", "Wrote Node endpoints."],
        achievements: ["Cut dashboard load time by 40%."],
      },
    ],
    education: [
      {
        institution_name: "Tel Aviv University",
        degree_type: "BSc",
        field_of_study: "Computer Science",
        start_date: "2021-10",
        end_date: "2024-07",
      },
    ],
    skills: {
      technical_skills: ["React.js", "node"],
      soft_skills: ["communication"],
      tools_and_software: ["Git", "docker"],
    },
    projects: [
      {
        project_name: "HiredMe",
        description: "Final project.",
        technologies_used: ["React", "Node.js", "MongoDB"],
        link: "https://github.com/shirher0203/HiredMe",
      },
    ],
    languages: [
      { language: "Hebrew", proficiency_level: "native" },
      { language: "English", proficiency_level: "fluent" },
    ],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: 1,
    },
  };
}

beforeEach(() => {
  mockedCallAi.mockReset();
});

describe("parseResume — mock mode", () => {
  beforeAll(() => {
    process.env.USE_MOCK_AI = "true";
  });
  afterAll(() => {
    delete process.env.USE_MOCK_AI;
  });

  it("returns the mock shape with raw_text_hash computed from the input", async () => {
    const result = await parseResume(RESUME_TEXT);
    const expectedHash = createHash("sha256").update(RESUME_TEXT, "utf8").digest("hex");

    expect(result.raw_text_hash).toBe(expectedHash);
    expect(result.personal_info.full_name).toBe(mockParsedResume.personal_info.full_name);
    expect(Array.isArray(result.work_experience)).toBe(true);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("the same input always produces the same hash", async () => {
    const a = await parseResume(RESUME_TEXT);
    const b = await parseResume(RESUME_TEXT);
    expect(a.raw_text_hash).toBe(b.raw_text_hash);
  });

  it("different inputs produce different hashes", async () => {
    const a = await parseResume(RESUME_TEXT);
    const b = await parseResume(RESUME_TEXT + " extra line");
    expect(a.raw_text_hash).not.toBe(b.raw_text_hash);
  });

  it("throws a descriptive error on empty input", async () => {
    await expect(parseResume("")).rejects.toThrow("parseResume");
    await expect(parseResume("   ")).rejects.toThrow("non-empty string");
  });
});

describe("parseResume — real mode wiring", () => {
  const originalEnv = process.env.USE_MOCK_AI;

  beforeAll(() => {
    delete process.env.USE_MOCK_AI;
  });
  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.USE_MOCK_AI = originalEnv;
    }
  });

  it("parses a valid response into ParsedResume and attaches the hash", async () => {
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));

    const result = await parseResume(RESUME_TEXT);

    expect(mockedCallAi).toHaveBeenCalledTimes(1);
    expect(result.raw_text_hash).toBe(
      createHash("sha256").update(RESUME_TEXT, "utf8").digest("hex")
    );
    expect(result.personal_info.full_name).toBe("Dana Levi");
    expect(result.work_experience).toHaveLength(1);
    expect(result.work_experience[0].company_name).toBe("Acme Labs");
    expect(result.parsed_metadata.years_of_experience_estimate).toBe(1);
    expect(result.parsed_metadata.language_detected).toBe("en");
  });

  it("normalizes skills and project technologies", async () => {
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));

    const result = await parseResume(RESUME_TEXT);

    expect(result.skills.technical_skills).toEqual(["react", "node"]);
    expect(result.skills.tools_and_software).toEqual(["git", "docker"]);
    expect(result.skills.soft_skills).toEqual(["communication"]);
    expect(result.projects[0].technologies_used).toEqual(["react", "node", "mongodb"]);
  });

  it("retries once when the first response is not JSON and succeeds on retry", async () => {
    mockedCallAi.mockResolvedValueOnce("nonsense prose with no braces");
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));

    const result = await parseResume(RESUME_TEXT);

    expect(mockedCallAi).toHaveBeenCalledTimes(2);
    expect(result.personal_info.full_name).toBe("Dana Levi");
  });

  it("retries once when the first response is missing a top-level key", async () => {
    const missingKey = validPayload();
    delete missingKey.certifications;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(missingKey));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));

    const result = await parseResume(RESUME_TEXT);

    expect(mockedCallAi).toHaveBeenCalledTimes(2);
    expect(result.certifications).toEqual([]);
  });

  it("throws after the retry also fails", async () => {
    mockedCallAi.mockResolvedValueOnce("no json here");
    mockedCallAi.mockResolvedValueOnce("still not json");

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow("parseResume: retry failed");
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
  });

  it("does not silently coerce: extra top-level key is rejected (both attempts)", async () => {
    const extra = { ...validPayload(), sneaky_extra: "nope" };
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(extra));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(extra));

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow("unexpected top-level key");
  });

  it("rejects when a top-level array is actually an object", async () => {
    const broken = validPayload();
    (broken as Record<string, unknown>).work_experience = { company_name: "Acme" };
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      "field 'work_experience' is not an array"
    );
  });

  it("rejects when a required nested object is missing", async () => {
    const broken = validPayload();
    (broken as Record<string, unknown>).skills = null;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      "field 'skills' is not an object"
    );
  });

  it("rejects when an array entry has the wrong primitive type", async () => {
    const broken = validPayload();
    const work = broken.work_experience as Record<string, unknown>[];
    work[0].responsibilities = ["ok", 42];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      "work_experience[0].responsibilities[1]"
    );
  });

  it("accepts null string fields and preserves them as null", async () => {
    const nullish = validPayload();
    const pi = nullish.personal_info as Record<string, unknown>;
    pi.phone = null;
    pi.linkedin_url = null;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(nullish));

    const result = await parseResume(RESUME_TEXT);
    expect(result.personal_info.phone).toBeNull();
    expect(result.personal_info.linkedin_url).toBeNull();
  });

  it("empty string fields are coerced to null", async () => {
    const nullish = validPayload();
    const pi = nullish.personal_info as Record<string, unknown>;
    pi.phone = "   ";
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(nullish));

    const result = await parseResume(RESUME_TEXT);
    expect(result.personal_info.phone).toBeNull();
  });

  it("accepts empty arrays for certifications/awards", async () => {
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));
    const result = await parseResume(RESUME_TEXT);
    expect(result.certifications).toEqual([]);
    expect(result.awards).toEqual([]);
  });

  it("clamps out-of-enum language_detected to null without throwing", async () => {
    const weird = validPayload();
    (weird.parsed_metadata as Record<string, unknown>).language_detected = "klingon";
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(weird));

    const result = await parseResume(RESUME_TEXT);
    expect(result.parsed_metadata.language_detected).toBeNull();
  });

  it("rejects negative years_of_experience_estimate", async () => {
    const broken = validPayload();
    (broken.parsed_metadata as Record<string, unknown>).years_of_experience_estimate = -3;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(broken));

    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      "parsed_metadata.years_of_experience_estimate"
    );
  });

  it("tolerates numeric-string years_of_experience_estimate", async () => {
    const numericString = validPayload();
    (numericString.parsed_metadata as Record<string, unknown>).years_of_experience_estimate = "4";
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(numericString));

    const result = await parseResume(RESUME_TEXT);
    expect(result.parsed_metadata.years_of_experience_estimate).toBe(4);
  });
});

describe("ParsedResume structure invariants", () => {
  it("mockParsedResume satisfies the validator", () => {
    const { raw_text_hash: _ignored, ...body } = mockParsedResume;
    void _ignored;
    const result = __testables.validateParsedResume(JSON.stringify(body));
    const expectedKeys: (keyof ParsedResume)[] = [
      "personal_info",
      "professional_summary",
      "work_experience",
      "education",
      "skills",
      "projects",
      "languages",
      "certifications",
      "awards",
      "parsed_metadata",
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  it("coerceLanguageDetected normalizes casing and rejects unknown values", () => {
    expect(__testables.coerceLanguageDetected("EN")).toBe("en");
    expect(__testables.coerceLanguageDetected("he")).toBe("he");
    expect(__testables.coerceLanguageDetected("Mixed")).toBe("mixed");
    expect(__testables.coerceLanguageDetected("spanish")).toBeNull();
    expect(__testables.coerceLanguageDetected(null)).toBeNull();
    expect(__testables.coerceLanguageDetected(undefined)).toBeNull();
    expect(__testables.coerceLanguageDetected(42)).toBeNull();
  });

  it("coerceNullableString trims and collapses empties to null", () => {
    expect(__testables.coerceNullableString("  hello  ")).toBe("hello");
    expect(__testables.coerceNullableString("")).toBeNull();
    expect(__testables.coerceNullableString("   ")).toBeNull();
    expect(__testables.coerceNullableString(null)).toBeNull();
    expect(__testables.coerceNullableString(42)).toBeNull();
  });

  it("sha256Hex is deterministic and 64 hex chars", () => {
    const h = __testables.sha256Hex("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(__testables.sha256Hex("hello")).toBe(h);
  });
});
