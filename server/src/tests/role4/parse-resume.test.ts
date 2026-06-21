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
    suggested_skills: [
      { skill: "redux", reason: "common state management for React apps.", confidence: 90 },
      { skill: "express", reason: "default Node web framework.", confidence: 88 },
      { skill: "jest", reason: "standard TypeScript testing tool.", confidence: 85 },
    ],
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
      "suggested_skills",
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

describe("parseResume — suggested_skills", () => {
  let original: string | undefined;

  beforeAll(() => {
    original = process.env.USE_MOCK_AI;
    process.env.USE_MOCK_AI = "false";
  });

  afterAll(() => {
    if (original === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = original;
  });

  beforeEach(() => {
    mockedCallAi.mockReset();
  });

  it("mock-mode parseResume includes at least 50 suggested skills", async () => {
    process.env.USE_MOCK_AI = "true";
    try {
      const result = await parseResume("any text");
      expect(result.suggested_skills.length).toBeGreaterThanOrEqual(50);
      for (const s of result.suggested_skills) {
        expect(typeof s.skill).toBe("string");
        expect(s.skill.length).toBeGreaterThan(0);
        expect(typeof s.reason).toBe("string");
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(100);
      }
    } finally {
      process.env.USE_MOCK_AI = "false";
    }
  });

  it("rejects when suggested_skills is missing (after retry)", async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).suggested_skills;
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(payload))
      .mockResolvedValueOnce(JSON.stringify(payload));
    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      /missing required top-level key 'suggested_skills'/
    );
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
  });

  it("rejects when suggested_skills is not an array", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = "nope";
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(payload))
      .mockResolvedValueOnce(JSON.stringify(payload));
    await expect(parseResume(RESUME_TEXT)).rejects.toThrow(
      /field 'suggested_skills' is not an array/
    );
  });

  it("normalizes aliases and dedupes by canonical form", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "React.js", reason: "ecosystem fit.", confidence: 90 },
      { skill: "reactjs", reason: "duplicate alias.", confidence: 80 },
      { skill: "Express", reason: "default Node web framework.", confidence: 85 },
    ];
    // technical_skills includes "React.js" -> normalizes to "react", so the
    // first two suggestions collapse to "react" which already exists, and both
    // should be dropped. Only "express" survives.
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).toEqual(["express"]);
  });

  it("drops suggestions that duplicate existing technical_skills", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "react", reason: "already known.", confidence: 95 },
      { skill: "graphql", reason: "common API layer.", confidence: 70 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).not.toContain("react");
    expect(skills).toContain("graphql");
  });

  it("drops suggestions that duplicate existing tools_and_software", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "Docker", reason: "already in tools.", confidence: 95 },
      { skill: "kubernetes", reason: "natural step from Docker.", confidence: 60 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).not.toContain("docker");
    expect(skills).toContain("kubernetes");
  });

  it("drops suggestions that duplicate project technologies", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "MongoDB", reason: "already in project tech.", confidence: 90 },
      { skill: "redis", reason: "common caching layer.", confidence: 60 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).not.toContain("mongodb");
    expect(skills).toContain("redis");
  });

  it("clamps confidence to [0, 100] and coerces numeric strings", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "graphql", reason: "ok.", confidence: 120 },
      { skill: "redis", reason: "ok.", confidence: -10 },
      { skill: "vite", reason: "ok.", confidence: "85" },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const byName = new Map(result.suggested_skills.map((s) => [s.skill, s.confidence]));
    expect(byName.get("graphql")).toBe(100);
    expect(byName.get("redis")).toBe(0);
    expect(byName.get("vite")).toBe(85);
  });

  it("drops entries with non-coercible confidence rather than inserting 0", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "graphql", reason: "ok.", confidence: "abc" },
      { skill: "vite", reason: "ok.", confidence: 70 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).toEqual(["vite"]);
  });

  it("drops entries with empty or missing reason", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "graphql", reason: "", confidence: 80 },
      { skill: "vite", confidence: 70 },
      { skill: "redis", reason: "ok.", confidence: 60 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const skills = result.suggested_skills.map((s) => s.skill);
    expect(skills).toEqual(["redis"]);
  });

  it("returns the list sorted by confidence descending", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "graphql", reason: "ok.", confidence: 40 },
      { skill: "redis", reason: "ok.", confidence: 90 },
      { skill: "vite", reason: "ok.", confidence: 70 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const confs = result.suggested_skills.map((s) => s.confidence);
    expect(confs).toEqual([...confs].sort((a, b) => b - a));
    expect(result.suggested_skills.map((s) => s.skill)).toEqual([
      "redis",
      "vite",
      "graphql",
    ]);
  });

  it("breaks confidence ties alphabetically by skill", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "vite", reason: "ok.", confidence: 70 },
      { skill: "graphql", reason: "ok.", confidence: 70 },
      { skill: "redis", reason: "ok.", confidence: 70 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    expect(result.suggested_skills.map((s) => s.skill)).toEqual([
      "graphql",
      "redis",
      "vite",
    ]);
  });

  it("empty suggested_skills array is allowed and does not retry", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    expect(result.suggested_skills).toEqual([]);
    expect(mockedCallAi).toHaveBeenCalledTimes(1);
  });

  it("mockParsedResume's suggested_skills do not duplicate its own CV skills", () => {
    const existing = new Set<string>([
      ...mockParsedResume.skills.technical_skills,
      ...mockParsedResume.skills.tools_and_software,
      ...mockParsedResume.projects.flatMap((p) => p.technologies_used),
    ]);
    for (const s of mockParsedResume.suggested_skills) {
      expect(existing.has(s.skill)).toBe(false);
    }
  });

  it("rejects entries whose normalized skill is empty", async () => {
    const payload = validPayload();
    (payload as Record<string, unknown>).suggested_skills = [
      { skill: "   ", reason: "blank.", confidence: 50 },
      { skill: "redis", reason: "ok.", confidence: 60 },
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    expect(result.suggested_skills.map((s) => s.skill)).toEqual(["redis"]);
  });

  it("hash also computed when suggested_skills is present", async () => {
    const payload = validPayload();
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(payload));
    const result = await parseResume(RESUME_TEXT);
    const expected = createHash("sha256").update(RESUME_TEXT, "utf8").digest("hex");
    expect(result.raw_text_hash).toBe(expected);
  });
});
