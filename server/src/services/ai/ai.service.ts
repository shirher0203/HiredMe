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
import { createHash } from "crypto";

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
  ResumeAwareSemanticMatchAiResponse,
  HomeAssignmentEvaluation,
  EvaluateHomeAssignmentInput,
  GithubRepoAnalysis,
  AnalyzeGithubRepoInput,
} from "./ai.types";
import type {
  ParsedResume,
  ParsedResumePersonalInfo,
  ParsedResumeWorkExperience,
  ParsedResumeEducation,
  ParsedResumeSkills,
  ParsedResumeProject,
  ParsedResumeLanguage,
  ParsedResumeCertification,
  ParsedResumeAward,
  ParsedResumeMetadata,
  ParsedResumeLanguageDetected,
} from "./parsed-resume.types";

import { callAi } from "./ai.client";
import { parseJsonFromAi } from "../../utils/safe-json";
import {
  buildAnalyzeJobPrompt,
  buildAnalyzeProfilePrompt,
  buildParseResumePrompt,
  buildSemanticMatchPrompt,
  buildResumeAwareSemanticMatchPrompt,
  buildGenerateQuestionsPrompt,
  buildEvaluateAnswerPrompt,
  buildEvaluateHomeAssignmentPrompt,
  buildAnalyzeGithubRepoPrompt,
} from "./prompts";
import { buildDeterministicMatch } from "../matching/matching.service";
import { normalizeSkills } from "../matching/skills-normalizer";
import {
  enrichFromResume,
  mergeProfileSkillsWithResume,
} from "../matching/resume-adapter";
import type { MatchAnalysisExtras } from "../matching/matching.types";
import {
  mockProfileAnalysis,
  mockJobAnalysis,
  mockSemanticMatch,
  mockResumeAwareSemanticMatch,
  mockInterviewQuestions,
  mockAnswerEvaluation,
  mockParsedResume,
  mockHomeAssignmentEvaluation,
  mockGithubRepoAnalysis,
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
// ParsedResume helpers (internal)
// ---------------------------------------------------------------------------

const RESUME_TOP_KEYS = [
  "personal_info",
  "professional_summary",
  "work_experience",
  "education",
  "skills",
  "projects",
  "languages",
  "certifications",
  "awards",
  "parsed_metadata",
] as const;

const RESUME_LANGUAGE_VALUES = ["en", "he", "mixed", "other"] as const;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requireArray(
  value: unknown,
  fieldName: string,
  functionName: string
): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${functionName}: field '${fieldName}' is not an array`);
  }
  return value;
}

function requireObject(
  value: unknown,
  fieldName: string,
  functionName: string
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${functionName}: field '${fieldName}' is not an object`);
  }
  return value;
}

function normalizeStringArrayField(
  value: unknown,
  fieldName: string,
  functionName: string
): string[] {
  const arr = requireArray(value, fieldName, functionName);
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item !== "string") {
      throw new Error(
        `${functionName}: field '${fieldName}[${i}]' is not a string`
      );
    }
    const trimmed = item.trim();
    if (trimmed !== "") {
      out.push(trimmed);
    }
  }
  return out;
}

function coerceLanguageDetected(value: unknown): ParsedResumeLanguageDetected {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if ((RESUME_LANGUAGE_VALUES as readonly string[]).includes(lower)) {
      return lower as ParsedResumeLanguageDetected;
    }
  }
  return null;
}

function validatePersonalInfo(
  raw: Record<string, unknown>
): ParsedResumePersonalInfo {
  return {
    full_name: coerceNullableString(raw.full_name),
    email: coerceNullableString(raw.email),
    phone: coerceNullableString(raw.phone),
    location: coerceNullableString(raw.location),
    linkedin_url: coerceNullableString(raw.linkedin_url),
    portfolio_or_github_url: coerceNullableString(raw.portfolio_or_github_url),
  };
}

function validateWorkExperienceEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeWorkExperience {
  const obj = requireObject(raw, `work_experience[${index}]`, fn);
  return {
    company_name: coerceNullableString(obj.company_name),
    job_title: coerceNullableString(obj.job_title),
    start_date: coerceNullableString(obj.start_date),
    end_date: coerceNullableString(obj.end_date),
    location: coerceNullableString(obj.location),
    responsibilities: normalizeStringArrayField(
      obj.responsibilities,
      `work_experience[${index}].responsibilities`,
      fn
    ),
    achievements: normalizeStringArrayField(
      obj.achievements,
      `work_experience[${index}].achievements`,
      fn
    ),
  };
}

function validateEducationEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeEducation {
  const obj = requireObject(raw, `education[${index}]`, fn);
  return {
    institution_name: coerceNullableString(obj.institution_name),
    degree_type: coerceNullableString(obj.degree_type),
    field_of_study: coerceNullableString(obj.field_of_study),
    start_date: coerceNullableString(obj.start_date),
    end_date: coerceNullableString(obj.end_date),
  };
}

function validateSkillsBlock(
  raw: Record<string, unknown>,
  fn: string
): ParsedResumeSkills {
  const technical = normalizeStringArrayField(
    raw.technical_skills,
    "skills.technical_skills",
    fn
  );
  const tools = normalizeStringArrayField(
    raw.tools_and_software,
    "skills.tools_and_software",
    fn
  );
  const soft = normalizeStringArrayField(raw.soft_skills, "skills.soft_skills", fn);
  return {
    technical_skills: normalizeSkills(technical),
    soft_skills: soft,
    tools_and_software: normalizeSkills(tools),
  };
}

function validateProjectEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeProject {
  const obj = requireObject(raw, `projects[${index}]`, fn);
  const technologies = normalizeStringArrayField(
    obj.technologies_used,
    `projects[${index}].technologies_used`,
    fn
  );
  return {
    project_name: coerceNullableString(obj.project_name),
    description: coerceNullableString(obj.description),
    technologies_used: normalizeSkills(technologies),
    link: coerceNullableString(obj.link),
  };
}

function validateLanguageEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeLanguage {
  const obj = requireObject(raw, `languages[${index}]`, fn);
  return {
    language: coerceNullableString(obj.language),
    proficiency_level: coerceNullableString(obj.proficiency_level),
  };
}

function validateCertificationEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeCertification {
  const obj = requireObject(raw, `certifications[${index}]`, fn);
  return {
    name: coerceNullableString(obj.name),
    issuer: coerceNullableString(obj.issuer),
    date: coerceNullableString(obj.date),
  };
}

function validateAwardEntry(
  raw: unknown,
  index: number,
  fn: string
): ParsedResumeAward {
  const obj = requireObject(raw, `awards[${index}]`, fn);
  return {
    title: coerceNullableString(obj.title),
    issuer: coerceNullableString(obj.issuer),
    date: coerceNullableString(obj.date),
  };
}

function validateMetadata(
  raw: Record<string, unknown>,
  fn: string
): ParsedResumeMetadata {
  const yearsRaw = raw.years_of_experience_estimate;
  const years = toNumberScore(yearsRaw, "parsed_metadata.years_of_experience_estimate", fn);
  if (years < 0) {
    throw new Error(
      `${fn}: field 'parsed_metadata.years_of_experience_estimate' must be >= 0 (received ${years})`
    );
  }
  return {
    language_detected: coerceLanguageDetected(raw.language_detected),
    years_of_experience_estimate: Math.round(years),
  };
}

function buildParsedResumeFromParsed(
  parsed: Record<string, unknown>,
  fn: string
): Omit<ParsedResume, "raw_text_hash"> {
  for (const key of RESUME_TOP_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`${fn}: missing required top-level key '${key}'`);
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!(RESUME_TOP_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${fn}: unexpected top-level key '${key}'`);
    }
  }

  const personal = validatePersonalInfo(
    requireObject(parsed.personal_info, "personal_info", fn)
  );

  const workRaw = requireArray(parsed.work_experience, "work_experience", fn);
  const work = workRaw.map((entry, i) =>
    validateWorkExperienceEntry(entry, i, fn)
  );

  const eduRaw = requireArray(parsed.education, "education", fn);
  const education = eduRaw.map((entry, i) => validateEducationEntry(entry, i, fn));

  const skills = validateSkillsBlock(
    requireObject(parsed.skills, "skills", fn),
    fn
  );

  const projectsRaw = requireArray(parsed.projects, "projects", fn);
  const projects = projectsRaw.map((entry, i) =>
    validateProjectEntry(entry, i, fn)
  );

  const languagesRaw = requireArray(parsed.languages, "languages", fn);
  const languages = languagesRaw.map((entry, i) =>
    validateLanguageEntry(entry, i, fn)
  );

  const certsRaw = requireArray(parsed.certifications, "certifications", fn);
  const certifications = certsRaw.map((entry, i) =>
    validateCertificationEntry(entry, i, fn)
  );

  const awardsRaw = requireArray(parsed.awards, "awards", fn);
  const awards = awardsRaw.map((entry, i) => validateAwardEntry(entry, i, fn));

  const metadata = validateMetadata(
    requireObject(parsed.parsed_metadata, "parsed_metadata", fn),
    fn
  );

  return {
    personal_info: personal,
    professional_summary: coerceNullableString(parsed.professional_summary),
    work_experience: work,
    education,
    skills,
    projects,
    languages,
    certifications,
    awards,
    parsed_metadata: metadata,
  };
}

function validateParsedResume(raw: string): Omit<ParsedResume, "raw_text_hash"> {
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  if (!isPlainObject(parsed)) {
    throw new Error("parseResume: top-level value is not an object");
  }
  return buildParsedResumeFromParsed(parsed, "parseResume");
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

function coerceOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function coerceOptionalShortStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed !== "") out.push(trimmed);
  }
  return out.length === 0 ? undefined : out;
}

function validateResumeAwareSemanticMatch(
  raw: string
): ResumeAwareSemanticMatchAiResponse {
  const fn = "calculateMatch";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  const rawScore = toNumberScore(
    parsed.aiSemanticScore,
    "aiSemanticScore",
    fn
  );
  const result: ResumeAwareSemanticMatchAiResponse = {
    aiSemanticScore: clampScore(rawScore),
    explanation: requireString(parsed.explanation, "explanation", fn),
  };
  const educationFit = coerceOptionalString(parsed.educationFit);
  if (educationFit !== undefined) result.educationFit = educationFit;
  const experienceFit = coerceOptionalString(parsed.experienceFit);
  if (experienceFit !== undefined) result.experienceFit = experienceFit;
  const projectFit = coerceOptionalString(parsed.projectFit);
  if (projectFit !== undefined) result.projectFit = projectFit;
  const languageFit = coerceOptionalString(parsed.languageFit);
  if (languageFit !== undefined) result.languageFit = languageFit;
  const resumeInsights = coerceOptionalShortStringArray(parsed.resumeInsights);
  if (resumeInsights !== undefined) result.resumeInsights = resumeInsights;
  const matchingEvidence = coerceOptionalShortStringArray(
    parsed.matchingEvidence
  );
  if (matchingEvidence !== undefined) result.matchingEvidence = matchingEvidence;
  return result;
}

function extractMatchExtras(
  semantic: ResumeAwareSemanticMatchAiResponse
): MatchAnalysisExtras {
  const extras: MatchAnalysisExtras = {};
  if (semantic.educationFit !== undefined)
    extras.educationFit = semantic.educationFit;
  if (semantic.experienceFit !== undefined)
    extras.experienceFit = semantic.experienceFit;
  if (semantic.projectFit !== undefined) extras.projectFit = semantic.projectFit;
  if (semantic.languageFit !== undefined)
    extras.languageFit = semantic.languageFit;
  if (semantic.resumeInsights !== undefined)
    extras.resumeInsights = semantic.resumeInsights;
  if (semantic.matchingEvidence !== undefined)
    extras.matchingEvidence = semantic.matchingEvidence;
  return extras;
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

function validateHomeAssignmentEvaluation(
  raw: string
): HomeAssignmentEvaluation {
  const fn = "evaluateHomeAssignment";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  return {
    score: clampScore(toNumberScore(parsed.score, "score", fn)),
    summary: requireString(parsed.summary, "summary", fn),
    strengths: requireStringArray(parsed.strengths, "strengths", fn),
    improvements: requireStringArray(parsed.improvements, "improvements", fn),
  };
}

function validateGithubRepoAnalysis(raw: string): GithubRepoAnalysis {
  const fn = "analyzeGithubRepo";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  return {
    architectureSummary: requireString(
      parsed.architectureSummary,
      "architectureSummary",
      fn
    ),
    codeQualityScore: clampScore(
      toNumberScore(parsed.codeQualityScore, "codeQualityScore", fn)
    ),
    strengths: requireStringArray(parsed.strengths, "strengths", fn),
    concerns: requireStringArray(parsed.concerns, "concerns", fn),
    detectedStack: requireStringArray(parsed.detectedStack, "detectedStack", fn),
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
  const prompt = buildAnalyzeProfilePrompt(profile);
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
  jobAnalysis: JobAnalysis,
  resume?: ParsedResume
): Promise<MatchAnalysis> {
  const rawProfileSkills = profile?.skills ?? [];
  const requiredSkills = jobAnalysis?.requiredSkills ?? [];
  const advantageSkills = jobAnalysis?.advantageSkills ?? [];

  if (!resume) {
    const profileSkills = rawProfileSkills;

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

  const enrichment = enrichFromResume(resume);
  const profileSkills = mergeProfileSkillsWithResume(rawProfileSkills, enrichment);

  if (isMockMode()) {
    return buildDeterministicMatch(
      profileSkills,
      requiredSkills,
      advantageSkills,
      mockResumeAwareSemanticMatch.aiSemanticScore,
      mockResumeAwareSemanticMatch.explanation,
      extractMatchExtras(mockResumeAwareSemanticMatch)
    );
  }

  const prompt = buildResumeAwareSemanticMatchPrompt({
    profileSkills,
    requiredSkills,
    advantageSkills,
    workExperienceSummary: enrichment.workExperienceSummary,
    educationSummary: enrichment.educationSummary,
    topProjectsSummary: enrichment.topProjectsSummary,
    languagesSummary: enrichment.languagesSummary,
    experienceYears: enrichment.experienceYears,
  });

  const semantic = await withOneRetry<ResumeAwareSemanticMatchAiResponse>(
    "calculateMatch",
    prompt,
    validateResumeAwareSemanticMatch
  );

  return buildDeterministicMatch(
    profileSkills,
    requiredSkills,
    advantageSkills,
    semantic.aiSemanticScore,
    semantic.explanation,
    extractMatchExtras(semantic)
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

export async function evaluateHomeAssignment(
  input: EvaluateHomeAssignmentInput
): Promise<HomeAssignmentEvaluation> {
  if (typeof input?.code !== "string" || input.code.trim() === "") {
    throw new Error("evaluateHomeAssignment: code must be a non-empty string");
  }

  if (isMockMode()) {
    return mockHomeAssignmentEvaluation;
  }

  const prompt = buildEvaluateHomeAssignmentPrompt({
    code: input.code,
    language: input.language,
    jobContext: input.jobContext,
  });

  return withOneRetry<HomeAssignmentEvaluation>(
    "evaluateHomeAssignment",
    prompt,
    validateHomeAssignmentEvaluation
  );
}

export async function analyzeGithubRepo(
  input: AnalyzeGithubRepoInput
): Promise<GithubRepoAnalysis> {
  if (!input?.metadata) {
    throw new Error("analyzeGithubRepo: metadata is required");
  }

  if (isMockMode()) {
    return mockGithubRepoAnalysis;
  }

  const prompt = buildAnalyzeGithubRepoPrompt({
    fullName: input.metadata.fullName,
    description: input.metadata.description,
    primaryLanguage: input.metadata.primaryLanguage,
    languages: input.metadata.languages,
    stars: input.metadata.stars,
    readme: input.metadata.readme,
    packageJson: input.metadata.packageJson,
  });

  return withOneRetry<GithubRepoAnalysis>(
    "analyzeGithubRepo",
    prompt,
    validateGithubRepoAnalysis
  );
}

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  if (typeof resumeText !== "string" || resumeText.trim() === "") {
    throw new Error("parseResume: resumeText must be a non-empty string");
  }

  const rawHash = sha256Hex(resumeText);

  if (isMockMode()) {
    return { ...mockParsedResume, raw_text_hash: rawHash };
  }

  const prompt = buildParseResumePrompt(resumeText);
  const body = await withOneRetry<Omit<ParsedResume, "raw_text_hash">>(
    "parseResume",
    prompt,
    validateParsedResume
  );

  return { ...body, raw_text_hash: rawHash };
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
  sha256Hex,
  coerceNullableString,
  coerceLanguageDetected,
  validateParsedResume,
};
