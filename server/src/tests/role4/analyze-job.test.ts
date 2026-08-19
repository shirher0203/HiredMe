/**
 * Job-analysis extraction and canonicalization.
 *
 * Runs the real validator against raw model output with the AI client mocked,
 * so there is no network here. Two of the responses were recorded against real
 * Gemini for the committed Microsoft fixtures, which is what makes the recall
 * and restraint assertions meaningful rather than self-fulfilling.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
  createAiDeadline: jest.fn(() => Date.now() + 45_000),
  getActiveModelName: jest.fn(() => "gemini-test-model"),
  isApiKeyConfigured: jest.fn(() => true),
}));

import { callAi } from "../../services/ai/ai.client";
import { analyzeJob } from "../../services/ai/ai.service";
import {
  MICROSOFT_FULL_NON_SKILL_PHRASES,
  MICROSOFT_FULL_RECORDED_RAW_RESPONSE,
} from "../fixtures/microsoft-job-full";
import { MICROSOFT_PARTIAL_RECORDED_RAW_RESPONSE } from "../fixtures/microsoft-job-partial";

const mockedCallAi = callAi as unknown as jest.Mock;

const BASE_RESPONSE = {
  roleTitle: "Backend Engineer",
  requiredSkills: ["node"],
  advantageSkills: [],
  seniorityLevel: "mid",
  summary: "A backend role.",
};

function respond(overrides: Record<string, unknown> = {}): void {
  mockedCallAi.mockResolvedValueOnce(
    JSON.stringify({ ...BASE_RESPONSE, ...overrides })
  );
}

const ORIGINAL_MOCK_FLAG = process.env.USE_MOCK_AI;

beforeEach(() => {
  mockedCallAi.mockReset();
  delete process.env.USE_MOCK_AI;
});

afterAll(() => {
  if (ORIGINAL_MOCK_FLAG === undefined) delete process.env.USE_MOCK_AI;
  else process.env.USE_MOCK_AI = ORIGINAL_MOCK_FLAG;
});

describe("validateJobAnalysis — canonicalization", () => {
  it("canonicalizes title-case security phrases the old validator stored raw", async () => {
    respond({
      requiredSkills: [
        "Identity Threat Detection and Response",
        "Cybersecurity",
        "Threat Detection",
        "Security Investigation",
      ],
    });

    const analysis = await analyzeJob("some description");

    expect(analysis.requiredSkills).toEqual([
      "identity-threat-detection-and-response",
      "cybersecurity",
      "threat-detection",
      "security-investigation",
    ]);
  });

  it("splits compound entries into separate skills", async () => {
    respond({ requiredSkills: ["AWS/GCP", "React or Vue", "HTML/CSS"] });

    const analysis = await analyzeJob("some description");

    expect(analysis.requiredSkills).toEqual([
      "aws",
      "google-cloud-platform",
      "react or vue",
      "html",
      "css",
    ]);
  });

  it("strips descriptive filler from skill entries", async () => {
    respond({ requiredSkills: ["aws cloud environments", "cyber attack knowledge"] });

    const analysis = await analyzeJob("some description");

    expect(analysis.requiredSkills).toEqual(["aws", "cyber-attack"]);
  });

  it("deduplicates after canonicalization", async () => {
    respond({ requiredSkills: ["React.js", "react", "REACT"] });

    const analysis = await analyzeJob("some description");

    expect(analysis.requiredSkills).toEqual(["react"]);
  });

  it("canonicalizes advantage skills, tools and implied skills too", async () => {
    respond({
      advantageSkills: ["Cyber Security"],
      toolsMentioned: ["Wire Shark"],
      impliedSkills: ["TCP/IP"],
    });

    const analysis = await analyzeJob("some description");

    expect(analysis.advantageSkills).toEqual(["cybersecurity"]);
    expect(analysis.toolsMentioned).toEqual(["wireshark"]);
    expect(analysis.impliedSkills).toEqual(["tcp-ip"]);
  });

  it("keeps nonSkillRequirements as readable prose", async () => {
    respond({
      nonSkillRequirements: [
        "5+ years of experience",
        "BSc in Computer Science",
        "Team player",
      ],
    });

    const analysis = await analyzeJob("some description");

    expect(analysis.nonSkillRequirements).toEqual([
      "5+ years of experience",
      "BSc in Computer Science",
      "Team player",
    ]);
  });
});

describe("validateJobAnalysis — skillRelations", () => {
  it("canonicalizes both keys and values", async () => {
    respond({
      requiredSkills: ["Cybersecurity"],
      skillRelations: { Cybersecurity: ["Cyber Attack", "Threat Detection"] },
    });

    const analysis = await analyzeJob("some description");

    expect(analysis.skillRelations).toEqual({
      cybersecurity: ["cyber-attack", "threat-detection"],
    });
  });

  it("drops a self-referential relation", async () => {
    respond({ skillRelations: { node: ["node"] } });

    const analysis = await analyzeJob("some description");

    expect(analysis.skillRelations).toEqual({});
  });

  it("defaults to an empty map when the model omits it", async () => {
    respond();

    const analysis = await analyzeJob("some description");

    expect(analysis.skillRelations).toBeUndefined();
  });

  it("rejects a non-array relation list", async () => {
    mockedCallAi.mockResolvedValue(
      JSON.stringify({ ...BASE_RESPONSE, skillRelations: { node: "express" } })
    );

    await expect(analyzeJob("some description")).rejects.toThrow(
      /analyzeJob: retry failed/
    );
  });

  it("rejects a non-object skillRelations", async () => {
    mockedCallAi.mockResolvedValue(
      JSON.stringify({ ...BASE_RESPONSE, skillRelations: ["node"] })
    );

    await expect(analyzeJob("some description")).rejects.toThrow(
      /analyzeJob: retry failed/
    );
  });
});

describe("validateJobAnalysis — strictness", () => {
  it("rejects an unknown top-level key", async () => {
    mockedCallAi.mockResolvedValue(
      JSON.stringify({ ...BASE_RESPONSE, salaryRange: "competitive" })
    );

    await expect(analyzeJob("some description")).rejects.toThrow(
      /analyzeJob: retry failed/
    );
  });

  it("still requires the original five fields", async () => {
    for (const missing of [
      "roleTitle",
      "requiredSkills",
      "advantageSkills",
      "seniorityLevel",
      "summary",
    ]) {
      mockedCallAi.mockReset();
      const partial: Record<string, unknown> = { ...BASE_RESPONSE };
      delete partial[missing];
      mockedCallAi.mockResolvedValue(JSON.stringify(partial));

      await expect(analyzeJob("some description")).rejects.toThrow(
        /analyzeJob: retry failed/
      );
    }
  });

  it("leaves the new arrays absent rather than empty when not returned", async () => {
    respond();

    const analysis = await analyzeJob("some description");

    expect(analysis.toolsMentioned).toBeUndefined();
    expect(analysis.impliedSkills).toBeUndefined();
    expect(analysis.nonSkillRequirements).toBeUndefined();
  });
});

describe("Scenario B — full posting recall", () => {
  async function analyzeFullPosting() {
    mockedCallAi.mockResolvedValueOnce(MICROSOFT_FULL_RECORDED_RAW_RESPONSE);
    return analyzeJob("full posting");
  }

  it("captures the programming and query languages the posting names", async () => {
    const analysis = await analyzeFullPosting();
    const everywhere = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
      ...(analysis.impliedSkills ?? []),
    ];

    for (const skill of ["python", "sql", "kql", "cypher", "c#", "c++"]) {
      expect(everywhere).toContain(skill);
    }
  });

  it("captures the identity and authentication protocols", async () => {
    const analysis = await analyzeFullPosting();
    const everywhere = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
    ];

    for (const skill of ["kerberos", "ntlm", "ldap", "oauth2", "saml"]) {
      expect(everywhere).toContain(skill);
    }
    expect(analysis.requiredSkills).toContain("windows-internals");
  });

  it("captures at least one AI tooling concept", async () => {
    const analysis = await analyzeFullPosting();
    const everywhere = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
      ...(analysis.impliedSkills ?? []),
    ];

    const aiConcepts = [
      "github-copilot",
      "security-copilot",
      "gpt",
      "claude",
      "large-language-models",
      "llm",
      "generative-ai",
      "prompt-engineering",
    ];
    expect(aiConcepts.filter((concept) => everywhere.includes(concept)).length)
      .toBeGreaterThan(0);
  });

  it("keeps years, degrees and soft requirements out of every skill array", async () => {
    const analysis = await analyzeFullPosting();
    const skillArrays = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
      ...(analysis.impliedSkills ?? []),
    ].join(" ");

    for (const noise of ["5+ years", "bsc", "degree", "team player", "communication"]) {
      expect(skillArrays).not.toContain(noise);
    }

    const nonSkill = (analysis.nonSkillRequirements ?? []).join(" ").toLowerCase();
    for (const phrase of MICROSOFT_FULL_NON_SKILL_PHRASES.slice(0, 4)) {
      expect(nonSkill).toContain(phrase);
    }
  });

  it("keeps requiredSkills focused rather than dumping every phrase", async () => {
    const analysis = await analyzeFullPosting();

    expect(analysis.requiredSkills.length).toBeLessThanOrEqual(15);
    // Materially richer than the four skills the partial paragraph produced.
    expect(analysis.requiredSkills.length).toBeGreaterThanOrEqual(8);
  });

  it("asserts relations for the skills it extracted", async () => {
    const analysis = await analyzeFullPosting();
    const relations = analysis.skillRelations ?? {};

    expect(Object.keys(relations).length).toBeGreaterThanOrEqual(8);
    for (const [skill, related] of Object.entries(relations)) {
      expect(related.length).toBeGreaterThan(0);
      expect(related).not.toContain(skill);
    }
  });

  it("emits every skill in canonical form", async () => {
    const analysis = await analyzeFullPosting();
    const everywhere = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
      ...(analysis.impliedSkills ?? []),
    ];

    for (const skill of everywhere) {
      expect(skill).toBe(skill.toLowerCase());
      expect(skill).not.toMatch(/\s/);
      expect(skill).not.toMatch(/[/,]/);
    }
  });
});

describe("Scenario A — partial posting restraint", () => {
  async function analyzePartialPosting() {
    mockedCallAi.mockResolvedValueOnce(MICROSOFT_PARTIAL_RECORDED_RAW_RESPONSE);
    return analyzeJob("partial paragraph");
  }

  it("does not invent technologies the paragraph never mentions", async () => {
    const analysis = await analyzePartialPosting();
    const everywhere = [
      ...analysis.requiredSkills,
      ...analysis.advantageSkills,
      ...(analysis.toolsMentioned ?? []),
      ...(analysis.impliedSkills ?? []),
    ];

    // The anti-hallucination guard. These are absent from the input, so their
    // absence from the output is correct behaviour, not an extraction failure.
    for (const absent of [
      "python",
      "sql",
      "kql",
      "windows-internals",
      "kerberos",
      "ntlm",
      "ldap",
      "c#",
      "c++",
    ]) {
      expect(everywhere).not.toContain(absent);
    }
  });

  it("stays thin, matching its thin input", async () => {
    const analysis = await analyzePartialPosting();

    expect(analysis.requiredSkills.length).toBeLessThanOrEqual(6);
    expect(analysis.toolsMentioned ?? []).toEqual([]);
    expect(analysis.nonSkillRequirements ?? []).toEqual([]);
  });

  it("still produces canonical security skills with relations", async () => {
    const analysis = await analyzePartialPosting();

    expect(analysis.requiredSkills).toContain("threat-detection");
    expect(Object.keys(analysis.skillRelations ?? {}).length).toBeGreaterThan(0);
  });
});
