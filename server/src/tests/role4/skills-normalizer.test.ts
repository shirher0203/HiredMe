import {
  normalizeSkill,
  normalizeSkills,
  hasSkill,
} from "../../services/matching/skills-normalizer";

describe("normalizeSkill", () => {
  it("collapses React variants to 'react'", () => {
    expect(normalizeSkill("React.js")).toBe("react");
    expect(normalizeSkill("reactjs")).toBe("react");
    expect(normalizeSkill("  React  ")).toBe("react");
    expect(normalizeSkill("REACT")).toBe("react");
  });

  it("collapses Node variants to 'node'", () => {
    expect(normalizeSkill("node.js")).toBe("node");
    expect(normalizeSkill("NodeJS")).toBe("node");
  });

  it("maps short-name aliases", () => {
    expect(normalizeSkill("js")).toBe("javascript");
    expect(normalizeSkill("ts")).toBe("typescript");
    expect(normalizeSkill("JS")).toBe("javascript");
    expect(normalizeSkill("TS")).toBe("typescript");
  });

  it("collapses Mongo variants to 'mongodb'", () => {
    expect(normalizeSkill("mongo")).toBe("mongodb");
    expect(normalizeSkill("Mongo DB")).toBe("mongodb");
    expect(normalizeSkill("mongo  db")).toBe("mongodb");
  });

  it("maps other documented aliases", () => {
    expect(normalizeSkill("postgres")).toBe("postgresql");
    expect(normalizeSkill("Express.js")).toBe("express");
    expect(normalizeSkill("expressjs")).toBe("express");
    expect(normalizeSkill("Tailwind CSS")).toBe("tailwind");
  });

  it("treats empty or whitespace-only input as empty", () => {
    expect(normalizeSkill("")).toBe("");
    expect(normalizeSkill("   ")).toBe("");
    expect(normalizeSkill("\t\n ")).toBe("");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeSkill("Python.")).toBe("python");
    expect(normalizeSkill("go,")).toBe("go");
    expect(normalizeSkill("rust;")).toBe("rust");
  });

  it("returns unknown skills as cleaned lowercase", () => {
    expect(normalizeSkill("Rust")).toBe("rust");
    expect(normalizeSkill("  Docker  ")).toBe("docker");
    expect(normalizeSkill("Kubernetes")).toBe("kubernetes");
  });
});

describe("normalizeSkills", () => {
  it("deduplicates and drops empties, preserving first-seen order", () => {
    const input = ["React.js", "react", "", "  ", "REACT", "Node", "node.js"];
    expect(normalizeSkills(input)).toEqual(["react", "node"]);
  });

  it("returns an empty array for all-empty input", () => {
    expect(normalizeSkills(["", "   ", "\n"])).toEqual([]);
  });

  it("normalizes a realistic profile list", () => {
    const input = ["TypeScript", "JS", "React.js", "Node.js", "Mongo"];
    expect(normalizeSkills(input)).toEqual([
      "typescript",
      "javascript",
      "react",
      "node",
      "mongodb",
    ]);
  });
});

describe("hasSkill", () => {
  it("returns true when the required skill is present (alias-aware)", () => {
    expect(hasSkill(["React.js", "Node"], "react")).toBe(true);
    expect(hasSkill(["React.js", "Node"], "React")).toBe(true);
    expect(hasSkill(["React.js", "Node"], "node")).toBe(true);
  });

  it("returns false when the required skill is missing", () => {
    expect(hasSkill(["Node"], "react")).toBe(false);
  });

  it("is alias-aware on both sides", () => {
    expect(hasSkill(["JS"], "javascript")).toBe(true);
    expect(hasSkill(["JavaScript"], "js")).toBe(true);
    expect(hasSkill(["Mongo"], "mongodb")).toBe(true);
    expect(hasSkill(["mongo db"], "MongoDB")).toBe(true);
  });

  it("returns false for empty required skill", () => {
    expect(hasSkill(["React"], "")).toBe(false);
    expect(hasSkill(["React"], "   ")).toBe(false);
  });
});
