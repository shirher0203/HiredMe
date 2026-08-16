import {
  CANONICAL_SKILL_RULES,
  buildAnalyzeJobPrompt,
  buildParseResumePrompt,
  buildSemanticMatchPrompt,
  buildGenerateQuestionsPrompt,
  buildEvaluateAnswerPrompt,
} from "../../services/ai/prompts";

const STRICT_INSTRUCTIONS = [
  "Return ONLY valid JSON",
  "Do not include explanations",
  "Do not include markdown",
  "The response must be a single JSON object and nothing else.",
  "Do not return arrays as the root response.",
];

describe("buildAnalyzeJobPrompt", () => {
  const prompt = buildAnalyzeJobPrompt({
    jobDescription:
      "We are hiring a junior full-stack developer with React and Node experience.",
    roleTitle: "Junior Full-Stack Developer",
    companyName: "Acme Corp",
  });

  it("includes the strict JSON-only instructions", () => {
    for (const line of STRICT_INSTRUCTIONS) {
      expect(prompt).toContain(line);
    }
  });

  it("includes every schema key", () => {
    for (const key of [
      "roleTitle",
      "requiredSkills",
      "advantageSkills",
      "toolsMentioned",
      "impliedSkills",
      "nonSkillRequirements",
      "skillRelations",
      "seniorityLevel",
      "summary",
    ]) {
      expect(prompt).toContain(key);
    }
  });

  it("includes the seniority enum values", () => {
    expect(prompt).toContain('"junior" | "mid" | "senior"');
  });

  it("injects the dynamic job description and hints", () => {
    expect(prompt).toContain(
      "We are hiring a junior full-stack developer with React and Node experience."
    );
    expect(prompt).toContain("Junior Full-Stack Developer");
    expect(prompt).toContain("Acme Corp");
  });

  it("states the eight-bucket classification", () => {
    for (const bucket of [
      "requiredSkills — technical skills the posting states as required",
      "advantageSkills — skills presented as preferred",
      "toolsMentioned — every concrete thing the posting names by name",
      "impliedSkills — technical capabilities clearly implied",
      "generic non-skill requirements",
      "experience and seniority requirements",
      "education requirements",
      "soft and leadership requirements",
    ]) {
      expect(prompt).toContain(bucket);
    }
  });

  it("excludes non-skills from the skill arrays", () => {
    expect(prompt).toContain(
      "must never appear in any of the four arrays above"
    );
    expect(prompt).toContain("5+ years of experience");
    expect(prompt).toContain("BSc in Computer Science");
    expect(prompt).toContain("team player");
    expect(prompt).toContain(
      "Never place company boilerplate, benefits, perks, or equal-opportunity statements"
    );
  });

  it("states the canonical form rules", () => {
    expect(prompt).toContain(CANONICAL_SKILL_RULES);
    expect(prompt).toContain("one concept per entry");
    expect(prompt).toContain("multiword skills hyphenated");
    expect(prompt).toContain("no version numbers");
  });

  it("bounds recall so it cannot become a dump", () => {
    expect(prompt).toContain("at most 15 entries");
    expect(prompt).toContain("A short or vague posting must produce a short result");
  });

  it("forbids inventing technologies the posting does not contain", () => {
    expect(prompt).toContain(
      "Never add a technology the text does not mention"
    );
  });

  it("specifies how relations must be asserted", () => {
    expect(prompt).toContain("skillRelations rules:");
    expect(prompt).toContain("genuinely transferable");
    expect(prompt).toContain(
      "Do not list a term merely because it belongs to the same broad category"
    );
  });
});

describe("buildParseResumePrompt", () => {
  const prompt = buildParseResumePrompt("Some resume text about React and Node.");

  it("applies the same canonical form rules as the job prompt", () => {
    expect(prompt).toContain(CANONICAL_SKILL_RULES);
  });

  it("shows how to split the blobs the parser used to emit", () => {
    expect(prompt).toContain('"tcp-ip"');
    expect(prompt).toContain('"HTML/CSS" becomes "html" and "css"');
    expect(prompt).toContain('"AWS cloud environments" becomes "aws"');
  });

  it("leaves soft skills out of canonicalization", () => {
    expect(prompt).toContain("skills.soft_skills is prose and is NOT canonicalized");
  });

  it("targets a focused suggested-skills list instead of 75-100 entries", () => {
    expect(prompt).toContain("Target: 25-40 entries");
    expect(prompt).not.toContain("75-100");
  });
});

describe("buildSemanticMatchPrompt", () => {
  const prompt = buildSemanticMatchPrompt({
    profileSkills: ["react", "node", "typescript"],
    requiredSkills: ["react", "mongodb"],
    advantageSkills: ["docker"],
  });

  it("includes the strict JSON-only instructions", () => {
    for (const line of STRICT_INSTRUCTIONS) {
      expect(prompt).toContain(line);
    }
  });

  it("includes schema keys and the 0-100 range", () => {
    expect(prompt).toContain("aiSemanticScore");
    expect(prompt).toContain("explanation");
    expect(prompt).toContain("0-100");
  });

  it("rejects percentage-string scores explicitly", () => {
    expect(prompt).toContain("percentage");
  });

  it("injects every skill list into the prompt", () => {
    for (const skill of [
      "react",
      "node",
      "typescript",
      "mongodb",
      "docker",
    ]) {
      expect(prompt).toContain(skill);
    }
  });
});

describe("buildGenerateQuestionsPrompt", () => {
  const prompt = buildGenerateQuestionsPrompt({
    interviewType: "technical",
    profileSkills: ["react", "typescript"],
    jobRequiredSkills: ["react", "node", "mongodb"],
    count: 3,
    language: "en",
  });

  it("includes the strict JSON-only instructions", () => {
    for (const line of STRICT_INSTRUCTIONS) {
      expect(prompt).toContain(line);
    }
  });

  it("includes every schema key for a question", () => {
    for (const key of ["questions", "id", "question", "topic", "expectedFocus"]) {
      expect(prompt).toContain(key);
    }
  });

  it("asks for exactly input.count questions", () => {
    expect(prompt).toContain("exactly 3");
  });

  it("injects interview type and skills", () => {
    expect(prompt).toContain("technical");
    for (const skill of ["react", "typescript", "node", "mongodb"]) {
      expect(prompt).toContain(skill);
    }
  });

  it("defaults to English when no language is provided", () => {
    const defaulted = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["communication"],
      count: 2,
    });
    expect(defaulted).toContain("English");
    expect(defaulted).toContain("exactly 2");
  });

  it("honors Hebrew when requested", () => {
    const hebrew = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["communication"],
      count: 1,
      language: "he",
    });
    expect(hebrew).toContain("Hebrew");
  });
});

describe("buildEvaluateAnswerPrompt", () => {
  const prompt = buildEvaluateAnswerPrompt({
    question: "Explain the virtual DOM.",
    expectedFocus: "reconciliation, diffing, performance trade-offs",
    userAnswer: "It's a lightweight in-memory copy of the real DOM ...",
    interviewType: "technical",
  });

  it("includes the strict JSON-only instructions", () => {
    for (const line of STRICT_INSTRUCTIONS) {
      expect(prompt).toContain(line);
    }
  });

  it("includes every schema key", () => {
    for (const key of [
      "score",
      "clarity",
      "correctness",
      "depth",
      "feedback",
      "improvementTips",
    ]) {
      expect(prompt).toContain(key);
    }
  });

  it("enforces the 0-100 range on numeric fields", () => {
    expect(prompt).toContain("0-100");
  });

  it("forbids percentage-string scores", () => {
    expect(prompt).toContain('"85%"');
  });

  it("injects the question, expected focus, and user answer", () => {
    expect(prompt).toContain("Explain the virtual DOM.");
    expect(prompt).toContain("reconciliation, diffing, performance trade-offs");
    expect(prompt).toContain("It's a lightweight in-memory copy of the real DOM ...");
    expect(prompt).toContain("technical");
  });
});
