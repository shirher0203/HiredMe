/**
 * Atomization and graded tier classification.
 *
 * The negative cases matter as much as the positive ones. Adding a related tier
 * is only defensible if it cannot be used to manufacture a match, so this suite
 * pins both directions: related expertise earns partial credit, and look-alike
 * skills earn nothing.
 */

import {
  RELATED_CREDIT,
  atomizeSkill,
  atomizeSkills,
  classifySkillMatch,
  cleanSkillText,
  normalizeSkill,
} from "../../services/matching/skills-normalizer";
import {
  SKILL_FAMILIES,
  SKILL_RELATIONS,
  getSkillFamily,
  isNeverRelated,
} from "../../services/matching/skill-families.data";
import { SECURITY_CANDIDATE_RAW_SKILLS } from "../fixtures/security-candidate-profile";

describe("cleanSkillText", () => {
  it("cleans without alias mapping", () => {
    expect(cleanSkillText("  React.js  ")).toBe("react.js");
    expect(cleanSkillText("JS")).toBe("js");
    expect(cleanSkillText("Python.")).toBe("python");
    expect(cleanSkillText("")).toBe("");
  });
});

describe("atomizeSkill", () => {
  it("splits slash compounds that are two skills", () => {
    expect(atomizeSkill("html/css")).toEqual(["html", "css"]);
    expect(atomizeSkill("HTML / CSS")).toEqual(["html", "css"]);
    expect(atomizeSkill("AWS/GCP")).toEqual(["aws", "google-cloud-platform"]);
  });

  it("keeps slash compounds that are one skill", () => {
    expect(atomizeSkill("tcp/ip")).toEqual(["tcp-ip"]);
    expect(atomizeSkill("CI/CD")).toEqual(["ci-cd"]);
  });

  it("handles the multi-concept blobs the CV parser produced", () => {
    expect(atomizeSkill("tcp/ip networking and protocols")).toEqual([
      "tcp-ip",
      "networking",
    ]);
    expect(atomizeSkill("aws cloud environments")).toEqual(["aws"]);
    expect(atomizeSkill("cyber attack knowledge")).toEqual(["cyber-attack"]);
    expect(atomizeSkill("node.js and express")).toEqual(["node", "express"]);
  });

  it("splits on and, ampersand, comma and pipe", () => {
    expect(atomizeSkill("react and vue")).toEqual(["react", "vue"]);
    expect(atomizeSkill("docker & kubernetes")).toEqual(["docker", "kubernetes"]);
    expect(atomizeSkill("python, sql")).toEqual(["python", "sql"]);
    expect(atomizeSkill("mysql|postgres")).toEqual(["mysql", "postgresql"]);
  });

  it("strips descriptive filler", () => {
    expect(atomizeSkill("strong knowledge of networking")).toEqual(["networking"]);
    expect(atomizeSkill("experience with docker")).toEqual(["docker"]);
    expect(atomizeSkill("python skills")).toEqual(["python"]);
    expect(atomizeSkill("advanced sql")).toEqual(["sql"]);
  });

  it("leaves genuine multiword skills intact", () => {
    expect(atomizeSkill("windows internals")).toEqual(["windows-internals"]);
    expect(atomizeSkill("active directory")).toEqual(["active-directory"]);
    expect(atomizeSkill("machine learning")).toEqual(["machine-learning"]);
    expect(atomizeSkill("threat hunting")).toEqual(["threat-hunting"]);
    expect(atomizeSkill("incident response")).toEqual(["incident-response"]);
  });

  it("returns nothing for empty or filler-only input", () => {
    expect(atomizeSkill("")).toEqual([]);
    expect(atomizeSkill("   ")).toEqual([]);
    expect(atomizeSkill("knowledge")).toEqual([]);
    expect(atomizeSkill("experience")).toEqual([]);
  });

  it("is idempotent", () => {
    const inputs = [
      "html/css",
      "tcp/ip networking and protocols",
      "aws cloud environments",
      "cyber attack knowledge",
      "windows internals",
      "react",
      "node.js and express",
    ];

    for (const input of inputs) {
      const once = atomizeSkill(input);
      const twice = once.flatMap((atom) => atomizeSkill(atom));
      expect(twice).toEqual(once);
    }
  });

  it("normalizes each atom to canonical form", () => {
    expect(atomizeSkill("React.js and Node.js")).toEqual(["react", "node"]);
    expect(atomizeSkill("JS, TS")).toEqual(["javascript", "typescript"]);
  });
});

describe("atomizeSkills", () => {
  it("flattens and deduplicates", () => {
    expect(atomizeSkills(["html/css", "css", "react.js", "react"])).toEqual([
      "html",
      "css",
      "react",
    ]);
  });

  it("canonicalizes the real candidate profile", () => {
    const atomized = atomizeSkills([...SECURITY_CANDIDATE_RAW_SKILLS]);

    // The blobs that used to block every match are now separate skills.
    expect(atomized).toContain("html");
    expect(atomized).toContain("css");
    expect(atomized).toContain("tcp-ip");
    expect(atomized).toContain("networking");
    expect(atomized).toContain("cyber-attack");
    expect(atomized).toContain("aws");
    expect(atomized).not.toContain("html/css");
    expect(atomized).not.toContain("aws cloud environments");
    expect(atomized).not.toContain("cyber attack knowledge");
    expect(new Set(atomized).size).toBe(atomized.length);
  });
});

describe("classifySkillMatch — positive tiers", () => {
  it("grades an identical string as exact", () => {
    const match = classifySkillMatch("python", "python");

    expect(match.tier).toBe("exact");
    expect(match.credit).toBe(1);
    expect(match.matchedBy).toBe("python");
    expect(match.reason).toContain("python");
  });

  it("grades different wording for the same skill as alias", () => {
    const match = classifySkillMatch("React.js", "react");

    expect(match.tier).toBe("alias");
    expect(match.credit).toBe(1);
    expect(match.matchedBy).toBe("react");
  });

  it("treats a case-only difference as exact, not alias", () => {
    expect(classifySkillMatch("Python", "python").tier).toBe("exact");
  });

  it("grades a curated neighbour as related at half credit", () => {
    const match = classifySkillMatch("cyber-attack", "cybersecurity");

    expect(match.tier).toBe("related");
    expect(match.credit).toBe(RELATED_CREDIT);
    expect(match.matchedBy).toBe("cyber-attack");
  });

  it("grades the security relations the Microsoft case needs", () => {
    for (const required of [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
    ]) {
      expect(classifySkillMatch("cyber-attack", required).tier).toBe("related");
    }
  });

  it("grades an AI-asserted relation as related", () => {
    const match = classifySkillMatch("censys", "attack-surface-management", [
      "censys",
      "shodan",
    ]);

    expect(match.tier).toBe("related");
    expect(match.credit).toBe(RELATED_CREDIT);
  });

  it("normalizes asserted relations before comparing", () => {
    const match = classifySkillMatch("React.js", "frontend-engineering", ["react"]);

    expect(match.tier).toBe("related");
  });

  it("reports the family of the requirement when known", () => {
    expect(classifySkillMatch("python", "python").family).toBe("language");
    expect(classifySkillMatch("cyber-attack", "cybersecurity").family).toBe("security");
  });
});

describe("classifySkillMatch — false-positive guards", () => {
  it("does not relate javascript to c", () => {
    expect(classifySkillMatch("javascript", "c").tier).toBe("none");
  });

  it("does not relate javascript to java", () => {
    expect(classifySkillMatch("javascript", "java").tier).toBe("none");
    expect(classifySkillMatch("java", "javascript").tier).toBe("none");
  });

  it("does not relate mysql to mongodb", () => {
    expect(classifySkillMatch("mysql", "mongodb").tier).toBe("none");
  });

  it("does not relate git to github-actions", () => {
    expect(classifySkillMatch("git", "github-actions").tier).toBe("none");
  });

  it("does not relate pandas to cybersecurity", () => {
    expect(classifySkillMatch("pandas", "cybersecurity").tier).toBe("none");
  });

  it("never awards credit for family co-membership alone", () => {
    // Same family, no asserted relation, so no credit. This is the rule that
    // keeps the related tier honest.
    const sameFamilyPairs: Array<[string, string]> = [
      ["javascript", "ruby"],
      ["python", "kotlin"],
      ["vue", "svelte"],
      ["cypress", "selenium"],
      ["wireshark", "firewall"],
    ];

    for (const [a, b] of sameFamilyPairs) {
      expect(getSkillFamily(a)).toBe(getSkillFamily(b));
      expect(classifySkillMatch(a, b).tier).toBe("none");
    }
  });

  it("refuses an AI-asserted relation on the never-related list", () => {
    // Even if the model claims it, java does not relate to javascript.
    const match = classifySkillMatch("java", "javascript", ["java"]);

    expect(match.tier).toBe("none");
    expect(match.credit).toBe(0);
    expect(match.matchedBy).toBeNull();
  });

  it("returns none with no matchedBy for empty input", () => {
    expect(classifySkillMatch("", "python").tier).toBe("none");
    expect(classifySkillMatch("python", "").matchedBy).toBeNull();
  });

  it("never returns a non-none tier without naming what matched", () => {
    const pairs: Array<[string, string, string[]]> = [
      ["python", "python", []],
      ["React.js", "react", []],
      ["cyber-attack", "cybersecurity", []],
      ["censys", "asm", ["censys"]],
      ["pandas", "cybersecurity", []],
      ["", "", []],
    ];

    for (const [profile, required, related] of pairs) {
      const match = classifySkillMatch(profile, required, related);
      if (match.tier === "none") {
        expect(match.matchedBy).toBeNull();
        expect(match.credit).toBe(0);
      } else {
        expect(match.matchedBy).not.toBeNull();
        expect(match.credit).toBeGreaterThan(0);
      }
    }
  });
});

describe("taxonomy data invariants", () => {
  it("every family key is a canonical form that survives normalization", () => {
    const offenders = Object.keys(SKILL_FAMILIES).filter(
      (skill) => normalizeSkill(skill) !== skill
    );

    expect(offenders).toEqual([]);
  });

  it("every relation key and value is a stable canonical form", () => {
    const offenders: string[] = [];
    for (const [skill, related] of Object.entries(SKILL_RELATIONS)) {
      if (normalizeSkill(skill) !== skill) offenders.push(skill);
      for (const other of related) {
        if (normalizeSkill(other) !== other) offenders.push(`${skill}->${other}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("relations are symmetric", () => {
    const asymmetric: string[] = [];
    for (const [skill, related] of Object.entries(SKILL_RELATIONS)) {
      for (const other of related) {
        if (!(SKILL_RELATIONS[other] ?? []).includes(skill)) {
          asymmetric.push(`${skill} -> ${other}`);
        }
      }
    }

    expect(asymmetric).toEqual([]);
  });

  it("no skill is related to itself", () => {
    const selfRelated = Object.entries(SKILL_RELATIONS)
      .filter(([skill, related]) => related.includes(skill))
      .map(([skill]) => skill);

    expect(selfRelated).toEqual([]);
  });

  it("no relation contradicts the never-related list", () => {
    const contradictions: string[] = [];
    for (const [skill, related] of Object.entries(SKILL_RELATIONS)) {
      for (const other of related) {
        if (isNeverRelated(skill, other)) contradictions.push(`${skill} -> ${other}`);
      }
    }

    expect(contradictions).toEqual([]);
  });

  it("covers the security and networking domains that were missing", () => {
    for (const skill of [
      "cybersecurity",
      "threat-detection",
      "security-investigation",
      "cyber-attack",
      "networking",
      "tcp-ip",
      "wireshark",
    ]) {
      expect(SKILL_RELATIONS[skill]).toBeDefined();
      expect(getSkillFamily(skill)).toBeDefined();
    }
  });
});
