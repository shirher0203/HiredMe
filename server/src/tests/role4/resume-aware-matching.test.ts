/**
 * Tests for the resume-aware matching enrichment.
 *
 * Covers the deterministic adapter (resume-adapter.ts) and the
 * calculateMatch extension that threads ParsedResume through to the
 * AI semantic prompt and into the returned MatchAnalysis.
 *
 * All tests either run with USE_MOCK_AI=true or mock `callAi` via
 * jest.mock so no real network I/O is ever attempted.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
  createAiDeadline: jest.fn(() => Date.now() + 45_000),
  getActiveModelName: jest.fn(() => "gemini-test-model"),
  isApiKeyConfigured: jest.fn(() => true),
}));

import { callAi } from "../../services/ai/ai.client";
import { calculateMatch } from "../../services/ai/ai.service";
import {
  enrichFromResume,
  mergeProfileSkillsWithResume,
} from "../../services/matching/resume-adapter";
import { mockParsedResume } from "../../services/ai/mock-ai.responses";
import type { ParsedResume } from "../../services/ai/parsed-resume.types";
import type {
  JobAnalysis,
  ProfileInput,
} from "../../services/matching/matching.types";

const mockedCallAi = callAi as unknown as jest.Mock;

function makeResume(overrides: Partial<ParsedResume> = {}): ParsedResume {
  const base: ParsedResume = JSON.parse(JSON.stringify(mockParsedResume));
  return { ...base, ...overrides };
}

const BASE_PROFILE: ProfileInput = {
  skills: ["react", "typescript"],
  experienceYears: 1,
  projects: ["HiredMe"],
};

const BASE_JOB: JobAnalysis = {
  roleTitle: "Junior Full-Stack Developer",
  requiredSkills: ["react", "node", "mongodb", "typescript"],
  advantageSkills: ["docker", "aws"],
  seniorityLevel: "junior",
  summary: "Junior full-stack role.",
};

beforeEach(() => {
  mockedCallAi.mockReset();
});

describe("enrichFromResume", () => {
  it("merges technical_skills, tools_and_software and project technologies, normalized", () => {
    const resume = makeResume({
      skills: {
        technical_skills: ["React.js", "Node"],
        soft_skills: ["communication"],
        tools_and_software: ["Docker", "Git"],
      },
      projects: [
        {
          project_name: "HiredMe",
          description: "AI platform.",
          technologies_used: ["reactjs", "typescript", "MongoDB"],
          link: null,
        },
      ],
    });

    const e = enrichFromResume(resume);

    expect(e.enrichedSkills).toEqual(
      expect.arrayContaining(["react", "node", "docker", "git", "typescript", "mongodb"])
    );
    expect(new Set(e.enrichedSkills).size).toBe(e.enrichedSkills.length);
    expect(e.enrichedSkills).not.toContain("React.js");
    expect(e.enrichedSkills).not.toContain("reactjs");
  });

  it("exposes projectTechnologies normalized", () => {
    const resume = makeResume({
      projects: [
        {
          project_name: "A",
          description: null,
          technologies_used: ["React.js", "Node.js"],
          link: null,
        },
        {
          project_name: "B",
          description: null,
          technologies_used: ["react", "MongoDB"],
          link: null,
        },
      ],
    });

    const e = enrichFromResume(resume);
    expect(e.projectTechnologies).toEqual(["react", "node", "mongodb"]);
  });

  it("derives experienceYears from parsed_metadata and floors invalid values to 0", () => {
    expect(
      enrichFromResume(
        makeResume({
          parsed_metadata: {
            language_detected: "en",
            years_of_experience_estimate: 5,
          },
        })
      ).experienceYears
    ).toBe(5);

    expect(
      enrichFromResume(
        makeResume({
          parsed_metadata: {
            language_detected: "en",
            years_of_experience_estimate: -3,
          },
        })
      ).experienceYears
    ).toBe(0);

    expect(
      enrichFromResume(
        makeResume({
          parsed_metadata: {
            language_detected: "en",
            years_of_experience_estimate: Number.NaN as unknown as number,
          },
        })
      ).experienceYears
    ).toBe(0);
  });

  it("builds summary strings without crashing on missing fields", () => {
    const resume = makeResume({
      work_experience: [],
      education: [],
      projects: [],
      languages: [],
    });

    const e = enrichFromResume(resume);
    expect(e.workExperienceSummary).toBe("");
    expect(e.educationSummary).toBe("");
    expect(e.topProjectsSummary).toBe("");
    expect(e.languagesSummary).toBe("");
    expect(e.enrichedSkills).toEqual(
      expect.arrayContaining(
        mockParsedResume.skills.technical_skills.concat(
          mockParsedResume.skills.tools_and_software
        )
      )
    );
  });

  it("summaries are single-line safe (no embedded newlines)", () => {
    const e = enrichFromResume(mockParsedResume);
    expect(e.workExperienceSummary.includes("\n")).toBe(false);
    expect(e.educationSummary.includes("\n")).toBe(false);
    expect(e.topProjectsSummary.includes("\n")).toBe(false);
    expect(e.languagesSummary.includes("\n")).toBe(false);
  });
});

describe("mergeProfileSkillsWithResume", () => {
  it("preserves profile order and appends resume-only skills", () => {
    const enrichment = enrichFromResume(
      makeResume({
        skills: {
          technical_skills: ["docker", "mongodb"],
          soft_skills: [],
          tools_and_software: [],
        },
        projects: [],
      })
    );
    const out = mergeProfileSkillsWithResume(["React.js", "node"], enrichment);
    expect(out[0]).toBe("react");
    expect(out[1]).toBe("node");
    expect(out).toEqual(expect.arrayContaining(["docker", "mongodb"]));
    expect(new Set(out).size).toBe(out.length);
  });

  it("tolerates missing profile or missing enrichment", () => {
    const enrichment = enrichFromResume(mockParsedResume);
    const onlyProfile = mergeProfileSkillsWithResume(["React"], undefined);
    const onlyResume = mergeProfileSkillsWithResume(undefined, enrichment);
    const neither = mergeProfileSkillsWithResume(undefined, undefined);

    expect(onlyProfile).toEqual(["react"]);
    expect(onlyResume.length).toBeGreaterThan(0);
    expect(neither).toEqual([]);
  });
});

describe("calculateMatch — backwards compatibility (no resume)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_AI = "true";
  });
  afterAll(() => {
    delete process.env.USE_MOCK_AI;
  });

  it("returns the legacy shape with no extra fit fields", async () => {
    const result = await calculateMatch(BASE_PROFILE, BASE_JOB);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.educationFit).toBeUndefined();
    expect(result.experienceFit).toBeUndefined();
    expect(result.projectFit).toBeUndefined();
    expect(result.resumeInsights).toBeUndefined();
    expect(mockedCallAi).not.toHaveBeenCalled();
  });
});

describe("calculateMatch — resume-aware (mock mode)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_AI = "true";
  });
  afterAll(() => {
    delete process.env.USE_MOCK_AI;
  });

  it("enriches skills from resume and produces the fit fields", async () => {
    const resume = makeResume();
    const result = await calculateMatch(BASE_PROFILE, BASE_JOB, resume);

    expect(result.educationFit).toBeDefined();
    expect(result.experienceFit).toBeDefined();
    expect(result.projectFit).toBeDefined();
    expect(Array.isArray(result.resumeInsights)).toBe(true);
    expect(Array.isArray(result.matchingEvidence)).toBe(true);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("resume-added skills can change the algorithmic score", async () => {
    const thinProfile: ProfileInput = {
      skills: ["react"],
      experienceYears: 0,
      projects: [],
    };

    const bare = await calculateMatch(thinProfile, BASE_JOB);
    const enriched = await calculateMatch(thinProfile, BASE_JOB, mockParsedResume);

    expect(enriched.algorithmicScore).toBeGreaterThan(bare.algorithmicScore);
    expect(enriched.matchedRequired).toEqual(
      expect.arrayContaining(["node", "mongodb", "typescript"])
    );
  });

  it("tolerates a resume with empty sections", async () => {
    const empty = makeResume({
      work_experience: [],
      education: [],
      projects: [],
      languages: [],
      skills: {
        technical_skills: [],
        soft_skills: [],
        tools_and_software: [],
      },
      parsed_metadata: { language_detected: null, years_of_experience_estimate: 0 },
    });

    const result = await calculateMatch(BASE_PROFILE, BASE_JOB, empty);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.educationFit).toBeDefined();
  });
});

describe("calculateMatch — resume-aware (real-mode wiring)", () => {
  const originalEnv = process.env.USE_MOCK_AI;
  beforeAll(() => {
    delete process.env.USE_MOCK_AI;
  });
  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.USE_MOCK_AI = originalEnv;
    }
  });

  it("parses optional fit fields from the AI response", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        aiSemanticScore: 80,
        explanation: "Solid end-to-end coverage of the required stack.",
        educationFit: "BSc CS aligns with the junior target.",
        experienceFit: "1 year matches the 0-2 years window.",
        projectFit: "HiredMe project uses every required technology.",
        languageFit: "English fluency covers the team's working language.",
        resumeInsights: ["Projects compensate for short formal work history."],
        matchingEvidence: ["HiredMe uses React + Node + MongoDB + TypeScript."],
      })
    );

    const result = await calculateMatch(BASE_PROFILE, BASE_JOB, mockParsedResume);

    expect(mockedCallAi).toHaveBeenCalledTimes(1);
    expect(result.aiSemanticScore).toBe(80);
    expect(result.educationFit).toBe("BSc CS aligns with the junior target.");
    expect(result.experienceFit).toBe("1 year matches the 0-2 years window.");
    expect(result.projectFit).toBe("HiredMe project uses every required technology.");
    expect(result.languageFit).toBe("English fluency covers the team's working language.");
    expect(result.resumeInsights).toEqual([
      "Projects compensate for short formal work history.",
    ]);
    expect(result.matchingEvidence).toEqual([
      "HiredMe uses React + Node + MongoDB + TypeScript.",
    ]);
  });

  it("null or missing optional fit fields are omitted, not set to null", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        aiSemanticScore: 55,
        explanation: "Partial coverage.",
        educationFit: null,
        experienceFit: "   ",
        resumeInsights: [],
      })
    );

    const result = await calculateMatch(BASE_PROFILE, BASE_JOB, mockParsedResume);
    expect(result.educationFit).toBeUndefined();
    expect(result.experienceFit).toBeUndefined();
    expect(result.projectFit).toBeUndefined();
    expect(result.resumeInsights).toBeUndefined();
  });

  it("retries once when the first response is missing aiSemanticScore", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({ explanation: "missing score" })
    );
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        aiSemanticScore: 60,
        explanation: "Second attempt is valid.",
      })
    );

    const result = await calculateMatch(BASE_PROFILE, BASE_JOB, mockParsedResume);
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
    expect(result.aiSemanticScore).toBe(60);
  });

  it("legacy path without resume still uses buildSemanticMatchPrompt shape", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        aiSemanticScore: 65,
        explanation: "Reasonable coverage of core skills.",
      })
    );

    const result = await calculateMatch(BASE_PROFILE, BASE_JOB);
    expect(mockedCallAi).toHaveBeenCalledTimes(1);
    expect(result.aiSemanticScore).toBe(65);
    expect(result.educationFit).toBeUndefined();
  });

  it("uses deterministic scoring — final score is not just the AI score", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        aiSemanticScore: 100,
        explanation: "Claims perfect semantic match.",
      })
    );

    const thinProfile: ProfileInput = {
      skills: [],
      experienceYears: 0,
      projects: [],
    };

    const result = await calculateMatch(thinProfile, BASE_JOB);

    expect(result.aiSemanticScore).toBe(100);
    expect(result.algorithmicScore).toBe(0);
    expect(result.finalScore).toBe(30);
  });
});
