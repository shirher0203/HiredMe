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
  HomeAssignmentEvaluation,
  GithubRepoAnalysis,
  InterviewAttemptSummary,
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
  toolsMentioned: ["git", "jira"],
  impliedSkills: ["rest", "javascript"],
  nonSkillRequirements: [
    "1+ years of experience",
    "BSc in Computer Science or equivalent",
    "Strong communication skills",
  ],
  skillRelations: {
    react: ["javascript", "next", "jsx"],
    node: ["express", "javascript"],
    mongodb: ["nosql", "mongoose"],
    typescript: ["javascript"],
    docker: ["kubernetes", "containers"],
    aws: ["cloud", "google-cloud-platform"],
  },
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
  suggested_skills: [
    { skill: "redux", reason: "common state management for React applications.", confidence: 92 },
    { skill: "react-query", reason: "standard data fetching layer paired with React + Node APIs.", confidence: 90 },
    { skill: "next", reason: "production React framework on top of the React ecosystem.", confidence: 88 },
    { skill: "express", reason: "default Node web framework given Node + REST experience.", confidence: 88 },
    { skill: "rest", reason: "implied by Node + MongoDB CRUD endpoints in the work experience.", confidence: 87 },
    { skill: "graphql", reason: "frequently paired with React/Node stacks for typed APIs.", confidence: 80 },
    { skill: "jest", reason: "standard JavaScript / TypeScript unit testing tool.", confidence: 86 },
    { skill: "vitest", reason: "modern Vite-friendly alternative to Jest.", confidence: 70 },
    { skill: "react-testing-library", reason: "standard React component testing library.", confidence: 80 },
    { skill: "playwright", reason: "common end-to-end testing tool for React apps.", confidence: 72 },
    { skill: "cypress", reason: "alternative end-to-end testing tool for web frontends.", confidence: 68 },
    { skill: "tailwind", reason: "popular utility-first CSS framework alongside React.", confidence: 78 },
    { skill: "sass", reason: "common CSS preprocessor in React projects.", confidence: 70 },
    { skill: "css", reason: "implied by frontend dashboard work.", confidence: 90 },
    { skill: "html", reason: "implied by frontend dashboard work.", confidence: 90 },
    { skill: "javascript", reason: "TypeScript users invariably know JavaScript.", confidence: 95 },
    { skill: "nestjs", reason: "popular Node framework layered on top of Express.", confidence: 65 },
    { skill: "npm", reason: "implied by Node project work.", confidence: 92 },
    { skill: "yarn", reason: "common Node package manager alternative.", confidence: 70 },
    { skill: "webpack", reason: "common React bundler still in widespread use.", confidence: 70 },
    { skill: "vite", reason: "modern React bundler increasingly common in new projects.", confidence: 75 },
    { skill: "eslint", reason: "standard linting tool in TypeScript / React projects.", confidence: 88 },
    { skill: "prettier", reason: "standard code formatter in TypeScript / React projects.", confidence: 88 },
    { skill: "github-actions", reason: "common CI tool for GitHub-hosted projects.", confidence: 75 },
    { skill: "ci-cd", reason: "implied by deploying a dashboard to internal users.", confidence: 70 },
    { skill: "docker-compose", reason: "natural extension of Docker tooling for local dev.", confidence: 78 },
    { skill: "kubernetes", reason: "common deployment target once Docker is in play.", confidence: 60 },
    { skill: "aws", reason: "frequent hosting target for Node + MongoDB stacks.", confidence: 65 },
    { skill: "gcp", reason: "alternative cloud provider often paired with Node services.", confidence: 50 },
    { skill: "vercel", reason: "common host for React / Next deployments.", confidence: 70 },
    { skill: "netlify", reason: "common host for React deployments.", confidence: 65 },
    { skill: "linux", reason: "implied by Docker and Node server work.", confidence: 80 },
    { skill: "bash", reason: "implied by typical Node + Docker development workflow.", confidence: 75 },
    { skill: "postgresql", reason: "common SQL alternative when working with MongoDB stacks.", confidence: 55 },
    { skill: "redis", reason: "common caching layer alongside Node + MongoDB.", confidence: 60 },
    { skill: "mongoose", reason: "default Node ODM for MongoDB.", confidence: 90 },
    { skill: "jwt", reason: "standard auth approach for Node + REST stacks.", confidence: 80 },
    { skill: "oauth", reason: "common auth integration for dashboard apps.", confidence: 65 },
    { skill: "passport", reason: "common Node auth middleware.", confidence: 60 },
    { skill: "openapi", reason: "common API contract format paired with Node services.", confidence: 60 },
    { skill: "swagger", reason: "common OpenAPI tooling for Node APIs.", confidence: 65 },
    { skill: "axios", reason: "common HTTP client in React / Node ecosystems.", confidence: 78 },
    { skill: "fetch-api", reason: "native browser API used in modern React apps.", confidence: 82 },
    { skill: "websockets", reason: "common feature in dashboards that show live data.", confidence: 55 },
    { skill: "mvc", reason: "implied by the controller / service / model split.", confidence: 65 },
    { skill: "agile", reason: "ubiquitous in junior dev environments.", confidence: 80 },
    { skill: "scrum", reason: "ubiquitous in junior dev environments.", confidence: 75 },
    { skill: "jira", reason: "common project tracking tool in agile teams.", confidence: 70 },
    { skill: "figma", reason: "common design handoff tool for frontend developers.", confidence: 65 },
    { skill: "storybook", reason: "common React component documentation tool.", confidence: 60 },
    { skill: "json", reason: "implied by REST API work.", confidence: 90 },
  ],
};

export const mockHomeAssignmentEvaluation: HomeAssignmentEvaluation = {
  score: 82,
  summary:
    "A clean, working solution that solves the core problem correctly with readable, well-structured code. It would benefit from input validation and a few edge-case tests to be production-ready.",
  strengths: [
    "Correct core logic with clear, descriptive naming.",
    "Good function decomposition and consistent formatting.",
  ],
  improvements: [
    "Add input validation and explicit error handling for malformed input.",
    "Cover edge cases with unit tests (empty input, large values).",
  ],
};

export const mockGithubRepoAnalysis: GithubRepoAnalysis = {
  architectureSummary:
    "A small full-stack TypeScript project with a clear client/server split. The backend follows an MVC-with-service-layer structure and the code is organized into controllers, services, and models.",
  codeQualityScore: 80,
  strengths: [
    "Clear separation of concerns between controllers and services.",
    "Consistent TypeScript usage with typed models.",
  ],
  concerns: [
    "Limited automated test coverage on some modules.",
    "A few endpoints lack input validation.",
  ],
  detectedStack: ["typescript", "node", "express", "react", "mongodb"],
};

export const mockInterviewAttemptSummary: InterviewAttemptSummary = {
  summary:
    "Across the technical session the candidate showed solid grounding in React and Node fundamentals and was able to walk through reconciliation, async error handling, and TypeScript narrowing with concrete examples. Depth was the weakest dimension — answers were correct but rarely went into trade-offs, alternative designs, or failure modes. Pacing and clarity were consistent throughout.",
  overallScore: 76,
  preserve_points: [
    "Continue using small, concrete code examples to ground each explanation.",
    "Keep the calm pacing and structured framing — it makes the answers easy to follow.",
  ],
  improve_points: [
    "Push answers one layer deeper: name a trade-off, failure mode, or alternative design after the main explanation.",
    "Tie each answer back to the question's expected focus in the closing sentence.",
  ],
  topics_covered: [
    "react",
    "node",
    "typescript",
    "mongodb",
    "error-handling",
    "behavioral",
  ],
  overall_feedback:
    "A well-rounded junior-level performance. Closing the depth gap by routinely calling out a trade-off or edge case would meaningfully raise the score.",
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
