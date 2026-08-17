/**
 * Scoring matrix for the component-based deterministic score.
 *
 * Required-skill coverage used to be the whole deterministic score, so a
 * candidate whose expertise the CV parser filed under work experience rather than
 * under `technical_skills` scored a mechanical zero, and Overall Fit collapsed
 * into the twenties however strong the semantic assessment was.
 *
 * The score is now additive over distinct evidence: coverage, advantage skills,
 * named tools, relevant experience and — where the job asks for it — education.
 * The properties that matter are relative, so this file asserts ordering,
 * invariants and bounds rather than target numbers. There is deliberately no
 * assertion that any particular profile scores any particular value.
 */

import {
  DOMAIN_RELEVANCE_SATURATION,
  MAX_DOMAIN_EXPERIENCE_BONUS,
  MAX_EDUCATION_BONUS,
  MAX_TOOLS_BONUS,
  buildDeterministicMatch,
  calculateDomainExperienceBonus,
  calculateDomainRelevance,
  calculateEducationBonus,
  calculateToolsBonus,
  jobRequiresEducation,
} from "../../services/matching/matching.service";
import { enrichFromResume } from "../../services/matching/resume-adapter";
import type { ParsedResume } from "../../services/ai/parsed-resume.types";
import type { MatchAnalysis } from "../../services/matching/matching.types";
import { MICROSOFT_FULL_RECORDED_JOB_ANALYSIS } from "../fixtures/microsoft-job-full";
import { MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS } from "../fixtures/microsoft-job-partial";

interface JobShape {
  requiredSkills: string[];
  advantageSkills: string[];
  toolsMentioned?: string[];
  nonSkillRequirements?: string[];
  skillRelations?: Record<string, string[]>;
}

function resume(spec: {
  summary?: string;
  title: string;
  responsibilities?: string[];
  years: number;
  technical?: string[];
  tools?: string[];
  fieldOfStudy?: string;
}): ParsedResume {
  return {
    raw_text_hash: "fixture-hash",
    personal_info: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: spec.summary ?? null,
    work_experience: [
      {
        company_name: null,
        job_title: spec.title,
        start_date: null,
        end_date: null,
        location: null,
        responsibilities: spec.responsibilities ?? [],
        achievements: [],
      },
    ],
    education: spec.fieldOfStudy
      ? [
          {
            institution_name: null,
            degree_type: "BSc",
            field_of_study: spec.fieldOfStudy,
            start_date: null,
            end_date: null,
          },
        ]
      : [],
    skills: {
      technical_skills: spec.technical ?? [],
      soft_skills: [],
      tools_and_software: spec.tools ?? [],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: spec.years,
    },
    suggested_skills: [],
  } as unknown as ParsedResume;
}

/** Scores a resume against a job the way `calculateMatch` does. */
function score(cv: ParsedResume, job: JobShape, aiScore: number): MatchAnalysis {
  const enrichment = enrichFromResume(cv);
  return buildDeterministicMatch(
    [...cv.skills.technical_skills, ...cv.skills.tools_and_software],
    job.requiredSkills,
    job.advantageSkills,
    aiScore,
    "semantic explanation",
    undefined,
    {
      skillRelations: job.skillRelations ?? {},
      toolsMentioned: job.toolsMentioned ?? [],
      nonSkillRequirements: job.nonSkillRequirements ?? [],
      evidenceSkills: enrichment.evidenceSkills,
      experienceYears: enrichment.experienceYears,
      hasDegree: enrichment.hasDegree,
    }
  );
}

const FULL_JOB: JobShape = MICROSOFT_FULL_RECORDED_JOB_ANALYSIS;
const PARTIAL_JOB: JobShape = {
  ...MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS,
  toolsMentioned: [],
  nonSkillRequirements: [],
};

// --- candidates -------------------------------------------------------------

/** A: has the hard requirements outright. */
const SECURITY_EXPERT = resume({
  summary: "Senior security researcher.",
  title: "Senior Security Researcher",
  responsibilities: ["Detection engineering and threat hunting at scale"],
  years: 8,
  technical: [
    "security-research",
    "threat-detection",
    "incident-response",
    "windows-internals",
    "threat-hunting",
    "reverse-engineering",
    "detection-engineering",
    "python",
    "c#",
    "c++",
  ],
  tools: ["kql", "sql"],
  fieldOfStudy: "Computer Science",
});

/** B: same field, real experience, missing several hard requirements. */
const SECURITY_PRACTITIONER = resume({
  summary:
    "Cyber security analyst with five years in threat detection and security investigation.",
  title: "Cyber Security Analyst and Team Leader",
  responsibilities: [
    "Led security research for a national SOC",
    "Performed security investigation of intrusions using packet analysis",
    "Built Python tooling for log analysis",
  ],
  years: 5,
  technical: ["python", "sql", "bash", "tcp/ip networking and protocols"],
  tools: ["wireshark", "censys", "claude"],
  fieldOfStudy: "Computer Science",
});

/** D: long career, relevant degree, nothing to do with this job. */
const FRONTEND_PRACTITIONER = resume({
  summary: "Frontend engineer building design systems.",
  title: "Senior Frontend Engineer",
  responsibilities: [
    "Built React component libraries",
    "Improved web performance and accessibility",
  ],
  years: 5,
  technical: ["javascript", "react", "css"],
  tools: ["figma", "webpack"],
  fieldOfStudy: "Computer Science",
});

describe("A. strong exact match", () => {
  it("scores high and is driven by coverage rather than bonuses", () => {
    const result = score(SECURITY_EXPERT, FULL_JOB, 90);

    expect(result.algorithmicScore).toBeGreaterThanOrEqual(90);
    expect(result.finalScore).toBeGreaterThanOrEqual(80);
    expect(result.scoreComponents!.coverageScore).toBeGreaterThanOrEqual(90);
  });
});

describe("B. same-domain candidate missing some hard requirements", () => {
  const practitioner = () => score(SECURITY_PRACTITIONER, FULL_JOB, 65);
  const unrelated = () => score(FRONTEND_PRACTITIONER, FULL_JOB, 20);
  const expert = () => score(SECURITY_EXPERT, FULL_JOB, 90);

  it("lands materially above an unrelated candidate", () => {
    expect(practitioner().finalScore).toBeGreaterThan(
      unrelated().finalScore + 25
    );
  });

  it("stays below a candidate who actually has the requirements", () => {
    expect(practitioner().finalScore).toBeLessThan(expert().finalScore);
  });

  it("is not carried by a single component", () => {
    const c = practitioner().scoreComponents!;
    expect(c.coverageScore).toBeGreaterThan(0);
    expect(c.domainExperienceBonus).toBeGreaterThan(0);
    // Coverage remains the dominant term, not the bonuses.
    expect(c.coverageScore).toBeGreaterThan(
      c.advantageBonus + c.toolsBonus + c.educationBonus
    );
  });
});

describe("C. related-but-not-exact candidate", () => {
  // Networking maps to network-security in the curated taxonomy, so a network
  // engineer earns partial credit against a network-security role.
  const NETWORK_JOB: JobShape = {
    requiredSkills: ["network-security", "cybersecurity", "firewall"],
    advantageSkills: [],
  };
  const networkEngineer = resume({
    title: "Network Engineer",
    responsibilities: ["Managed enterprise networking"],
    years: 3,
    technical: ["networking", "tcp/ip"],
    tools: ["wireshark"],
  });

  it("earns partial credit without reaching exact-match territory", () => {
    const result = score(networkEngineer, NETWORK_JOB, 55);
    const c = result.scoreComponents!;

    expect(c.coverageScore).toBeGreaterThan(0);
    expect(c.coverageScore).toBeLessThan(100);
    expect(result.relatedShare).toBeGreaterThan(0);
    expect(result.matchDetails!.some((d) => d.tier === "related")).toBe(true);
  });

  it("scores below a candidate holding the same skills outright", () => {
    const exact = resume({
      title: "Security Engineer",
      years: 3,
      technical: ["network-security", "cybersecurity", "firewall"],
    });
    expect(score(networkEngineer, NETWORK_JOB, 55).finalScore).toBeLessThan(
      score(exact, NETWORK_JOB, 55).finalScore
    );
  });
});

describe("D. clearly unrelated candidate", () => {
  it("stays low against both job shapes", () => {
    expect(score(FRONTEND_PRACTITIONER, FULL_JOB, 20).finalScore).toBeLessThan(20);
    expect(score(FRONTEND_PRACTITIONER, PARTIAL_JOB, 20).finalScore).toBeLessThan(20);
  });

  it("earns nothing from five years of experience or a CS degree", () => {
    // The whole point of gating on domain relevance: seniority and a good degree
    // are worth exactly zero when there is no overlap to corroborate.
    const c = score(FRONTEND_PRACTITIONER, FULL_JOB, 20).scoreComponents!;
    expect(c.domainRelevance).toBe(0);
    expect(c.domainExperienceBonus).toBe(0);
    expect(c.educationBonus).toBe(0);
    expect(c.coverageScore).toBe(0);
  });
});

describe("E. Microsoft full-description regression", () => {
  it("keeps the practitioner's evidence visible in the score", () => {
    const result = score(SECURITY_PRACTITIONER, FULL_JOB, 65);

    expect(result.algorithmicScore).toBeGreaterThan(0);
    expect(result.matchedRequired.length).toBeGreaterThan(0);
    // python is declared outright, so it must be a full-credit match.
    const python = result.matchDetails!.find((d) => d.required === "python");
    expect(python?.tier).toBe("exact");
    expect(python?.credit).toBe(1);
  });

  it("excludes the years and degree asks from the scored denominator", () => {
    const result = score(SECURITY_PRACTITIONER, FULL_JOB, 65);
    expect(result.scorableRequiredCount).toBe(FULL_JOB.requiredSkills.length);
    for (const detail of result.matchDetails!) {
      expect(detail.required).not.toMatch(/years|bsc/i);
    }
  });
});

describe("F. Microsoft partial-description regression", () => {
  it("stays thin: only what the paragraph actually named is scored", () => {
    const result = score(SECURITY_PRACTITIONER, PARTIAL_JOB, 85);

    expect(result.scorableRequiredCount).toBeLessThanOrEqual(
      PARTIAL_JOB.requiredSkills.length
    );
    // None of the technologies that only appear in the full posting may surface.
    const scored = result.matchDetails!.map((d) => d.required).join(" ");
    for (const absent of ["windows-internals", "kerberos", "c++", "kql", "cypher"]) {
      expect(scored).not.toContain(absent);
    }
  });

  it("does not erase domain evidence just because the skill strings are narrow", () => {
    const result = score(SECURITY_PRACTITIONER, PARTIAL_JOB, 85);

    // This is the reproduced defect: deterministic 0 for a five-year security
    // professional against a security role.
    expect(result.algorithmicScore).toBeGreaterThan(0);
    expect(result.scoreComponents!.domainRelevance).toBeGreaterThan(0);
    expect(result.finalScore).toBeGreaterThan(
      score(FRONTEND_PRACTITIONER, PARTIAL_JOB, 20).finalScore + 25
    );
  });

  it("credits prose evidence at related strength, not as a declared skill", () => {
    const result = score(SECURITY_PRACTITIONER, PARTIAL_JOB, 85);
    for (const detail of result.matchDetails!) {
      if (detail.source === "experience") {
        expect(detail.tier).toBe("related");
        expect(detail.credit).toBeLessThan(1);
      }
    }
  });
});

describe("G. tool overlap", () => {
  const TOOL_JOB: JobShape = {
    requiredSkills: ["threat-detection"],
    advantageSkills: [],
    toolsMentioned: ["kql", "sql", "cypher", "claude"],
  };

  it("adds bounded credit for a genuine tool match", () => {
    const withTools = resume({
      title: "Security Analyst",
      responsibilities: ["Threat detection work"],
      years: 3,
      technical: ["sql"],
      tools: ["claude"],
    });
    const withoutTools = resume({
      title: "Security Analyst",
      responsibilities: ["Threat detection work"],
      years: 3,
      technical: [],
      tools: [],
    });

    const a = score(withTools, TOOL_JOB, 50);
    const b = score(withoutTools, TOOL_JOB, 50);

    expect(a.matchedTools!.length).toBeGreaterThan(0);
    expect(a.scoreComponents!.toolsBonus).toBeGreaterThan(0);
    expect(a.algorithmicScore).toBeGreaterThan(b.algorithmicScore);
  });

  it("cannot turn an unrelated candidate into a strong match", () => {
    // Every tool matched, no requirement matched: tools alone must stay weak.
    const toolsOnly = resume({
      title: "Data Analyst",
      years: 6,
      technical: ["sql"],
      tools: ["claude", "kql", "cypher"],
    });
    const result = score(toolsOnly, TOOL_JOB, 30);

    expect(result.scoreComponents!.coverageScore).toBe(0);
    expect(result.scoreComponents!.toolsBonus).toBeLessThanOrEqual(MAX_TOOLS_BONUS);
    expect(result.algorithmicScore).toBeLessThan(35);
  });

  it("caps the bonus however many tools overlap", () => {
    expect(calculateToolsBonus(1)).toBeLessThanOrEqual(MAX_TOOLS_BONUS);
    expect(calculateToolsBonus(50)).toBe(MAX_TOOLS_BONUS);
    expect(calculateToolsBonus(0)).toBe(0);
  });
});

describe("H. no double counting", () => {
  it("does not pay for a skill as a tool when it already satisfied a requirement", () => {
    const job: JobShape = {
      requiredSkills: ["python", "sql"],
      advantageSkills: [],
      toolsMentioned: ["python", "sql", "kql"],
    };
    const cv = resume({
      title: "Data Engineer",
      years: 4,
      technical: ["python", "sql"],
    });

    const result = score(cv, job, 60);

    // Both requirements matched, so neither may reappear as a tool match.
    expect(result.matchedTools).not.toContain("python");
    expect(result.matchedTools).not.toContain("sql");
    expect(result.scoreComponents!.toolsBonus).toBe(0);
  });

  it("does not pay for an advantage skill again as a tool", () => {
    const job: JobShape = {
      requiredSkills: ["threat-detection"],
      advantageSkills: ["claude"],
      toolsMentioned: ["claude"],
    };
    const cv = resume({ title: "Analyst", years: 2, tools: ["claude"] });

    const result = score(cv, job, 50);

    expect(result.matchedAdvantage).toContain("claude");
    expect(result.matchedTools).not.toContain("claude");
  });
});

describe("I. relevant versus irrelevant experience", () => {
  it("rewards the same number of years far more when the domain matches", () => {
    const security = score(SECURITY_PRACTITIONER, FULL_JOB, 65).scoreComponents!;
    const frontend = score(FRONTEND_PRACTITIONER, FULL_JOB, 65).scoreComponents!;

    // Identical five-year careers, identical degrees, opposite outcomes.
    expect(security.domainExperienceBonus).toBeGreaterThan(
      frontend.domainExperienceBonus
    );
    expect(frontend.domainExperienceBonus).toBe(0);
  });

  it("scales with years only once relevance is established", () => {
    expect(calculateDomainExperienceBonus(10, 0)).toBe(0);
    expect(calculateDomainExperienceBonus(0, 1)).toBe(0);
    expect(calculateDomainExperienceBonus(10, 1)).toBe(MAX_DOMAIN_EXPERIENCE_BONUS);
    expect(calculateDomainExperienceBonus(1, 1)).toBeLessThan(
      calculateDomainExperienceBonus(4, 1)
    );
  });

  it("treats relevance as a gate that saturates on a few real signals", () => {
    expect(calculateDomainRelevance(0)).toBe(0);
    expect(calculateDomainRelevance(1)).toBeGreaterThan(0);
    expect(calculateDomainRelevance(DOMAIN_RELEVANCE_SATURATION)).toBe(1);
    expect(calculateDomainRelevance(99)).toBe(1);
  });
});

describe("J. education", () => {
  it("contributes only when the job asks for a qualification", () => {
    expect(jobRequiresEducation(FULL_JOB.nonSkillRequirements!)).toBe(true);
    expect(jobRequiresEducation([])).toBe(false);
    expect(jobRequiresEducation(["Excellent communication skills"])).toBe(false);

    const withAsk = score(SECURITY_PRACTITIONER, FULL_JOB, 65).scoreComponents!;
    const withoutAsk = score(
      SECURITY_PRACTITIONER,
      { ...FULL_JOB, nonSkillRequirements: [] },
      65
    ).scoreComponents!;

    expect(withAsk.educationBonus).toBeGreaterThan(0);
    expect(withoutAsk.educationBonus).toBe(0);
  });

  it("never rescues an unrelated candidate", () => {
    expect(calculateEducationBonus(true, true, 0)).toBe(0);
    expect(calculateEducationBonus(false, true, 1)).toBe(0);
    expect(calculateEducationBonus(true, false, 1)).toBe(0);
    expect(calculateEducationBonus(true, true, 1)).toBe(MAX_EDUCATION_BONUS);
  });

  it("stays a small corroborating term", () => {
    const c = score(SECURITY_PRACTITIONER, FULL_JOB, 65).scoreComponents!;
    expect(c.educationBonus).toBeLessThanOrEqual(MAX_EDUCATION_BONUS);
    expect(c.educationBonus).toBeLessThan(c.coverageScore);
  });
});

describe("ordering invariant across the matrix", () => {
  it("ranks exact above same-domain above unrelated", () => {
    const a = score(SECURITY_EXPERT, FULL_JOB, 90).finalScore;
    const b = score(SECURITY_PRACTITIONER, FULL_JOB, 65).finalScore;
    const d = score(FRONTEND_PRACTITIONER, FULL_JOB, 20).finalScore;

    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(d);
  });

  it("keeps every score inside 0-100", () => {
    for (const cv of [SECURITY_EXPERT, SECURITY_PRACTITIONER, FRONTEND_PRACTITIONER]) {
      for (const job of [FULL_JOB, PARTIAL_JOB]) {
        for (const ai of [0, 50, 100]) {
          const result = score(cv, job, ai);
          expect(result.finalScore).toBeGreaterThanOrEqual(0);
          expect(result.finalScore).toBeLessThanOrEqual(100);
          expect(result.algorithmicScore).toBeGreaterThanOrEqual(0);
          expect(result.algorithmicScore).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("is deterministic", () => {
    const first = JSON.stringify(score(SECURITY_PRACTITIONER, FULL_JOB, 65));
    for (let i = 0; i < 20; i += 1) {
      expect(JSON.stringify(score(SECURITY_PRACTITIONER, FULL_JOB, 65))).toBe(first);
    }
  });
});
