import {
  buildAnalyzeJobPrompt,
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
