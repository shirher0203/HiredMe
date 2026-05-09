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
  ResumeAwareSemanticMatchAiResponse,
} from "./ai.types";
import type { JobAnalysis } from "../matching/matching.types";
import type { ParsedResume } from "./parsed-resume.types";

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

export const mockResumeAwareSemanticMatch: ResumeAwareSemanticMatchAiResponse = {
  aiSemanticScore: 74,
  explanation:
    "Solid overlap on the core stack; project work demonstrates the required technologies end-to-end.",
  educationFit:
    "BSc in Computer Science from Tel Aviv University aligns with the junior requirement.",
  experienceFit:
    "One year of hands-on full-stack work matches the 0-2 years target window.",
  projectFit:
    "The HiredMe project exercises React, Node, MongoDB and TypeScript together — direct evidence for every required skill.",
  languageFit: "English fluency covers the team's working language.",
  resumeInsights: [
    "Project portfolio compensates for the short formal work history.",
    "No explicit Docker / AWS exposure despite them being advantage skills.",
  ],
  matchingEvidence: [
    "Acme Labs internal dashboard built with React + TypeScript.",
    "HiredMe project uses React, Node, MongoDB and TypeScript end-to-end.",
  ],
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

export const mockParsedResume: ParsedResume = {
  raw_text_hash: "",
  personal_info: {
    full_name: "Dana Levi",
    email: "dana.levi@example.com",
    phone: "+972-50-123-4567",
    location: "Tel Aviv, Israel",
    linkedin_url: "https://www.linkedin.com/in/dana-levi",
    portfolio_or_github_url: "https://github.com/dana-levi",
  },
  professional_summary:
    "Junior full-stack developer with one year of hands-on experience building React and Node services on a MongoDB-backed stack.",
  work_experience: [
    {
      company_name: "Acme Labs",
      job_title: "Junior Full-Stack Developer",
      start_date: "2024-07",
      end_date: "present",
      location: "Tel Aviv, Israel",
      responsibilities: [
        "Built React components with TypeScript for the internal admin dashboard.",
        "Implemented REST endpoints in Node and Express backed by MongoDB.",
      ],
      achievements: [
        "Reduced dashboard load time by 40% by memoizing heavy list views.",
      ],
    },
  ],
  education: [
    {
      institution_name: "Tel Aviv University",
      degree_type: "BSc",
      field_of_study: "Computer Science",
      start_date: "2021-10",
      end_date: "2024-07",
    },
  ],
  skills: {
    technical_skills: ["react", "node", "typescript", "mongodb"],
    soft_skills: ["communication", "ownership"],
    tools_and_software: ["git", "docker", "vscode"],
  },
  projects: [
    {
      project_name: "HiredMe",
      description:
        "Final project: an AI-powered platform that matches profiles to jobs and simulates interviews.",
      technologies_used: ["react", "node", "mongodb", "typescript"],
      link: "https://github.com/shirher0203/HiredMe",
    },
  ],
  languages: [
    { language: "Hebrew", proficiency_level: "native" },
    { language: "English", proficiency_level: "fluent" },
  ],
  certifications: [],
  awards: [],
  parsed_metadata: {
    language_detected: "en",
    years_of_experience_estimate: 1,
  },
};

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
