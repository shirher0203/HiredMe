/**
 * Tests for summarizeInterviewAttempt.
 *
 * All tests either run with USE_MOCK_AI=true or stub `callAi` via jest.mock,
 * so no real network I/O is ever attempted.
 */

jest.mock("../../services/ai/ai.client", () => ({
  callAi: jest.fn(),
  getActiveModelName: jest.fn(() => "gemini-test-model"),
  isApiKeyConfigured: jest.fn(() => true),
}));

import { callAi } from "../../services/ai/ai.client";
import { summarizeInterviewAttempt } from "../../services/ai/ai.service";
import { mockInterviewAttemptSummary } from "../../services/ai/mock-ai.responses";
import type {
  AnswerEvaluation,
  AttemptAnswerInput,
  InterviewAttemptSummary,
  SummarizeAttemptInput,
} from "../../services/ai/ai.types";

const mockedCallAi = callAi as unknown as jest.Mock;

function evaluation(score: number, overrides: Partial<AnswerEvaluation> = {}): AnswerEvaluation {
  return {
    score,
    clarity: 75,
    correctness: 75,
    depth: 70,
    feedback: "Solid answer.",
    improvementTips: ["Add a concrete example.", "Mention a trade-off."],
    ...overrides,
  };
}

function answer(
  i: number,
  score: number,
  overrides: Partial<AttemptAnswerInput> = {}
): AttemptAnswerInput {
  return {
    questionId: `q${i}`,
    question: `Q${i}: how does the candidate describe a key concept?`,
    userAnswer: `Sample answer ${i} that is long enough to look real.`,
    evaluation: evaluation(score),
    ...overrides,
  };
}

function defaultInput(): SummarizeAttemptInput {
  return {
    interviewType: "technical",
    answers: [answer(1, 80), answer(2, 70), answer(3, 60)],
    jobTitle: "Junior Full-Stack Developer",
    profileSkills: ["react", "node", "typescript"],
  };
}

function validPayload(): Record<string, unknown> {
  return {
    summary:
      "Across the technical session the candidate demonstrated a consistent baseline on React, Node and TypeScript with concrete examples and steady pacing.",
    overallScore: 74,
    preserve_points: [
      "Keep grounding explanations with concrete code examples.",
      "Maintain the calm and structured pacing.",
    ],
    improve_points: [
      "Push each answer one layer deeper with a trade-off or failure mode.",
      "Tie each answer back to the question's expected focus in the closing sentence.",
    ],
    topics_covered: ["react", "node", "typescript", "error-handling"],
    overall_feedback:
      "A well-rounded junior performance — close the depth gap to push the score higher.",
  };
}

describe("summarizeInterviewAttempt — mock mode", () => {
  let originalUseMock: string | undefined;

  beforeAll(() => {
    originalUseMock = process.env.USE_MOCK_AI;
    process.env.USE_MOCK_AI = "true";
  });

  afterAll(() => {
    if (originalUseMock === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = originalUseMock;
  });

  beforeEach(() => {
    mockedCallAi.mockReset();
  });

  it("returns the mock shape", async () => {
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.summary).toBe(mockInterviewAttemptSummary.summary);
    expect(result.preserve_points).toEqual(mockInterviewAttemptSummary.preserve_points);
    expect(result.improve_points).toEqual(mockInterviewAttemptSummary.improve_points);
    expect(result.topics_covered).toEqual(mockInterviewAttemptSummary.topics_covered);
    expect(result.overall_feedback).toBe(mockInterviewAttemptSummary.overall_feedback);
  });

  it("does not invoke callAi in mock mode", async () => {
    await summarizeInterviewAttempt(defaultInput());
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("overallScore comes from the input when provided", async () => {
    const result = await summarizeInterviewAttempt({
      ...defaultInput(),
      overallScore: 73,
    });
    expect(result.overallScore).toBe(73);
  });

  it("overallScore is the rounded average of evaluation.score when input has no override", async () => {
    const result = await summarizeInterviewAttempt({
      interviewType: "technical",
      answers: [answer(1, 80), answer(2, 70), answer(3, 60)],
    });
    expect(result.overallScore).toBe(70);
  });

  it("overallScore is clamped to [0, 100]", async () => {
    const high = await summarizeInterviewAttempt({
      ...defaultInput(),
      overallScore: 150,
    });
    expect(high.overallScore).toBe(100);
    const low = await summarizeInterviewAttempt({
      ...defaultInput(),
      overallScore: -10,
    });
    expect(low.overallScore).toBe(0);
  });
});

describe("summarizeInterviewAttempt — synchronous input validation", () => {
  let originalUseMock: string | undefined;

  beforeAll(() => {
    originalUseMock = process.env.USE_MOCK_AI;
    process.env.USE_MOCK_AI = "false";
  });

  afterAll(() => {
    if (originalUseMock === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = originalUseMock;
  });

  beforeEach(() => {
    mockedCallAi.mockReset();
  });

  it("rejects an empty answers array", async () => {
    await expect(
      summarizeInterviewAttempt({
        interviewType: "technical",
        answers: [],
      })
    ).rejects.toThrow(/answers must be a non-empty array/);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("rejects an invalid interviewType", async () => {
    await expect(
      summarizeInterviewAttempt({
        // @ts-expect-error — runtime guard
        interviewType: "panel",
        answers: [answer(1, 80)],
      })
    ).rejects.toThrow(/interviewType must be one of \[hr, technical\]/);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("rejects an answer with an empty userAnswer", async () => {
    await expect(
      summarizeInterviewAttempt({
        interviewType: "technical",
        answers: [{ ...answer(1, 80), userAnswer: "" }],
      })
    ).rejects.toThrow(/answers\[0\]\.userAnswer must be a non-empty string/);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("rejects an answer missing the evaluation object", async () => {
    await expect(
      summarizeInterviewAttempt({
        interviewType: "technical",
        // @ts-expect-error — runtime guard
        answers: [{ ...answer(1, 80), evaluation: undefined }],
      })
    ).rejects.toThrow(/evaluation must be an object/);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });

  it("rejects an evaluation with a non-numeric score", async () => {
    await expect(
      summarizeInterviewAttempt({
        interviewType: "technical",
        answers: [
          {
            ...answer(1, 80),
            // @ts-expect-error — runtime guard
            evaluation: { ...evaluation(80), score: "high" },
          },
        ],
      })
    ).rejects.toThrow(/evaluation\.score must be a finite number/);
    expect(mockedCallAi).not.toHaveBeenCalled();
  });
});

describe("summarizeInterviewAttempt — real-mode validation", () => {
  let originalUseMock: string | undefined;

  beforeAll(() => {
    originalUseMock = process.env.USE_MOCK_AI;
    process.env.USE_MOCK_AI = "false";
  });

  afterAll(() => {
    if (originalUseMock === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = originalUseMock;
  });

  beforeEach(() => {
    mockedCallAi.mockReset();
  });

  it("parses a valid response into InterviewAttemptSummary", async () => {
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(validPayload()));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.summary.length).toBeGreaterThanOrEqual(50);
    expect(result.preserve_points.length).toBeGreaterThanOrEqual(1);
    expect(result.improve_points.length).toBeGreaterThanOrEqual(1);
    expect(result.topics_covered).toEqual(["react", "node", "typescript", "error-handling"]);
  });

  it("retries when the first response omits a required key, then succeeds", async () => {
    const bad = validPayload();
    delete (bad as Record<string, unknown>).summary;
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(validPayload()));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(mockedCallAi).toHaveBeenCalledTimes(2);
    expect(result.summary.length).toBeGreaterThanOrEqual(50);
  });

  it("throws when both attempts are missing a required key", async () => {
    const bad = validPayload();
    delete (bad as Record<string, unknown>).overall_feedback;
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(bad));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /summarizeInterviewAttempt: retry failed/
    );
  });

  it("rejects when summary is shorter than 50 chars (after retry)", async () => {
    const bad = validPayload();
    (bad as Record<string, unknown>).summary = "too short";
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(bad));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /field 'summary' must be 50-800 chars/
    );
  });

  it("rejects when summary is longer than 800 chars (after retry)", async () => {
    const bad = validPayload();
    (bad as Record<string, unknown>).summary = "x".repeat(801);
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(bad));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /field 'summary' must be 50-800 chars/
    );
  });

  it("rejects when overall_feedback is out of range", async () => {
    const bad = validPayload();
    (bad as Record<string, unknown>).overall_feedback = "short.";
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(bad));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /field 'overall_feedback' must be 20-300 chars/
    );
  });

  it("rejects when preserve_points has zero valid entries (after retry)", async () => {
    const bad = validPayload();
    (bad as Record<string, unknown>).preserve_points = ["", "  "];
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(bad));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /preserve_points/
    );
  });

  it("trims preserve_points to 2 when AI returns more than 2", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).preserve_points = [
      "First valid suggestion that is long enough.",
      "Second valid suggestion that is long enough.",
      "Third valid suggestion that is long enough.",
      "Fourth valid suggestion that is long enough.",
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.preserve_points.length).toBe(2);
  });

  it("trims improve_points to 2 when AI returns more than 2", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).improve_points = [
      "First improvement that is long enough.",
      "Second improvement that is long enough.",
      "Third improvement that is long enough.",
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.improve_points.length).toBe(2);
  });

  it("topics_covered are lowercased, deduped, and capped at 15", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).topics_covered = [
      "React",
      "react",
      "Node",
      ...Array.from({ length: 20 }, (_, i) => `topic-${i}`),
    ];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.topics_covered.length).toBe(15);
    expect(result.topics_covered[0]).toBe("react");
    expect(result.topics_covered.filter((t) => t === "react").length).toBe(1);
    for (const t of result.topics_covered) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  it("empty topics_covered array is allowed", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).topics_covered = [];
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt(defaultInput());
    expect(result.topics_covered).toEqual([]);
  });

  it("AI overallScore is overridden by computed average when input has no override", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).overallScore = 10;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt({
      interviewType: "technical",
      answers: [answer(1, 80), answer(2, 70), answer(3, 60)],
    });
    expect(result.overallScore).toBe(70);
  });

  it("input.overallScore wins over both AI value and computed average", async () => {
    const ok = validPayload();
    (ok as Record<string, unknown>).overallScore = 10;
    mockedCallAi.mockResolvedValueOnce(JSON.stringify(ok));
    const result = await summarizeInterviewAttempt({
      ...defaultInput(),
      overallScore: 88,
    });
    expect(result.overallScore).toBe(88);
  });

  it("rejects when the AI returns a non-object", async () => {
    mockedCallAi
      .mockResolvedValueOnce(JSON.stringify(["not", "an", "object"]))
      .mockResolvedValueOnce(JSON.stringify(["still", "wrong"]));
    await expect(summarizeInterviewAttempt(defaultInput())).rejects.toThrow(
      /top-level value is not an object/
    );
  });
});

describe("InterviewAttemptSummary mock invariants", () => {
  it("mockInterviewAttemptSummary satisfies the documented bounds", () => {
    const m: InterviewAttemptSummary = mockInterviewAttemptSummary;
    expect(m.summary.length).toBeGreaterThanOrEqual(50);
    expect(m.summary.length).toBeLessThanOrEqual(800);
    expect(m.overall_feedback.length).toBeGreaterThanOrEqual(20);
    expect(m.overall_feedback.length).toBeLessThanOrEqual(300);
    expect(m.preserve_points.length).toBeGreaterThanOrEqual(1);
    expect(m.preserve_points.length).toBeLessThanOrEqual(2);
    expect(m.improve_points.length).toBeGreaterThanOrEqual(1);
    expect(m.improve_points.length).toBeLessThanOrEqual(2);
    expect(m.overallScore).toBeGreaterThanOrEqual(0);
    expect(m.overallScore).toBeLessThanOrEqual(100);
    for (const t of m.topics_covered) {
      expect(t).toBe(t.toLowerCase());
    }
  });
});
