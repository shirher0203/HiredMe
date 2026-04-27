// Public surface for Role 4.
//
// This file is what Role 3 (Backend) calls from controllers. It wires
// prompts + the AI client wrapper + safe JSON parsing + validation +
// deterministic matching. In USE_MOCK_AI=true mode it short-circuits to
// the mock constants — no network I/O.
//
// All AI output is treated as untrusted. `parseJsonFromAi` is tolerant;
// the validators here are strict; final match scores are computed by
// deterministic code, never taken from the model.

import "dotenv/config";

import type {
  ProfileInput,
  JobAnalysis,
  MatchAnalysis,
} from "../matching/matching.types";
import type {
  ProfileAnalysis,
  InterviewQuestion,
  AnswerEvaluation,
  GenerateQuestionsInput,
  EvaluateAnswerInput,
  SemanticMatchAiResponse,
} from "./ai.types";

import { callAi } from "./ai.client";
import { parseJsonFromAi } from "../../utils/safe-json";
import {
  buildAnalyzeJobPrompt,
  buildSemanticMatchPrompt,
  buildGenerateQuestionsPrompt,
  buildEvaluateAnswerPrompt,
} from "./prompts";
import { buildDeterministicMatch } from "../matching/matching.service";
import {
  mockProfileAnalysis,
  mockJobAnalysis,
  mockSemanticMatch,
  mockInterviewQuestions,
  mockAnswerEvaluation,
} from "./mock-ai.responses";

// ---------------------------------------------------------------------------
// Helpers (internal — do not export beyond this file)
// ---------------------------------------------------------------------------

function isMockMode(): boolean {
  return process.env.USE_MOCK_AI === "true";
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function toNumberScore(
  value: unknown,
  fieldName: string,
  functionName: string
): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${functionName}: field '${fieldName}' is not numeric (received non-finite number)`
      );
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error(
        `${functionName}: field '${fieldName}' is not numeric (received empty string)`
      );
    }
    if (trimmed.endsWith("%")) {
      throw new Error(
        `${functionName}: field '${fieldName}' must not be a percentage string (received ${JSON.stringify(
          value
        )})`
      );
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `${functionName}: field '${fieldName}' is not numeric (received ${JSON.stringify(
          value
        )})`
      );
    }
    return parsed;
  }
  throw new Error(
    `${functionName}: field '${fieldName}' is not numeric (received ${typeof value})`
  );
}

function requireString(
  value: unknown,
  fieldName: string,
  functionName: string
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${functionName}: field '${fieldName}' is not a non-empty string`
    );
  }
  return value;
}

function requireStringArray(
  value: unknown,
  fieldName: string,
  functionName: string
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${functionName}: field '${fieldName}' is not an array`
    );
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      throw new Error(
        `${functionName}: field '${fieldName}[${i}]' is not a string`
      );
    }
  }
  return value as string[];
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
  functionName: string
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(
      `${functionName}: field '${fieldName}' must be one of [${allowed.join(
        ", "
      )}] (received ${JSON.stringify(value)})`
    );
  }
  return value as T;
}

function ensureQuestionIds(
  questions: InterviewQuestion[]
): InterviewQuestion[] {
  return questions.map((q, i) => {
    if (!q.id || q.id.trim() === "") {
      return { ...q, id: `q${i + 1}` };
    }
    return q;
  });
}

const RETRY_SUFFIX =
  "\n\nYour previous response was invalid. Return ONLY valid JSON matching the exact schema. No markdown. No explanations. No extra fields.";

/**
 * Single-retry helper for AI calls.
 *
 * Retry policy (per PROJECT_PLAN_ROLE4.md):
 *   - The first `callAi` call is NOT retried — transport / config errors
 *     (e.g. missing GEMINI_API_KEY) bubble up as-is.
 *   - Only parse / validation failures trigger a retry, with a stricter
 *     follow-up prompt.
 *   - At most one retry. If the retry also fails, throw a descriptive
 *     error naming the function.
 */
async function withOneRetry<T>(
  functionName: string,
  prompt: string,
  parseAndValidate: (raw: string) => T
): Promise<T> {
  const rawFirst = await callAi(prompt);
  try {
    return parseAndValidate(rawFirst);
  } catch (firstErr) {
    const rawRetry = await callAi(prompt + RETRY_SUFFIX);
    try {
      return parseAndValidate(rawRetry);
    } catch (retryErr) {
      const firstMsg =
        firstErr instanceof Error ? firstErr.message : String(firstErr);
      const retryMsg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(
        `${functionName}: retry failed — first error: ${firstMsg}; retry error: ${retryMsg}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Inline prompt for analyzeProfile (no builder in prompts.ts).
// Kept private — mirrors the style of prompts.ts without duplicating it.
// ---------------------------------------------------------------------------

function buildAnalyzeProfilePromptInline(profile: ProfileInput): string {
  const schema = `{
  "seniorityEstimate": "junior" | "mid" | "senior",
  "strengths": string[],
  "weaknesses": string[],
  "suggestedRoles": string[],
  "summary": string
}`;

  const header = [
    "You are a precise JSON API.",
    "Return ONLY valid JSON.",
    "Do not include explanations.",
    "Do not include markdown.",
    "Do not wrap the response in code fences.",
    "The response must be a single JSON object and nothing else.",
    "Do not return arrays as the root response.",
    "Do not add any fields beyond those specified in the schema.",
    "All string-array fields must contain strings only.",
  ].join("\n");

  const skillsLine =
    profile.skills.length === 0
      ? "Candidate skills: (none)"
      : `Candidate skills: ${profile.skills
          .map((s) => JSON.stringify(s))
          .join(", ")}`;

  const projectsLine =
    profile.projects.length === 0
      ? "Candidate projects: (none)"
      : `Candidate projects: ${profile.projects
          .map((p) => JSON.stringify(p))
          .join(", ")}`;

  const lines = [
    header,
    "",
    "Task: analyze the candidate profile below and produce a structured summary.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    `Experience years: ${profile.experienceYears}`,
    skillsLine,
    projectsLine,
  ];
  if (profile.education) {
    lines.push(`Education: ${profile.education}`);
  }
  if (profile.goals) {
    lines.push(`Goals: ${profile.goals}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Validators per target type
// ---------------------------------------------------------------------------

const SENIORITY_VALUES = ["junior", "mid", "senior"] as const;

function validateProfileAnalysis(raw: string): ProfileAnalysis {
  const fn = "analyzeProfile";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  return {
    seniorityEstimate: requireEnum(
      parsed.seniorityEstimate,
      SENIORITY_VALUES,
      "seniorityEstimate",
      fn
    ),
    strengths: requireStringArray(parsed.strengths, "strengths", fn),
    weaknesses: requireStringArray(parsed.weaknesses, "weaknesses", fn),
    suggestedRoles: requireStringArray(
      parsed.suggestedRoles,
      "suggestedRoles",
      fn
    ),
    summary: requireString(parsed.summary, "summary", fn),
  };
}

function validateJobAnalysis(raw: string): JobAnalysis {
  const fn = "analyzeJob";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  return {
    roleTitle: requireString(parsed.roleTitle, "roleTitle", fn),
    requiredSkills: requireStringArray(
      parsed.requiredSkills,
      "requiredSkills",
      fn
    ),
    advantageSkills: requireStringArray(
      parsed.advantageSkills,
      "advantageSkills",
      fn
    ),
    seniorityLevel: requireEnum(
      parsed.seniorityLevel,
      SENIORITY_VALUES,
      "seniorityLevel",
      fn
    ),
    summary: requireString(parsed.summary, "summary", fn),
  };
}

function validateSemanticMatch(raw: string): SemanticMatchAiResponse {
  const fn = "calculateMatch";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  const rawScore = toNumberScore(
    parsed.aiSemanticScore,
    "aiSemanticScore",
    fn
  );
  return {
    aiSemanticScore: clampScore(rawScore),
    explanation: requireString(parsed.explanation, "explanation", fn),
  };
}

function validateQuestions(raw: string): { questions: InterviewQuestion[] } {
  const fn = "generateInterviewQuestions";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  const questionsRaw = parsed.questions;
  if (!Array.isArray(questionsRaw)) {
    throw new Error(`${fn}: field 'questions' is not an array`);
  }

  const validated: InterviewQuestion[] = questionsRaw.map((q, i) => {
    if (typeof q !== "object" || q === null) {
      throw new Error(`${fn}: field 'questions[${i}]' is not an object`);
    }
    const obj = q as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : "";
    return {
      id,
      question: requireString(
        obj.question,
        `questions[${i}].question`,
        fn
      ),
      topic: requireString(obj.topic, `questions[${i}].topic`, fn),
      expectedFocus: requireString(
        obj.expectedFocus,
        `questions[${i}].expectedFocus`,
        fn
      ),
    };
  });

  return { questions: ensureQuestionIds(validated) };
}

function validateAnswerEvaluation(raw: string): AnswerEvaluation {
  const fn = "evaluateAnswer";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  return {
    score: clampScore(toNumberScore(parsed.score, "score", fn)),
    clarity: clampScore(toNumberScore(parsed.clarity, "clarity", fn)),
    correctness: clampScore(
      toNumberScore(parsed.correctness, "correctness", fn)
    ),
    depth: clampScore(toNumberScore(parsed.depth, "depth", fn)),
    feedback: requireString(parsed.feedback, "feedback", fn),
    improvementTips: requireStringArray(
      parsed.improvementTips,
      "improvementTips",
      fn
    ),
  };
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

export async function analyzeProfile(
  profile: ProfileInput
): Promise<ProfileAnalysis> {
  if (isMockMode()) {
    return mockProfileAnalysis;
  }
  const prompt = buildAnalyzeProfilePromptInline(profile);
  return withOneRetry<ProfileAnalysis>(
    "analyzeProfile",
    prompt,
    validateProfileAnalysis
  );
}

export async function analyzeJob(
  jobDescription: string
): Promise<JobAnalysis> {
  if (isMockMode()) {
    return mockJobAnalysis;
  }
  const prompt = buildAnalyzeJobPrompt({ jobDescription });
  return withOneRetry<JobAnalysis>(
    "analyzeJob",
    prompt,
    validateJobAnalysis
  );
}

export async function calculateMatch(
  profile: ProfileInput,
  jobAnalysis: JobAnalysis
): Promise<MatchAnalysis> {
  const profileSkills = profile?.skills ?? [];
  const requiredSkills = jobAnalysis?.requiredSkills ?? [];
  const advantageSkills = jobAnalysis?.advantageSkills ?? [];

  if (isMockMode()) {
    return buildDeterministicMatch(
      profileSkills,
      requiredSkills,
      advantageSkills,
      mockSemanticMatch.aiSemanticScore,
      mockSemanticMatch.explanation
    );
  }

  const prompt = buildSemanticMatchPrompt({
    profileSkills,
    requiredSkills,
    advantageSkills,
  });

  const semantic = await withOneRetry<SemanticMatchAiResponse>(
    "calculateMatch",
    prompt,
    validateSemanticMatch
  );

  return buildDeterministicMatch(
    profileSkills,
    requiredSkills,
    advantageSkills,
    semantic.aiSemanticScore,
    semantic.explanation
  );
}

export async function generateInterviewQuestions(
  input: GenerateQuestionsInput
): Promise<{ questions: InterviewQuestion[] }> {
  if (isMockMode()) {
    const sliced = mockInterviewQuestions.slice(0, Math.max(0, input.count));
    return { questions: ensureQuestionIds(sliced) };
  }

  const prompt = buildGenerateQuestionsPrompt({
    interviewType: input.interviewType,
    profileSkills: input.profileSkills,
    jobRequiredSkills: input.jobRequiredSkills,
    count: input.count,
    language: input.language,
  });

  return withOneRetry<{ questions: InterviewQuestion[] }>(
    "generateInterviewQuestions",
    prompt,
    validateQuestions
  );
}

export async function evaluateAnswer(
  input: EvaluateAnswerInput
): Promise<AnswerEvaluation> {
  if (isMockMode()) {
    return mockAnswerEvaluation;
  }

  const prompt = buildEvaluateAnswerPrompt({
    question: input.question,
    expectedFocus: input.expectedFocus,
    userAnswer: input.userAnswer,
    interviewType: input.interviewType,
  });

  return withOneRetry<AnswerEvaluation>(
    "evaluateAnswer",
    prompt,
    validateAnswerEvaluation
  );
}

// ---------------------------------------------------------------------------
// Exported for testing — internal helpers used by the mock test suite.
// Not part of the public backend contract.
// ---------------------------------------------------------------------------

export const __testables = {
  toNumberScore,
  clampScore,
  requireString,
  requireStringArray,
  ensureQuestionIds,
};
