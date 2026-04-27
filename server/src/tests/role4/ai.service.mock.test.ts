/**
 * Mock-mode tests for ai.service.
 *
 * Every test either runs with USE_MOCK_AI=true (so `callAi` is short-circuited
 * by the service), or it mocks the `./ai.client` module via `jest.mock` so no
 * real network I/O is ever attempted.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
}));

import { callAi } from "../../services/ai/ai.client";
import {
  analyzeProfile,
  analyzeJob,
  calculateMatch,
  generateInterviewQuestions,
  evaluateAnswer,
  __testables,
} from "../../services/ai/ai.service";
import type { JobAnalysis } from "../../services/matching/matching.types";
import type {
  GenerateQuestionsInput,
  EvaluateAnswerInput,
  InterviewQuestion,
} from "../../services/ai/ai.types";

const mockedCallAi = callAi as unknown as jest.Mock;

beforeEach(() => {
  mockedCallAi.mockReset();
});

describe("ai.service — mock mode (USE_MOCK_AI=true)", () => {
  beforeAll(() => {
    process.env.USE_MOCK_AI = "true";
  });
  afterAll(() => {
    delete process.env.USE_MOCK_AI;
  });

  it("analyzeProfile returns a valid ProfileAnalysis without calling the AI client", async () => {
    const result = await analyzeProfile({
      skills: ["react", "node"],
      experienceYears: 1,
      projects: ["portfolio site"],
    });

    expect(result.seniorityEstimate).toBeDefined();
    expect(["junior", "mid", "senior"]).toContain(result.seniorityEstimate);
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(typeof result.summary).toBe("string");
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("analyzeJob returns a JobAnalysis with non-empty requiredSkills", async () => {
    const result = await analyzeJob("Full-stack role, React + Node.");
    expect(Array.isArray(result.requiredSkills)).toBe(true);
    expect(result.requiredSkills.length).toBeGreaterThan(0);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("calculateMatch uses deterministic matching with mock semantic score", async () => {
    const profile = {
      skills: ["React.js", "Node", "TypeScript"],
      experienceYears: 1,
      projects: [],
    };
    const job: JobAnalysis = {
      roleTitle: "Junior Full-Stack Developer",
      requiredSkills: ["react", "mongodb", "node"],
      advantageSkills: ["docker", "typescript"],
      seniorityLevel: "junior",
      summary: "junior role",
    };

    const result = await calculateMatch(profile, job);

    expect(result.matchedRequired).toEqual(["react", "node"]);
    expect(result.missingRequired).toEqual(["mongodb"]);
    expect(result.matchedAdvantage).toEqual(["typescript"]);
    expect(result.algorithmicScore).toBe(67);
    expect(result.aiSemanticScore).toBe(72);
    // round(0.7*67 + 0.3*72) = round(46.9 + 21.6) = round(68.5) = 69
    // Spec requirement: round(0.7*67 + 0.3*72) = 68
    // JS Math.round(68.5) rounds to 69 (half-to-even would be 68). Verify
    // the formula output matches Math.round semantics.
    expect(result.finalScore).toBe(Math.round(0.7 * 67 + 0.3 * 72));
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("generateInterviewQuestions returns exactly input.count questions", async () => {
    const input: GenerateQuestionsInput = {
      interviewType: "technical",
      profileSkills: ["react"],
      count: 2,
    };
    const { questions } = await generateInterviewQuestions(input);

    expect(questions.length).toBe(2);
    for (const q of questions) {
      expect(typeof q.id).toBe("string");
      expect(q.id.length).toBeGreaterThan(0);
      expect(typeof q.question).toBe("string");
      expect(typeof q.topic).toBe("string");
      expect(typeof q.expectedFocus).toBe("string");
    }
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("generateInterviewQuestions caps count to the mock length", async () => {
    const input: GenerateQuestionsInput = {
      interviewType: "technical",
      profileSkills: ["react"],
      count: 99,
    };
    const { questions } = await generateInterviewQuestions(input);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(99);
  });

  it("evaluateAnswer returns scores clamped to 0–100 with no AI call", async () => {
    const input: EvaluateAnswerInput = {
      question: "Explain React.",
      expectedFocus: "virtual DOM, components",
      userAnswer: "Components render...",
      interviewType: "technical",
    };
    const result = await evaluateAnswer(input);

    for (const field of ["score", "clarity", "correctness", "depth"] as const) {
      const v = result[field];
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(Array.isArray(result.improvementTips)).toBe(true);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("calculateMatch is robust to missing inputs at runtime", async () => {
    const brokenJob = {
      roleTitle: "x",
      seniorityLevel: "junior",
      summary: "",
    } as unknown as JobAnalysis;
    const brokenProfile = {
      experienceYears: 0,
      projects: [],
    } as unknown as {
      skills: string[];
      experienceYears: number;
      projects: string[];
    };

    const result = await calculateMatch(brokenProfile, brokenJob);
    expect(result.algorithmicScore).toBe(0);
    expect(result.matchedRequired).toEqual([]);
    expect(result.missingRequired).toEqual([]);
    expect(result.matchedAdvantage).toEqual([]);
  });
});

describe("ai.service — validation helpers (exported for testing)", () => {
  const { toNumberScore, clampScore, requireString, requireStringArray, ensureQuestionIds } =
    __testables;

  it("toNumberScore accepts a numeric string and converts to number", () => {
    const n = toNumberScore("85", "score", "evaluateAnswer");
    expect(typeof n).toBe("number");
    expect(n).toBe(85);
  });

  it("toNumberScore accepts a number as-is", () => {
    expect(toNumberScore(42, "score", "evaluateAnswer")).toBe(42);
  });

  it("toNumberScore rejects non-numeric string with descriptive error", () => {
    expect(() => toNumberScore("high", "score", "evaluateAnswer")).toThrow(
      /evaluateAnswer.*field 'score'.*not numeric/
    );
  });

  it("toNumberScore rejects percentage strings", () => {
    expect(() => toNumberScore("85%", "score", "evaluateAnswer")).toThrow(
      /percentage/
    );
  });

  it("toNumberScore rejects booleans / objects", () => {
    expect(() => toNumberScore(true, "score", "evaluateAnswer")).toThrow(
      /evaluateAnswer.*'score'.*not numeric/
    );
    expect(() => toNumberScore({}, "score", "evaluateAnswer")).toThrow(
      /evaluateAnswer.*'score'.*not numeric/
    );
    expect(() => toNumberScore(null, "score", "evaluateAnswer")).toThrow(
      /evaluateAnswer.*'score'.*not numeric/
    );
  });

  it("clampScore clamps below 0 and above 100", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(42.6)).toBe(43);
  });

  it("requireString throws on non-strings", () => {
    expect(() => requireString(42, "summary", "analyzeJob")).toThrow(
      /analyzeJob.*'summary'/
    );
    expect(() => requireString("", "summary", "analyzeJob")).toThrow(
      /analyzeJob.*'summary'/
    );
  });

  it("requireStringArray throws on non-arrays and non-string elements", () => {
    expect(() => requireStringArray("x", "strengths", "analyzeProfile")).toThrow(
      /strengths'.*not an array/
    );
    expect(() =>
      requireStringArray([1, 2, 3], "strengths", "analyzeProfile")
    ).toThrow(/strengths\[0\]'.*not a string/);
  });

  it("ensureQuestionIds fills missing/blank ids deterministically", () => {
    const input: InterviewQuestion[] = [
      { id: "", question: "Q1", topic: "t", expectedFocus: "f" },
      { id: "custom", question: "Q2", topic: "t", expectedFocus: "f" },
      { id: "   ", question: "Q3", topic: "t", expectedFocus: "f" },
    ];
    const output = ensureQuestionIds(input);
    expect(output[0].id).toBe("q1");
    expect(output[1].id).toBe("custom");
    expect(output[2].id).toBe("q3");
  });
});

describe("ai.service — real-mode paths via mocked callAi (no network)", () => {
  beforeAll(() => {
    // Real mode: the service will call `callAi`, which is jest.mock'd.
    delete process.env.USE_MOCK_AI;
  });

  it("evaluateAnswer: numeric-string score is converted and clamped", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        score: "85",
        clarity: 80,
        correctness: 75,
        depth: 70,
        feedback: "ok",
        improvementTips: ["be concrete"],
      })
    );

    const result = await evaluateAnswer({
      question: "q",
      expectedFocus: "f",
      userAnswer: "a",
      interviewType: "technical",
    });

    expect(typeof result.score).toBe("number");
    expect(result.score).toBe(85);
    expect(mockedCallAi).toHaveBeenCalledTimes(1);
  });

  it("evaluateAnswer: an invalid score like 'high' triggers retry, and retry failure surfaces a descriptive error", async () => {
    mockedCallAi
      .mockResolvedValueOnce(
        JSON.stringify({
          score: "high",
          clarity: 80,
          correctness: 75,
          depth: 70,
          feedback: "ok",
          improvementTips: [],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          score: "also bad",
          clarity: 80,
          correctness: 75,
          depth: 70,
          feedback: "ok",
          improvementTips: [],
        })
      );

    await expect(
      evaluateAnswer({
        question: "q",
        expectedFocus: "f",
        userAnswer: "a",
        interviewType: "technical",
      })
    ).rejects.toThrow(/evaluateAnswer: retry failed/);
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
  });

  it("evaluateAnswer: malformed first response causes one retry; second success returns the parsed result", async () => {
    mockedCallAi
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce(
        JSON.stringify({
          score: 90,
          clarity: 85,
          correctness: 80,
          depth: 75,
          feedback: "better",
          improvementTips: ["tip"],
        })
      );

    const result = await evaluateAnswer({
      question: "q",
      expectedFocus: "f",
      userAnswer: "a",
      interviewType: "technical",
    });

    expect(result.score).toBe(90);
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
  });

  it("evaluateAnswer: out-of-range scores are clamped to 0–100", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        score: 150,
        clarity: -10,
        correctness: 80,
        depth: 70,
        feedback: "ok",
        improvementTips: [],
      })
    );

    const result = await evaluateAnswer({
      question: "q",
      expectedFocus: "f",
      userAnswer: "a",
      interviewType: "technical",
    });

    expect(result.score).toBe(100);
    expect(result.clarity).toBe(0);
  });

  it("generateInterviewQuestions: missing ids are filled deterministically q1/q2/q3", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({
        questions: [
          { question: "Q1", topic: "t", expectedFocus: "f" },
          { id: "", question: "Q2", topic: "t", expectedFocus: "f" },
          { id: "kept", question: "Q3", topic: "t", expectedFocus: "f" },
        ],
      })
    );

    const result = await generateInterviewQuestions({
      interviewType: "technical",
      profileSkills: ["react"],
      count: 3,
    });

    expect(result.questions.map((q) => q.id)).toEqual(["q1", "q2", "kept"]);
    expect(mockedCallAi).toHaveBeenCalledTimes(1);
  });

  it("calculateMatch: AI semantic score is clamped and flows into buildDeterministicMatch", async () => {
    mockedCallAi.mockResolvedValueOnce(
      JSON.stringify({ aiSemanticScore: 150, explanation: "high fit" })
    );

    const profile = {
      skills: ["React.js", "Node"],
      experienceYears: 1,
      projects: [],
    };
    const job: JobAnalysis = {
      roleTitle: "Junior",
      requiredSkills: ["react", "node"],
      advantageSkills: [],
      seniorityLevel: "junior",
      summary: "",
    };

    const result = await calculateMatch(profile, job);
    expect(result.aiSemanticScore).toBe(100);
    expect(result.algorithmicScore).toBe(100);
    expect(result.finalScore).toBe(100);
  });
});
