import type { AnswerEvaluation, InterviewQuestion } from "../types/interview";

export const staticInterviewQuestions: InterviewQuestion[] = [
  {
    id: "q1",
    question:
      "How does React decide which components to re-render when state changes, and how would you debug an unnecessary re-render?",
    topic: "react",
    expectedFocus:
      "virtual DOM reconciliation, memoization (React.memo / useMemo / useCallback), and profiling with React DevTools.",
  },
  {
    id: "q2",
    question:
      "Design a Node + MongoDB endpoint that returns a user's recent orders. What indexes would you add and why?",
    topic: "node-mongodb",
    expectedFocus:
      "async/await, error handling, query shape, compound index on (userId, createdAt), pagination.",
  },
  {
    id: "q3",
    question:
      "Explain the difference between `unknown` and `any` in TypeScript and when you would prefer one over the other.",
    topic: "typescript",
    expectedFocus:
      "type safety, narrowing required before use with `unknown`, escape-hatch nature of `any`, boundary validation.",
  },
  {
    id: "q4",
    question:
      "In an Express API, how would you handle an unexpected error thrown inside an async route handler, and how would you distinguish between client-facing errors and internal errors in the response?",
    topic: "backend-error-handling",
    expectedFocus:
      "async error propagation (try/catch or express-async-errors), centralized error middleware, mapping error classes to HTTP status codes, not leaking stack traces, and consistent JSON error shape.",
  },
  {
    id: "q5",
    question:
      "Tell me about a time you disagreed with a teammate about a technical decision. How did you handle it, and what was the outcome?",
    topic: "behavioral",
    expectedFocus:
      "STAR-style structure, specific context and action, evidence of listening and compromise, focus on the decision process rather than blame, and a concrete outcome with a lesson learned.",
  },
];

const staticEvaluationsByQuestionId: Record<string, AnswerEvaluation> = {
  q1: {
    score: 82,
    clarity: 84,
    correctness: 80,
    depth: 76,
    feedback:
      "You explained reconciliation and props/state updates in a way that sounds accurate. Mentioning React DevTools or a concrete profiling step would strengthen correctness and depth.",
    improvementTips: [
      "Name one specific signal in DevTools (e.g. why did this render?) you would check first.",
      "Contrast a legit re-render with a redundant one using a tiny example.",
      "Briefly note memoization trade-offs so the answer feels complete.",
    ],
  },
  q2: {
    score: 74,
    clarity: 76,
    correctness: 72,
    depth: 71,
    feedback:
      "The endpoint shape is on the right track. The answer would be stronger with an explicit compound index rationale and a pagination strategy tied to your query.",
    improvementTips: [
      "Spell out the exact compound index fields and sort direction.",
      "Add error handling for invalid userId or database failures.",
      "Mention limiting page size and cursors if the dataset grows.",
    ],
  },
  q3: {
    score: 88,
    clarity: 86,
    correctness: 90,
    depth: 82,
    feedback:
      "Clear distinction between unknown and any with attention to narrowing. Adding one boundary-validation example would make it interview-complete.",
    improvementTips: [
      "Show a tiny narrowing pattern (typeof / Zod / schema parse) after unknown.",
      "Say when any is acceptable (e.g. incremental migration) and the risk.",
      "Close by linking back to safer patterns for public API boundaries.",
    ],
  },
  q4: {
    score: 71,
    clarity: 73,
    correctness: 70,
    depth: 68,
    feedback:
      "You touched on async errors, but the story would be sharper with centralized middleware and a clear rule for 4xx vs 5xx without leaking internals.",
    improvementTips: [
      "Describe wrapping async handlers or using a helper so rejections surface.",
      "Give an example JSON error shape shared across routes.",
      "Explicitly say stack traces stay server-side only.",
    ],
  },
  q5: {
    score: 79,
    clarity: 81,
    correctness: 77,
    depth: 74,
    feedback:
      "Good interpersonal tone and some structure. Make the STAR beats explicit and quantify the outcome so behavioral depth reads stronger.",
    improvementTips: [
      "Label situation, task, action, result in one sentence each.",
      "Include one concrete artifact (design doc, metric, rollout) from the story.",
      "End with what you would do differently next time.",
    ],
  },
};

const fallbackEvaluation: AnswerEvaluation = {
  score: 78,
  clarity: 80,
  correctness: 75,
  depth: 70,
  feedback:
    "A solid answer that covers the core mechanics clearly and is mostly accurate. The explanation would benefit from a concrete example and a brief mention of trade-offs or edge cases, which would push the depth score higher.",
  improvementTips: [
    "Add a short, concrete code or real-world example to ground the explanation.",
    "Call out at least one trade-off or failure mode to demonstrate depth.",
    "Tie the answer back to the question's expected focus explicitly in the closing sentence.",
  ],
};

export async function evaluateAnswerStatic(
  questionId: string,
  _userAnswer: string,
): Promise<AnswerEvaluation> {
  await new Promise((r) => setTimeout(r, 300));
  return (
    staticEvaluationsByQuestionId[questionId] ?? fallbackEvaluation
  );
}
