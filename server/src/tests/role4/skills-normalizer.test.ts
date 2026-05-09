import {
  normalizeSkill,
  normalizeSkills,
  hasSkill,
} from "../../services/matching/skills-normalizer";
import {
  AI_ML_ALIASES,
  BACKEND_ALIASES,
  CLOUD_ALIASES,
  CONCEPT_ALIASES,
  DATABASE_ALIASES,
  DEVOPS_ALIASES,
  FRONTEND_ALIASES,
  LANGUAGE_ALIASES,
  MOBILE_ALIASES,
  SKILL_ALIASES,
  TESTING_ALIASES,
  TOOLING_ALIASES,
} from "../../services/matching/skill-aliases.data";

const CATEGORY_MAPS = {
  LANGUAGE_ALIASES,
  FRONTEND_ALIASES,
  BACKEND_ALIASES,
  DATABASE_ALIASES,
  CLOUD_ALIASES,
  DEVOPS_ALIASES,
  TOOLING_ALIASES,
  TESTING_ALIASES,
  AI_ML_ALIASES,
  MOBILE_ALIASES,
  CONCEPT_ALIASES,
} as const;

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

describe("alias category spot checks", () => {
  it("maps language aliases", () => {
    expect(normalizeSkill("JS")).toBe("javascript");
    expect(normalizeSkill("ts")).toBe("typescript");
    expect(normalizeSkill("Golang")).toBe("go");
    expect(normalizeSkill("cpp")).toBe("c++");
    expect(normalizeSkill("c-sharp")).toBe("c#");
  });

  it("maps frontend framework aliases", () => {
    expect(normalizeSkill("React.js")).toBe("react");
    expect(normalizeSkill("Vue.js")).toBe("vue");
    expect(normalizeSkill("Next.js")).toBe("next");
    expect(normalizeSkill("angular.js")).toBe("angular");
    expect(normalizeSkill("SvelteJS")).toBe("svelte");
  });

  it("maps backend framework aliases", () => {
    expect(normalizeSkill("Node.js")).toBe("node");
    expect(normalizeSkill("Express.js")).toBe("express");
    expect(normalizeSkill("NestJS")).toBe("nest");
    expect(normalizeSkill("Spring Boot")).toBe("spring");
    expect(normalizeSkill("Ruby on Rails")).toBe("rails");
  });

  it("maps database aliases", () => {
    expect(normalizeSkill("mongo")).toBe("mongodb");
    expect(normalizeSkill("Postgres")).toBe("postgresql");
    expect(normalizeSkill("PG")).toBe("postgresql");
    expect(normalizeSkill("SQL Server")).toBe("mssql");
    expect(normalizeSkill("Elastic Search")).toBe("elasticsearch");
  });

  it("maps cloud provider aliases", () => {
    expect(normalizeSkill("GCP")).toBe("google-cloud-platform");
    expect(normalizeSkill("Google Cloud")).toBe("google-cloud-platform");
    expect(normalizeSkill("Amazon Web Services")).toBe("aws");
    expect(normalizeSkill("Microsoft Azure")).toBe("azure");
    expect(normalizeSkill("Digital Ocean")).toBe("digitalocean");
  });

  it("maps devops / infra aliases", () => {
    expect(normalizeSkill("k8s")).toBe("kubernetes");
    expect(normalizeSkill("GitHub Actions")).toBe("github-actions");
    expect(normalizeSkill("CI/CD")).toBe("ci-cd");
    expect(normalizeSkill("Continuous Integration")).toBe("ci-cd");
    expect(normalizeSkill("IaC")).toBe("infrastructure-as-code");
  });

  it("maps frontend tooling / CSS aliases", () => {
    expect(normalizeSkill("Tailwind CSS")).toBe("tailwind");
    expect(normalizeSkill("Material UI")).toBe("mui");
    expect(normalizeSkill("Styled Components")).toBe("styled-components");
    expect(normalizeSkill("shadcn/ui")).toBe("shadcn");
    expect(normalizeSkill("Ant Design")).toBe("antd");
  });

  it("maps testing aliases", () => {
    expect(normalizeSkill("React Testing Library")).toBe("rtl");
    expect(normalizeSkill("PyTest")).toBe("pytest");
    expect(normalizeSkill("Cypress.io")).toBe("cypress");
    expect(normalizeSkill("Selenium WebDriver")).toBe("selenium");
    expect(normalizeSkill("End to End")).toBe("e2e");
  });

  it("maps AI / ML aliases", () => {
    expect(normalizeSkill("LLM")).toBe("llm");
    expect(normalizeSkill("Large Language Model")).toBe("llm");
    expect(normalizeSkill("RAG")).toBe("rag");
    expect(normalizeSkill("Retrieval Augmented Generation")).toBe("rag");
    expect(normalizeSkill("PyTorch")).toBe("pytorch");
    expect(normalizeSkill("sklearn")).toBe("scikit-learn");
  });

  it("maps mobile aliases", () => {
    expect(normalizeSkill("React Native")).toBe("react-native");
    expect(normalizeSkill("RN")).toBe("react-native");
    expect(normalizeSkill("Jetpack Compose")).toBe("jetpack-compose");
    expect(normalizeSkill("SwiftUI")).toBe("swiftui");
    expect(normalizeSkill("Android Development")).toBe("android");
  });

  it("maps concept / methodology aliases", () => {
    expect(normalizeSkill("RESTful")).toBe("rest");
    expect(normalizeSkill("GraphQL API")).toBe("graphql");
    expect(normalizeSkill("WebSockets")).toBe("websocket");
    expect(normalizeSkill("OAuth 2.0")).toBe("oauth2");
    expect(normalizeSkill("TDD")).toBe("test-driven-development");
    expect(normalizeSkill("Microservices")).toBe("microservices");
  });
});

describe("alias data invariants", () => {
  it("every alias key is lowercase", () => {
    const offenders: string[] = [];
    for (const [category, map] of Object.entries(CATEGORY_MAPS)) {
      for (const key of Object.keys(map)) {
        if (key !== key.toLowerCase()) {
          offenders.push(`${category}:${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every canonical value is lowercase", () => {
    const offenders: string[] = [];
    for (const [category, map] of Object.entries(CATEGORY_MAPS)) {
      for (const [key, value] of Object.entries(map)) {
        if (value !== value.toLowerCase()) {
          offenders.push(`${category}:${key}→${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no alias key appears in more than one category", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [category, map] of Object.entries(CATEGORY_MAPS)) {
      for (const key of Object.keys(map)) {
        const prior = seen.get(key);
        if (prior !== undefined) {
          duplicates.push(`${key} in ${prior} and ${category}`);
        } else {
          seen.set(key, category);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("SKILL_ALIASES size equals the sum of category map sizes", () => {
    const sum = Object.values(CATEGORY_MAPS).reduce(
      (acc, map) => acc + Object.keys(map).length,
      0
    );
    expect(Object.keys(SKILL_ALIASES).length).toBe(sum);
  });
});
