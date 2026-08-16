/**
 * Six-fixture regression for graded match scoring.
 *
 * The point of the set is that fixing the zero-overlap defect must not make the
 * matcher permissive. A related-only profile has to score meaningfully above
 * zero and meaningfully below an exact match, an unrelated profile has to stay
 * at zero, and the existing full-stack fixture has to be unaffected — otherwise
 * the architecture is really just special-casing one security role.
 */

import {
  MATCH_WEIGHTS,
  MAX_ADVANTAGE_BONUS,
  RELATED_CREDIT_CAP_RATIO,
  buildDeterministicMatch,
  calculateAdvantageBonus,
  calculateFinalMatchScore,
  computeSkillCoverage,
  isScorableSkill,
} from "../../services/matching/matching.service";
import type { MatchAnalysis } from "../../services/matching/matching.types";
import { MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS as PARTIAL_ANALYSIS } from "../fixtures/microsoft-job-partial";
import {
  FRONTEND_CANDIDATE_SKILLS,
  SECURITY_CANDIDATE_SKILLS,
  SECURITY_EXPERT_SKILLS,
} from "../fixtures/security-candidate-profile";

const AI_SCORE = 65;

/** Scenario B: the richer skill set the full posting yields. */
const FULL_POSTING_REQUIRED = [
  "security-research",
  "threat-hunting",
  "detection-engineering",
  "windows-internals",
  "python",
  "c#",
  "incident-response",
  "sql",
];

const FULL_POSTING_ADVANTAGE = ["cloud-forensics", "kql"];

const FULL_POSTING_RELATIONS: Record<string, string[]> = {
  "security-research": ["threat-hunting", "security-investigation", "cyber-attack"],
  "threat-hunting": ["threat-detection", "security-investigation", "cyber-attack"],
  "detection-engineering": ["threat-detection", "siem", "kql"],
  "windows-internals": ["active-directory", "operating-systems"],
  python: ["pandas", "scripting"],
  "incident-response": ["security-investigation", "forensics", "cyber-attack"],
  sql: ["mysql", "oracle", "kql"],
  "cloud-forensics": ["forensics", "aws"],
  kql: ["sql", "siem"],
};

function match(
  profileSkills: readonly string[],
  requiredSkills: string[],
  advantageSkills: string[] = [],
  skillRelations: Record<string, string[]> = {}
): MatchAnalysis {
  return buildDeterministicMatch(
    [...profileSkills],
    requiredSkills,
    advantageSkills,
    AI_SCORE,
    "regression fixture",
    undefined,
    { skillRelations }
  );
}

// Fixture F, taken from the existing suite rather than invented here.
const JUNIOR_FULLSTACK_PROFILE = ["React.js", "Node", "TypeScript"];
const JUNIOR_FULLSTACK_REQUIRED = ["react", "mongodb", "node"];
const JUNIOR_FULLSTACK_ADVANTAGE = ["docker", "typescript"];

describe("Fixture A — Microsoft partial description", () => {
  const result = match(
    SECURITY_CANDIDATE_SKILLS,
    PARTIAL_ANALYSIS.requiredSkills,
    PARTIAL_ANALYSIS.advantageSkills
  );

  it("no longer yields zero overlap", () => {
    expect(result.algorithmicScore).toBeGreaterThan(0);
    expect(result.matchedRequired).not.toEqual([]);
  });

  it("awards at least two related tiers naming cyber-attack", () => {
    const related = (result.matchDetails ?? []).filter((d) => d.tier === "related");

    expect(related.length).toBeGreaterThanOrEqual(2);
    expect(related.map((d) => d.matchedBy)).toContain("cyber-attack");
  });

  it("reaches a defensible band with a moderate semantic score", () => {
    expect(result.finalScore).toBeGreaterThanOrEqual(40);
  });

  it("earns all of its credit from related matches, and reports that honestly", () => {
    expect(result.relatedShare).toBe(1);
    expect((result.matchDetails ?? []).some((d) => d.tier === "exact")).toBe(false);
  });
});

describe("Fixture B — Microsoft full description", () => {
  const result = match(
    SECURITY_CANDIDATE_SKILLS,
    FULL_POSTING_REQUIRED,
    FULL_POSTING_ADVANTAGE,
    FULL_POSTING_RELATIONS
  );
  const partial = match(
    SECURITY_CANDIDATE_SKILLS,
    PARTIAL_ANALYSIS.requiredSkills,
    PARTIAL_ANALYSIS.advantageSkills
  );

  it("credits the genuine exact overlaps the full posting exposes", () => {
    const byRequired = new Map((result.matchDetails ?? []).map((d) => [d.required, d]));

    expect(byRequired.get("python")?.tier).toBe("exact");
    expect(byRequired.get("sql")?.tier).toBe("exact");
  });

  it("credits related security experience as well", () => {
    const related = (result.matchDetails ?? []).filter((d) => d.tier === "related");

    expect(related.length).toBeGreaterThanOrEqual(2);
  });

  it("scores clearly above the partial description for the same candidate", () => {
    // Same profile, same role: the difference is purely how much of the posting
    // the model was given.
    expect(result.algorithmicScore).toBeGreaterThan(partial.algorithmicScore);
    expect(result.finalScore).toBeGreaterThan(partial.finalScore);
  });

  it("mixes exact and related credit rather than relying on weak links alone", () => {
    expect(result.relatedShare).toBeGreaterThan(0);
    expect(result.relatedShare).toBeLessThan(1);
  });

  it("does not claim skills the candidate lacks", () => {
    const byRequired = new Map((result.matchDetails ?? []).map((d) => [d.required, d]));

    expect(byRequired.get("c#")?.tier).toBe("none");
    expect(byRequired.get("windows-internals")?.tier).toBe("none");
  });
});

describe("Fixture C — strong exact-match profile", () => {
  const expert = match(
    SECURITY_EXPERT_SKILLS,
    PARTIAL_ANALYSIS.requiredSkills,
    PARTIAL_ANALYSIS.advantageSkills
  );
  const relatedOnly = match(
    SECURITY_CANDIDATE_SKILLS,
    PARTIAL_ANALYSIS.requiredSkills,
    PARTIAL_ANALYSIS.advantageSkills
  );

  it("scores clearly higher than the related-only profile", () => {
    expect(expert.algorithmicScore).toBeGreaterThan(relatedOnly.algorithmicScore);
    // A comfortable margin, not a rounding difference.
    expect(expert.finalScore - relatedOnly.finalScore).toBeGreaterThanOrEqual(15);
  });

  it("earns its credit at full strength, not from related links", () => {
    const tiers = (expert.matchDetails ?? []).map((d) => d.tier);

    // The job writes "Threat Detection" where the profile writes
    // "threat-detection", so full-credit matches split between exact and alias.
    // Both are worth 1.0; what matters is that none of this is partial credit.
    const fullCredit = tiers.filter((tier) => tier === "exact" || tier === "alias");
    expect(fullCredit.length).toBeGreaterThanOrEqual(3);
    expect(tiers).toContain("exact");
    expect(expert.relatedShare).toBe(0);
  });

  it("can reach full coverage when it holds every requirement", () => {
    const complete = match(
      ["cybersecurity", "threat-detection", "security-investigation", "identity-threat-detection-and-response"],
      PARTIAL_ANALYSIS.requiredSkills
    );

    expect(complete.algorithmicScore).toBe(100);
    expect(complete.relatedShare).toBe(0);
  });
});

describe("Fixture D — clearly unrelated profile", () => {
  const result = match(FRONTEND_CANDIDATE_SKILLS, [
    "c",
    "embedded-systems",
    "rtos",
    "firmware",
  ]);

  it("stays at zero", () => {
    expect(result.algorithmicScore).toBe(0);
    expect(result.matchedRequired).toEqual([]);
  });

  it("marks every requirement as unmatched with nothing named", () => {
    for (const detail of result.matchDetails ?? []) {
      expect(detail.tier).toBe("none");
      expect(detail.matchedBy).toBeNull();
      expect(detail.credit).toBe(0);
    }
  });

  it("cannot be lifted past the documented ceiling by the semantic score", () => {
    expect(result.finalScore).toBeLessThanOrEqual(
      Math.round(MATCH_WEIGHTS.ai * 100)
    );
  });

  it("does not relate a frontend profile to a security role either", () => {
    const security = match(
      FRONTEND_CANDIDATE_SKILLS,
      PARTIAL_ANALYSIS.requiredSkills
    );

    expect(security.algorithmicScore).toBe(0);
  });
});

describe("Fixture E — related but not exact", () => {
  it("awards partial credit without inflating it", () => {
    const result = match(["cyber-attack"], [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
      "identity-threat-detection-and-response",
    ]);

    // Three of four requirements matched at half credit each: 1.5 / 4 = 37.5.
    expect(result.algorithmicScore).toBe(38);
    expect(result.relatedShare).toBe(1);
  });

  it("holds the related-credit cap even when every requirement is related", () => {
    const result = computeSkillCoverage(
      ["cyber-attack"],
      ["cybersecurity", "threat-detection", "security-investigation"]
    );

    const relatedCredit = result.matchDetails
      .filter((d) => d.tier === "related")
      .reduce((sum, d) => sum + d.credit, 0);

    expect(relatedCredit).toBeLessThanOrEqual(
      RELATED_CREDIT_CAP_RATIO * result.scorableRequiredCount
    );
    // A profile matching only through related links can never present as a
    // full match.
    expect(result.coverage).toBeLessThanOrEqual(RELATED_CREDIT_CAP_RATIO);
  });

  it("keeps a related-only match below a half-exact match", () => {
    const relatedOnly = match(["cyber-attack"], [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
      "identity-threat-detection-and-response",
    ]);
    const halfExact = match(["cybersecurity", "threat-detection"], [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
      "identity-threat-detection-and-response",
    ]);

    expect(halfExact.algorithmicScore).toBeGreaterThan(relatedOnly.algorithmicScore);
  });
});

describe("Fixture F — existing junior full-stack fixture", () => {
  const result = match(
    JUNIOR_FULLSTACK_PROFILE,
    JUNIOR_FULLSTACK_REQUIRED,
    JUNIOR_FULLSTACK_ADVANTAGE
  );

  it("does not regress on the pre-existing scenario", () => {
    expect(result.matchedRequired).toEqual(["react", "node"]);
    expect(result.missingRequired).toEqual(["mongodb"]);
    expect(result.matchedAdvantage).toEqual(["typescript"]);
  });

  it("scores coverage plus the advantage bonus", () => {
    // 2 of 3 required (66.67) plus 1 of 2 advantage (5) = 72.
    expect(result.algorithmicScore).toBe(72);
    expect(result.advantageBonus).toBe(5);
    expect(result.relatedShare).toBe(0);
  });

  it("resolves aliases as full credit, not partial", () => {
    const byRequired = new Map((result.matchDetails ?? []).map((d) => [d.required, d]));

    expect(byRequired.get("react")?.tier).toBe("alias");
    expect(byRequired.get("react")?.credit).toBe(1);
  });
});

describe("isScorableSkill", () => {
  it("accepts real skills", () => {
    for (const skill of ["react", "cybersecurity", "tcp-ip", "windows-internals", "c#"]) {
      expect(isScorableSkill(skill)).toBe(true);
    }
  });

  it("rejects experience requirements", () => {
    for (const skill of [
      "5+ years of experience",
      "3 years experience",
      "10+ years",
      "2+ years of relevant experience",
    ]) {
      expect(isScorableSkill(skill)).toBe(false);
    }
  });

  it("rejects education requirements", () => {
    for (const skill of [
      "BSc in Computer Science",
      "MSc",
      "PhD in a relevant field",
      "Bachelor's degree",
      "relevant degree",
    ]) {
      expect(isScorableSkill(skill)).toBe(false);
    }
  });

  it("rejects soft requirements", () => {
    for (const skill of [
      "team player",
      "excellent communication skills",
      "self-motivated",
      "attention to detail",
      "problem solving",
      "leadership",
    ]) {
      expect(isScorableSkill(skill)).toBe(false);
    }
  });

  it("rejects empty input", () => {
    expect(isScorableSkill("")).toBe(false);
    expect(isScorableSkill("   ")).toBe(false);
  });
});

describe("advantage bonus", () => {
  it("is zero with no advantage skills or no matches", () => {
    expect(calculateAdvantageBonus(0, 0)).toBe(0);
    expect(calculateAdvantageBonus(0, 4)).toBe(0);
    expect(calculateAdvantageBonus(2, 0)).toBe(0);
  });

  it("scales with the share matched and caps at the documented maximum", () => {
    expect(calculateAdvantageBonus(1, 4)).toBe(2.5);
    expect(calculateAdvantageBonus(2, 4)).toBe(5);
    expect(calculateAdvantageBonus(4, 4)).toBe(MAX_ADVANTAGE_BONUS);
    expect(calculateAdvantageBonus(9, 4)).toBe(MAX_ADVANTAGE_BONUS);
  });

  it("cannot by itself make an unmatched candidate look qualified", () => {
    const result = match(["docker", "aws"], ["c", "rtos"], ["docker", "aws"]);

    expect(result.algorithmicScore).toBe(MAX_ADVANTAGE_BONUS);
  });
});

describe("weighting", () => {
  it("splits exactly as MATCH_WEIGHTS declares", () => {
    expect(calculateFinalMatchScore(100, 0)).toBe(
      Math.round(MATCH_WEIGHTS.deterministic * 100)
    );
    expect(calculateFinalMatchScore(0, 100)).toBe(Math.round(MATCH_WEIGHTS.ai * 100));
  });

  it("sums to one", () => {
    expect(MATCH_WEIGHTS.deterministic + MATCH_WEIGHTS.ai).toBeCloseTo(1);
  });

  it("keeps the deterministic component dominant", () => {
    // The recorded rationale on MATCH_WEIGHTS depends on this: a heavier AI
    // weight lifts genuinely unrelated candidates and compresses the gap
    // between an exact match and a related-only one.
    expect(MATCH_WEIGHTS.deterministic).toBeGreaterThan(MATCH_WEIGHTS.ai);
  });

  it("ties the zero-overlap ceiling to the AI weight", () => {
    const unrelated = match(FRONTEND_CANDIDATE_SKILLS, ["c", "rtos"], [], {});

    expect(unrelated.algorithmicScore).toBe(0);
    expect(calculateFinalMatchScore(0, 100)).toBe(Math.round(MATCH_WEIGHTS.ai * 100));
  });

  it("holds the measured separation between an exact and a related-only match", () => {
    const exact = match(SECURITY_EXPERT_SKILLS, PARTIAL_ANALYSIS.requiredSkills, PARTIAL_ANALYSIS.advantageSkills);
    const relatedOnly = match(
      SECURITY_CANDIDATE_SKILLS,
      PARTIAL_ANALYSIS.requiredSkills,
      PARTIAL_ANALYSIS.advantageSkills
    );

    // 42 points at 0.7/0.3, per the recorded table. Asserted as a floor so a
    // future retune cannot quietly erode the distinction.
    expect(exact.finalScore - relatedOnly.finalScore).toBeGreaterThanOrEqual(35);
  });
});

describe("determinism and bounds", () => {
  it("produces byte-identical output across 100 runs", () => {
    const first = JSON.stringify(
      match(
        SECURITY_CANDIDATE_SKILLS,
        FULL_POSTING_REQUIRED,
        FULL_POSTING_ADVANTAGE,
        FULL_POSTING_RELATIONS
      )
    );

    for (let i = 0; i < 100; i += 1) {
      expect(
        JSON.stringify(
          match(
            SECURITY_CANDIDATE_SKILLS,
            FULL_POSTING_REQUIRED,
            FULL_POSTING_ADVANTAGE,
            FULL_POSTING_RELATIONS
          )
        )
      ).toBe(first);
    }
  });

  it("keeps every score inside 0-100", () => {
    const cases: Array<[readonly string[], string[], string[]]> = [
      [SECURITY_CANDIDATE_SKILLS, FULL_POSTING_REQUIRED, FULL_POSTING_ADVANTAGE],
      [FRONTEND_CANDIDATE_SKILLS, ["c"], []],
      [SECURITY_EXPERT_SKILLS, PARTIAL_ANALYSIS.requiredSkills, []],
      [[], ["react"], ["docker"]],
      [["react"], [], []],
    ];

    for (const [profile, required, advantage] of cases) {
      const result = match(profile, required, advantage);
      for (const score of [
        result.finalScore,
        result.algorithmicScore,
        result.aiSemanticScore,
      ]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
      expect(result.relatedShare).toBeGreaterThanOrEqual(0);
      expect(result.relatedShare).toBeLessThanOrEqual(1);
    }
  });

  it("handles an empty required list without dividing by zero", () => {
    const result = match(["react"], []);

    expect(result.algorithmicScore).toBe(0);
    expect(result.scorableRequiredCount).toBe(0);
    expect(result.matchDetails).toEqual([]);
  });

  it("handles an empty profile", () => {
    const result = match([], ["react", "node"]);

    expect(result.algorithmicScore).toBe(0);
    expect(result.matchedRequired).toEqual([]);
    expect(result.missingRequired).toEqual(["react", "node"]);
  });

  it("ignores duplicate requirements", () => {
    const result = match(["react"], ["react", "React.js", "REACT"]);

    expect(result.scorableRequiredCount).toBe(1);
    expect(result.algorithmicScore).toBe(100);
  });
});

describe("explainability completeness", () => {
  const fixtures: Array<[string, MatchAnalysis]> = [
    [
      "A",
      match(
        SECURITY_CANDIDATE_SKILLS,
        PARTIAL_ANALYSIS.requiredSkills,
        PARTIAL_ANALYSIS.advantageSkills
      ),
    ],
    [
      "B",
      match(
        SECURITY_CANDIDATE_SKILLS,
        FULL_POSTING_REQUIRED,
        FULL_POSTING_ADVANTAGE,
        FULL_POSTING_RELATIONS
      ),
    ],
    ["C", match(SECURITY_EXPERT_SKILLS, PARTIAL_ANALYSIS.requiredSkills)],
    ["D", match(FRONTEND_CANDIDATE_SKILLS, ["c", "rtos"])],
    ["E", match(["cyber-attack"], ["cybersecurity", "threat-detection"])],
    [
      "F",
      match(
        JUNIOR_FULLSTACK_PROFILE,
        JUNIOR_FULLSTACK_REQUIRED,
        JUNIOR_FULLSTACK_ADVANTAGE
      ),
    ],
  ];

  it.each(fixtures)("fixture %s has one detail per scorable requirement", (_name, result) => {
    expect(result.matchDetails).toHaveLength(result.scorableRequiredCount ?? -1);
  });

  it.each(fixtures)("fixture %s answers all five questions per row", (_name, result) => {
    for (const detail of result.matchDetails ?? []) {
      expect(typeof detail.required).toBe("string");
      expect(detail.required.length).toBeGreaterThan(0);
      expect(["exact", "alias", "related", "none"]).toContain(detail.tier);
      expect(typeof detail.credit).toBe("number");
      expect(typeof detail.reason).toBe("string");
      expect(detail.reason.length).toBeGreaterThan(0);
    }
  });

  it.each(fixtures)("fixture %s never claims a match without naming it", (_name, result) => {
    for (const detail of result.matchDetails ?? []) {
      if (detail.tier === "none") {
        expect(detail.matchedBy).toBeNull();
        expect(detail.credit).toBe(0);
      } else {
        expect(detail.matchedBy).not.toBeNull();
        expect(detail.credit).toBeGreaterThan(0);
      }
    }
  });

  it.each(fixtures)("fixture %s arithmetic reproduces the reported score", (_name, result) => {
    const details = result.matchDetails ?? [];
    const scorable = result.scorableRequiredCount ?? 0;
    const totalCredit = details.reduce((sum, d) => sum + d.credit, 0);
    const skillScore = scorable === 0 ? 0 : (totalCredit / scorable) * 100;

    expect(result.algorithmicScore).toBe(
      Math.min(100, Math.round(skillScore + (result.advantageBonus ?? 0)))
    );
    expect(result.finalScore).toBe(
      calculateFinalMatchScore(result.algorithmicScore, result.aiSemanticScore)
    );
  });

  it.each(fixtures)("fixture %s lists every requirement exactly once", (_name, result) => {
    const details = result.matchDetails ?? [];
    const required = details.map((d) => d.required);

    expect(new Set(required).size).toBe(required.length);
    const matchedAndMissing = [...result.matchedRequired, ...result.missingRequired];
    for (const name of required) {
      expect(matchedAndMissing).toContain(name);
    }
  });
});

describe("legacy jobs without asserted relations", () => {
  it("falls back to the curated relation map", () => {
    const withRelations = match(
      SECURITY_CANDIDATE_SKILLS,
      PARTIAL_ANALYSIS.requiredSkills,
      [],
      { cybersecurity: ["cyber-attack"] }
    );
    const withoutRelations = match(
      SECURITY_CANDIDATE_SKILLS,
      PARTIAL_ANALYSIS.requiredSkills,
      []
    );

    // The curated floor already covers this pairing, so a job analysed before
    // relations existed still scores.
    expect(withoutRelations.algorithmicScore).toBeGreaterThan(0);
    expect(withoutRelations.algorithmicScore).toBe(withRelations.algorithmicScore);
  });

  it("uses an asserted relation the curated map does not know", () => {
    const asserted = match(["censys"], ["attack-surface-management"], [], {
      "attack-surface-management": ["censys", "shodan"],
    });
    const unasserted = match(["censys"], ["attack-surface-management"]);

    expect(asserted.algorithmicScore).toBe(50);
    expect(unasserted.algorithmicScore).toBe(0);
  });
});
