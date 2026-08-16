/**
 * Characterization baseline for the Microsoft scenarios.
 *
 * Every expectation in this file describes the matcher as it behaves BEFORE the
 * graded-matching work. It is deliberately committed green so the improvement
 * shows up as a change to these assertions rather than as a claim in a commit
 * message. The Scenario A expectations here are rewritten once graded credit
 * lands.
 */

import {
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

describe("Microsoft baseline (pre-graded-matching behaviour)", () => {
  describe("Scenario A — partial description", () => {
    it("scores zero skill overlap despite related security expertise", () => {
      const match = matchScenarioA();

      // The candidate has cyber-attack, tcp-ip, networking and wireshark; the
      // job asks for cybersecurity, threat-detection and security-investigation.
      // Binary set equality sees no relationship at all.
      expect(match.algorithmicScore).toBe(0);
      expect(match.matchedRequired).toEqual([]);
      expect(match.missingRequired).toHaveLength(4);
      expect(match.matchedAdvantage).toEqual([]);
    });

    it("caps the final score at 30 whenever skill overlap is zero", () => {
      const match = matchScenarioA();

      // 0.7 * 0 + 0.3 * 65 = 19.5
      expect(match.finalScore).toBe(20);
      // Even a perfect semantic score cannot lift a zero-overlap match past 30.
      expect(calculateFinalMatchScore(0, 100)).toBe(30);
    });

    it("gives advantage skills no influence on the score", () => {
      const withAdvantage = buildDeterministicMatch(
        ["attacker landscape knowledge", "adversary tradecraft", "enterprise security"],
        PARTIAL_ANALYSIS.requiredSkills,
        PARTIAL_ANALYSIS.advantageSkills,
        AI_SCORE,
        "Advantage skills only."
      );

      expect(withAdvantage.matchedAdvantage).toHaveLength(3);
      expect(withAdvantage.algorithmicScore).toBe(0);
      expect(withAdvantage.finalScore).toBe(matchScenarioA().finalScore);
    });

    it("counts non-skill requirements in the denominator", () => {
      const match = buildDeterministicMatch(
        ["react"],
        ["react", "5+ years of experience", "BSc in Computer Science", "team player"],
        [],
        AI_SCORE,
        "One real skill, three non-skills."
      );

      // A candidate who has every actual skill still scores 25 because the
      // years, the degree and the soft requirement dilute the denominator.
      expect(match.algorithmicScore).toBe(25);
      expect(match.missingRequired).toHaveLength(3);
    });
  });

  describe("skill representation", () => {
    // Updated when the security aliases landed: these phrases used to pass
    // through as lowercased prose because the dictionary had no security
    // coverage at all. They are canonical now — and the score below is still
    // zero, which is the point. Canonicalizing both sides is necessary but not
    // sufficient; only graded credit fixes the score.
    it("canonicalizes job-side security phrases", () => {
      expect(normalizeSkills(PARTIAL_ANALYSIS.requiredSkills)).toEqual([
        "identity-threat-detection-and-response",
        "cybersecurity",
        "threat-detection",
        "security-investigation",
      ]);
    });

    it("still scores zero once both sides are canonical", () => {
      const match = buildDeterministicMatch(
        normalizeSkills([...SECURITY_CANDIDATE_SKILLS]),
        normalizeSkills(PARTIAL_ANALYSIS.requiredSkills),
        normalizeSkills(PARTIAL_ANALYSIS.advantageSkills),
        AI_SCORE,
        "Canonical on both sides."
      );

      expect(match.algorithmicScore).toBe(0);
    });

    it("keeps multi-concept CV blobs as single opaque tokens", () => {
      expect(normalizeSkill("html/css")).toBe("html/css");
      expect(normalizeSkill("tcp/ip networking and protocols")).toBe(
        "tcp/ip networking and protocols"
      );
      expect(normalizeSkill("aws cloud environments")).toBe("aws cloud environments");
      expect(normalizeSkill("cyber attack knowledge")).toBe("cyber attack knowledge");
    });

    it("cannot match a raw CV profile against the same skills in canonical form", () => {
      const raw = buildDeterministicMatch(
        [...SECURITY_CANDIDATE_RAW_SKILLS],
        ["html", "css", "aws", "tcp-ip", "networking"],
        [],
        AI_SCORE,
        "Same skills, different representation."
      );

      expect(raw.algorithmicScore).toBe(0);
      expect(raw.matchedRequired).toEqual([]);
    });
  });

  describe("fixture integrity", () => {
    it("keeps Scenario A thin: the technologies the full posting names are absent", () => {
      const partial = MICROSOFT_PARTIAL_DESCRIPTION.toLowerCase();

      for (const term of [
        "python",
        "sql",
        "windows internals",
        "kerberos",
        "kql",
        "chatgpt",
      ]) {
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
  });
});
