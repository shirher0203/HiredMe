/**
 * The Microsoft scenarios, before and after graded matching.
 *
 * This file started as a characterization test that asserted the defect: zero
 * skill overlap for a security candidate against a security role, a final score
 * capped at 30, advantage skills worth nothing, and non-skill requirements
 * diluting the denominator. Those expectations were committed green on purpose
 * so the improvement would show up as a diff rather than a claim.
 *
 * Every one of them has now been inverted by graded coverage. The old numbers
 * are kept in the comments so the change is legible.
 */

import {
  MATCH_WEIGHTS,
  buildDeterministicMatch,
  calculateFinalMatchScore,
} from "../../services/matching/matching.service";
import { normalizeSkill, normalizeSkills } from "../../services/matching/skills-normalizer";
import {
  MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS as PARTIAL_ANALYSIS,
  MICROSOFT_PARTIAL_DESCRIPTION,
} from "../fixtures/microsoft-job-partial";
import {
  MICROSOFT_FULL_DESCRIPTION,
  MICROSOFT_FULL_EXPECTED_TERMS,
} from "../fixtures/microsoft-job-full";
import {
  SECURITY_CANDIDATE_RAW_SKILLS,
  SECURITY_CANDIDATE_SKILLS,
} from "../fixtures/security-candidate-profile";

const AI_SCORE = 65;

function matchScenarioA() {
  return buildDeterministicMatch(
    [...SECURITY_CANDIDATE_SKILLS],
    PARTIAL_ANALYSIS.requiredSkills,
    PARTIAL_ANALYSIS.advantageSkills,
    AI_SCORE,
    "The candidate has adjacent security knowledge but no direct ITDR experience."
  );
}

describe("Microsoft Scenario A — partial description", () => {
  it("credits related security expertise instead of scoring zero", () => {
    const match = matchScenarioA();

    // Was: algorithmicScore 0, matchedRequired [], because binary set equality
    // saw no relationship between cyber-attack and cybersecurity at all.
    expect(match.algorithmicScore).toBeGreaterThan(0);
    expect(match.matchedRequired.length).toBeGreaterThan(0);

    const related = (match.matchDetails ?? []).filter(
      (detail) => detail.tier === "related"
    );
    expect(related.length).toBeGreaterThanOrEqual(2);
    expect(related.every((detail) => detail.matchedBy === "cyber-attack")).toBe(true);
  });

  it("names exactly which requirement each profile skill answers", () => {
    const match = matchScenarioA();
    const byRequired = new Map(
      (match.matchDetails ?? []).map((detail) => [detail.required, detail])
    );

    for (const required of [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
    ]) {
      expect(byRequired.get(required)?.tier).toBe("related");
      expect(byRequired.get(required)?.credit).toBe(0.5);
      expect(byRequired.get(required)?.matchedBy).toBe("cyber-attack");
    }

    // Nothing in the profile speaks to the product itself.
    expect(byRequired.get("identity-threat-detection-and-response")?.tier).toBe("none");
  });

  it("is no longer capped at 30 by a zero deterministic score", () => {
    const match = matchScenarioA();

    // Was: finalScore 20, and 30 was the ceiling no matter how well the
    // semantic layer scored the candidate.
    expect(match.finalScore).toBeGreaterThanOrEqual(40);
    // The cap itself still exists for a genuinely unrelated profile.
    expect(calculateFinalMatchScore(0, 100)).toBe(30);
  });

  it("gives advantage skills a bounded influence on the score", () => {
    const withAdvantage = buildDeterministicMatch(
      ["adversary-tradecraft", "enterprise-security"],
      PARTIAL_ANALYSIS.requiredSkills,
      PARTIAL_ANALYSIS.advantageSkills,
      AI_SCORE,
      "Advantage skills only."
    );

    // Was: matchedAdvantage populated but algorithmicScore identical to a
    // profile with no advantage skills at all.
    expect(withAdvantage.matchedAdvantage.length).toBeGreaterThan(0);
    expect(withAdvantage.advantageBonus).toBeGreaterThan(0);
    expect(withAdvantage.advantageBonus).toBeLessThanOrEqual(10);
  });

  it("leaves non-skill requirements out of the denominator", () => {
    const match = buildDeterministicMatch(
      ["react"],
      ["react", "5+ years of experience", "BSc in Computer Science", "team player"],
      [],
      AI_SCORE,
      "One real skill, three non-skills."
    );

    // Was: 25, because the years, the degree and the soft requirement each
    // counted as a missed skill against a candidate who had every real one.
    expect(match.scorableRequiredCount).toBe(1);
    expect(match.algorithmicScore).toBe(100);
    // They are still reported, just not scored.
    expect(match.missingRequired).toHaveLength(3);
  });
});

describe("skill representation", () => {
  it("canonicalizes job-side security phrases", () => {
    expect(normalizeSkills(PARTIAL_ANALYSIS.requiredSkills)).toEqual([
      "identity-threat-detection-and-response",
      "cybersecurity",
      "threat-detection",
      "security-investigation",
    ]);
  });

  it("scores a raw CV profile the same as its canonical form", () => {
    const raw = buildDeterministicMatch(
      [...SECURITY_CANDIDATE_RAW_SKILLS],
      ["html", "css", "aws", "tcp-ip", "networking"],
      [],
      AI_SCORE,
      "Same skills, different representation."
    );

    // Was: 0. The profile listed "html/css", "aws cloud environments" and
    // "tcp/ip networking and protocols", which matched nothing. Atomizing at
    // compare time means a profile saved before atomization existed is not
    // penalised for how it was written.
    expect(raw.algorithmicScore).toBe(100);
    expect(raw.matchedRequired).toEqual(["html", "css", "aws", "tcp-ip", "networking"]);
  });

  it("still leaves normalizeSkill itself non-atomizing", () => {
    // Atomization is a separate, explicit step — normalizeSkill's contract for
    // existing callers is unchanged.
    expect(normalizeSkill("html/css")).toBe("html/css");
    expect(normalizeSkill("tcp/ip networking and protocols")).toBe(
      "tcp/ip networking and protocols"
    );
  });
});

describe("fixture integrity", () => {
  it("keeps Scenario A thin: the technologies the full posting names are absent", () => {
    const partial = MICROSOFT_PARTIAL_DESCRIPTION.toLowerCase();

    for (const term of ["python", "sql", "windows internals", "kerberos", "kql", "chatgpt"]) {
      expect(partial).not.toContain(term);
    }
  });

  it("keeps Scenario B rich: every recorded technology is present in the text", () => {
    const full = MICROSOFT_FULL_DESCRIPTION.toLowerCase();
    const allTerms = Object.values(MICROSOFT_FULL_EXPECTED_TERMS).flat();

    expect(allTerms.length).toBeGreaterThan(30);
    for (const term of allTerms) {
      expect(full).toContain(term);
    }
  });

  it("carries no personal data in the profile fixture", () => {
    const serialized = JSON.stringify(SECURITY_CANDIDATE_SKILLS).toLowerCase();

    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toMatch(/\+?\d{9,}/);
  });

  it("keeps the weighting in one auditable place", () => {
    expect(MATCH_WEIGHTS.deterministic + MATCH_WEIGHTS.ai).toBeCloseTo(1);
  });
});
