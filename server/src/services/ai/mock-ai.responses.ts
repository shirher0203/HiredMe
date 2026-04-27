// Deterministic mock AI responses for USE_MOCK_AI=true.
//
// These constants stand in for real Gemini calls during development, demos,
// and automated tests. No randomness, no network I/O — the same values every
// time so the full flow (profile -> job -> match -> interview -> evaluation)
// can be exercised end-to-end without an API key.

import type {
  ProfileAnalysis,
  AnswerEvaluation,
  InterviewQuestion,
  SemanticMatchAiResponse,
} from "./ai.types";
import type { JobAnalysis } from "../matching/matching.types";

export const mockProfileAnalysis: ProfileAnalysis = {
  seniorityEstimate: "junior",
  strengths: ["react", "node", "typescript"],
  weaknesses: ["system design", "large-scale architecture"],
  suggestedRoles: [
    "Junior Full-Stack Developer",
    "Junior Frontend Developer",
  ],
  summary:
    "A junior full-stack developer comfortable building React + Node features with TypeScript. Still growing in system design and large-scale architecture decisions.",
};

export const mockJobAnalysis: JobAnalysis = {
  roleTitle: "Junior Full-Stack Developer",
  requiredSkills: ["react", "node", "mongodb", "typescript"],
  advantageSkills: ["docker", "aws"],
  seniorityLevel: "junior",
  summary:
    "Junior full-stack role building React and Node features on a MongoDB-backed TypeScript stack.",
};

export const mockSemanticMatch: SemanticMatchAiResponse = {
  aiSemanticScore: 72,
  explanation:
    "Strong semantic fit on React, Node, and TypeScript; MongoDB experience is implied but not demonstrated.",
};

export const mockInterviewQuestions: InterviewQuestion[] = [
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

export const mockAnswerEvaluation: AnswerEvaluation = {
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
