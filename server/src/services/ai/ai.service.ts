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
  SummarizeAttemptInput,
  InterviewAttemptSummary,
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
  SuggestedSkill,
} from "./parsed-resume.types";

import {
  callAi,
  createAiDeadline,
  getActiveModelName,
  isApiKeyConfigured,
  type AiCallOptions,
} from "./ai.client";
import {
  logAiStart,
  logAiSuccess,
  logAiFailure,
  logAiPromptPreview,
  logAiOutputPreview,
} from "./ai.logger";
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
  buildSummarizeAttemptPrompt,
} from "./prompts";
import { buildDeterministicMatch } from "../matching/matching.service";
import {
  atomizeSkills,
  normalizeSkill,
  normalizeSkills,
} from "../matching/skills-normalizer";
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
  mockInterviewAttemptSummary,
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

/**
 * Fisher-Yates. The previous `sort(() => 0.5 - Math.random())` is not a
 * shuffle: comparator results are inconsistent, so the permutation it produces
 * is biased toward the original order.
 */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

/**
 * Per-operation generation settings.
 *
 * Extraction and matching want near-deterministic output; question generation
 * wants variety so two sessions for the same job are not the same interview;
 * evaluation and summarisation sit in between. Every operation returns JSON, so
 * all of them ask the provider for JSON directly.
 *
 * `maxOutputTokens` is a truncation guard, not a savings target: it is sized
 * above the largest legitimate response each operation produces. parseResume is
 * the largest by a wide margin because of its suggested-skills block.
 */
export const AI_OPERATION_CONFIG: Record<string, AiCallOptions> = {
  analyzeProfile: { temperature: 0.2, maxOutputTokens: 2048, jsonMode: true },
  analyzeJob: { temperature: 0.2, maxOutputTokens: 4096, jsonMode: true },
  calculateMatch: { temperature: 0.2, maxOutputTokens: 2048, jsonMode: true },
  generateInterviewQuestions: {
    temperature: 0.8,
    maxOutputTokens: 2048,
    jsonMode: true,
  },
  evaluateAnswer: { temperature: 0.3, maxOutputTokens: 1536, jsonMode: true },
  evaluateHomeAssignment: {
    temperature: 0.3,
    maxOutputTokens: 1536,
    jsonMode: true,
  },
  analyzeGithubRepo: { temperature: 0.2, maxOutputTokens: 2048, jsonMode: true },
  summarizeInterviewAttempt: {
    temperature: 0.4,
    maxOutputTokens: 1536,
    jsonMode: true,
  },
  parseResume: { temperature: 0.1, maxOutputTokens: 8192, jsonMode: true },
};

function configFor(functionName: string): AiCallOptions {
  return AI_OPERATION_CONFIG[functionName] ?? { jsonMode: true };
}

const RETRY_SUFFIX =
  "\n\nYour previous response was invalid. Return ONLY valid JSON matching the exact schema. No markdown. No explanations. No extra fields.";

/**
 * Single-retry helper for AI calls.
 *
 * Two retry concerns meet here, and they are deliberately not the same thing:
 *
 *   - Transport failures (429, 503, socket errors, timeouts) are retried inside
 *     `callAi`. This function does not retry them and must not: adding a second
 *     transport retry would multiply the attempt count.
 *   - Parse / validation failures are retried here, exactly once, by re-asking
 *     with a stricter prompt. If the retry also fails to validate, a descriptive
 *     error naming the function is thrown.
 *   - Config errors (e.g. missing GEMINI_API_KEY) are non-retryable at both
 *     layers and surface on the first attempt.
 *
 * Both `callAi` calls share one deadline created here, so the whole logical
 * operation — every transport attempt of both calls, plus their backoffs — is
 * bounded by `AI_TOTAL_BUDGET_MS`. Without it the layers compose
 * multiplicatively: two calls x (1 + AI_MAX_RETRIES) attempts x AI_TIMEOUT_MS.
 */
async function withOneRetry<T>(
  functionName: string,
  prompt: string,
  parseAndValidate: (raw: string) => T,
  onRawOutput?: (raw: string) => void
): Promise<T> {
  const config = { ...configFor(functionName), deadlineAt: createAiDeadline() };
  const rawFirst = await callAi(prompt, config);
  try {
    const out = parseAndValidate(rawFirst);
    if (onRawOutput) onRawOutput(rawFirst);
    return out;
  } catch (firstErr) {
    const rawRetry = await callAi(prompt + RETRY_SUFFIX, config);
    try {
      const out = parseAndValidate(rawRetry);
      if (onRawOutput) onRawOutput(rawRetry);
      return out;
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

/**
 * Wraps an exported AI service function with start/success/failure logs.
 *
 * The wrapper is the only place service-level logging lives — call sites
 * just `return instrument("foo", () => impl())`. It also exposes a small
 * context to the implementation so prompt/output previews can be emitted
 * with consistent function names.
 */
interface InstrumentContext {
  recordPrompt: (prompt: string) => void;
  recordOutput: (rawOutput: string) => void;
  setPromptChars: (n: number) => void;
  setOutputChars: (n: number) => void;
}

async function instrument<T>(
  functionName: string,
  impl: (ctx: InstrumentContext) => Promise<T>
): Promise<T> {
  const mock = isMockMode();
  const start = Date.now();
  let promptChars: number | undefined;
  let outputChars: number | undefined;

  const ctx: InstrumentContext = {
    recordPrompt: (prompt: string) => {
      promptChars = prompt.length;
      logAiPromptPreview(functionName, prompt);
    },
    recordOutput: (rawOutput: string) => {
      outputChars = rawOutput.length;
      logAiOutputPreview(functionName, rawOutput);
    },
    setPromptChars: (n: number) => {
      promptChars = n;
    },
    setOutputChars: (n: number) => {
      outputChars = n;
    },
  };

  logAiStart({
    functionName,
    model: mock ? undefined : getActiveModelName(),
    mock,
    keyConfigured: isApiKeyConfigured(),
  });

  try {
    const result = await impl(ctx);
    logAiSuccess({
      functionName,
      durationMs: Date.now() - start,
      promptChars,
      outputChars,
      mock,
    });
    return result;
  } catch (err) {
    logAiFailure({
      functionName,
      durationMs: Date.now() - start,
      error: err,
      mock,
    });
    throw err;
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
  "suggested_skills",
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
    // Atomized, not just normalized: a resume listing "HTML/CSS" or
    // "TCP/IP networking and protocols" becomes separate comparable skills.
    // soft_skills stays as written — it is prose, not a matchable vocabulary.
    technical_skills: atomizeSkills(technical),
    soft_skills: soft,
    tools_and_software: atomizeSkills(tools),
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
    technologies_used: atomizeSkills(technologies),
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

function validateSuggestedSkills(
  raw: unknown,
  existing: ParsedResumeSkills,
  projects: ParsedResumeProject[],
  fn: string
): SuggestedSkill[] {
  const arr = requireArray(raw, "suggested_skills", fn);

  const existingSet = new Set<string>();
  for (const s of existing.technical_skills) existingSet.add(s);
  for (const s of existing.tools_and_software) existingSet.add(s);
  for (const p of projects) {
    for (const t of p.technologies_used) existingSet.add(t);
  }

  const seen = new Set<string>();
  const out: SuggestedSkill[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!isPlainObject(item)) continue;

    const rawSkill = item.skill;
    if (typeof rawSkill !== "string") continue;
    const trimmedSkill = rawSkill.trim();
    if (trimmedSkill === "") continue;

    const normalized = normalizeSkills([trimmedSkill]);
    if (normalized.length === 0) continue;
    const skill = normalized[0];
    if (skill === "") continue;

    if (existingSet.has(skill) || seen.has(skill)) continue;

    const rawReason = item.reason;
    if (typeof rawReason !== "string") continue;
    const reason = rawReason.trim();
    if (reason === "") continue;

    let confidence: number;
    try {
      confidence = toNumberScore(item.confidence, "suggested_skills.confidence", fn);
    } catch {
      continue;
    }
    confidence = clampScore(confidence);

    seen.add(skill);
    out.push({ skill, reason, confidence });
  }

  out.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.skill.localeCompare(b.skill);
  });

  return out;
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

  const suggested = validateSuggestedSkills(
    parsed.suggested_skills,
    skills,
    projects,
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
    suggested_skills: suggested,
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

const JOB_ANALYSIS_KEYS = [
  "roleTitle",
  "requiredSkills",
  "advantageSkills",
  "toolsMentioned",
  "impliedSkills",
  "nonSkillRequirements",
  "skillRelations",
  "seniorityLevel",
  "summary",
] as const;

/**
 * Job skills are canonicalized here, at ingestion, exactly like resume skills.
 * They used to persist as raw title-case prose ("Identity Threat Detection and
 * Response") and were only normalized transiently at compare time, so the two
 * sides of a match were never stored in the same vocabulary.
 */
function canonicalizeJobSkills(
  value: unknown,
  fieldName: string,
  fn: string
): string[] {
  return atomizeSkills(requireStringArray(value, fieldName, fn));
}

function validateSkillRelations(
  value: unknown,
  fn: string
): Record<string, string[]> {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    throw new Error(`${fn}: field 'skillRelations' is not an object`);
  }

  const relations: Record<string, string[]> = {};
  for (const [rawSkill, rawTerms] of Object.entries(value)) {
    const skill = normalizeSkill(rawSkill);
    if (skill === "") continue;
    const terms = requireStringArray(
      rawTerms,
      `skillRelations['${rawSkill}']`,
      fn
    );
    const canonical = normalizeSkills(terms).filter((term) => term !== skill);
    if (canonical.length === 0) continue;
    relations[skill] = canonical;
  }
  return relations;
}

function validateJobAnalysis(raw: string): JobAnalysis {
  const fn = "analyzeJob";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  if (!isPlainObject(parsed)) {
    throw new Error(`${fn}: top-level value is not an object`);
  }
  for (const key of Object.keys(parsed)) {
    if (!(JOB_ANALYSIS_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${fn}: unexpected top-level key '${key}'`);
    }
  }

  const result: JobAnalysis = {
    roleTitle: requireString(parsed.roleTitle, "roleTitle", fn),
    requiredSkills: canonicalizeJobSkills(
      parsed.requiredSkills,
      "requiredSkills",
      fn
    ),
    advantageSkills: canonicalizeJobSkills(
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

  if (parsed.toolsMentioned !== undefined) {
    result.toolsMentioned = canonicalizeJobSkills(
      parsed.toolsMentioned,
      "toolsMentioned",
      fn
    );
  }
  if (parsed.impliedSkills !== undefined) {
    result.impliedSkills = canonicalizeJobSkills(
      parsed.impliedSkills,
      "impliedSkills",
      fn
    );
  }
  if (parsed.nonSkillRequirements !== undefined) {
    // Kept as written: these are shown to the candidate, not compared.
    result.nonSkillRequirements = normalizeStringArrayField(
      parsed.nonSkillRequirements,
      "nonSkillRequirements",
      fn
    );
  }
  if (parsed.skillRelations !== undefined) {
    result.skillRelations = validateSkillRelations(parsed.skillRelations, fn);
  }

  return result;
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

/**
 * Validates a questions response, optionally enforcing the requested count.
 *
 * Without `expectedCount` a model that returns three questions for a
 * five-question request silently produced a three-question interview. Falling
 * short now fails validation, which triggers the stricter retry prompt.
 */
function validateQuestions(
  raw: string,
  expectedCount?: number
): { questions: InterviewQuestion[] } {
  const fn = "generateInterviewQuestions";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  const questionsRaw = parsed.questions;
  if (!Array.isArray(questionsRaw)) {
    throw new Error(`${fn}: field 'questions' is not an array`);
  }
  if (
    typeof expectedCount === "number" &&
    expectedCount > 0 &&
    questionsRaw.length < expectedCount
  ) {
    throw new Error(
      `${fn}: expected ${expectedCount} questions but received ${questionsRaw.length}`
    );
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

  const bounded =
    typeof expectedCount === "number" && expectedCount > 0
      ? validated.slice(0, expectedCount)
      : validated;

  return { questions: ensureQuestionIds(bounded) };
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

const ATTEMPT_SUMMARY_KEYS = [
  "summary",
  "overallScore",
  "preserve_points",
  "improve_points",
  "topics_covered",
  "overall_feedback",
] as const;

function validateBoundedString(
  value: unknown,
  fieldName: string,
  fn: string,
  min: number,
  max: number
): string {
  const s = requireString(value, fieldName, fn).trim();
  if (s.length < min || s.length > max) {
    throw new Error(
      `${fn}: field '${fieldName}' must be ${min}-${max} chars (received ${s.length})`
    );
  }
  return s;
}

function normalizeBoundedStringArray(
  value: unknown,
  fieldName: string,
  fn: string,
  minLen: number,
  maxLen: number,
  itemMin: number,
  itemMax: number
): string[] {
  const arr = requireArray(value, fieldName, fn);
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length < itemMin || trimmed.length > itemMax) continue;
    out.push(trimmed);
  }
  if (out.length < minLen) {
    throw new Error(
      `${fn}: field '${fieldName}' must have at least ${minLen} valid entr${minLen === 1 ? "y" : "ies"} (got ${out.length})`
    );
  }
  return out.slice(0, maxLen);
}

function normalizeTopicsArray(value: unknown, fn: string): string[] {
  const arr = requireArray(value, "topics_covered", fn);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const lower = trimmed.toLowerCase();
    if (lower.length > 60) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
    if (out.length >= 15) break;
  }
  return out;
}

function validateInterviewAttemptSummary(
  raw: string
): InterviewAttemptSummary {
  const fn = "summarizeInterviewAttempt";
  const parsed = parseJsonFromAi<Record<string, unknown>>(raw);
  if (!isPlainObject(parsed)) {
    throw new Error(`${fn}: top-level value is not an object`);
  }
  for (const key of ATTEMPT_SUMMARY_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`${fn}: missing required top-level key '${key}'`);
    }
  }

  const summary = validateBoundedString(parsed.summary, "summary", fn, 50, 800);
  const overallScore = clampScore(
    toNumberScore(parsed.overallScore, "overallScore", fn)
  );
  const preserve = normalizeBoundedStringArray(
    parsed.preserve_points,
    "preserve_points",
    fn,
    1,
    2,
    10,
    200
  );
  const improve = normalizeBoundedStringArray(
    parsed.improve_points,
    "improve_points",
    fn,
    1,
    2,
    10,
    200
  );
  const topics = normalizeTopicsArray(parsed.topics_covered, fn);
  const feedback = validateBoundedString(
    parsed.overall_feedback,
    "overall_feedback",
    fn,
    20,
    300
  );

  return {
    summary,
    overallScore,
    preserve_points: preserve,
    improve_points: improve,
    topics_covered: topics,
    overall_feedback: feedback,
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
  return instrument("analyzeProfile", async (ctx) => {
    if (isMockMode()) {
      return mockProfileAnalysis;
    }
    const prompt = buildAnalyzeProfilePrompt(profile);
    ctx.recordPrompt(prompt);
    return withOneRetry<ProfileAnalysis>(
      "analyzeProfile",
      prompt,
      validateProfileAnalysis,
      ctx.recordOutput
    );
  });
}

export async function analyzeJob(
  jobDescription: string
): Promise<JobAnalysis> {
  return instrument("analyzeJob", async (ctx) => {
    if (isMockMode()) {
      return mockJobAnalysis;
    }
    const prompt = buildAnalyzeJobPrompt({ jobDescription });
    ctx.recordPrompt(prompt);
    return withOneRetry<JobAnalysis>(
      "analyzeJob",
      prompt,
      validateJobAnalysis,
      ctx.recordOutput
    );
  });
}

export async function calculateMatch(
  profile: ProfileInput,
  jobAnalysis: JobAnalysis,
  resume?: ParsedResume
): Promise<MatchAnalysis> {
  return instrument("calculateMatch", async (ctx) => {
    const rawProfileSkills = profile?.skills ?? [];
    const requiredSkills = jobAnalysis?.requiredSkills ?? [];
    const advantageSkills = jobAnalysis?.advantageSkills ?? [];
    // Absent on jobs analyzed before relations were extracted; graded matching
    // then falls back to the curated relation map.
    const matchOptions = { skillRelations: jobAnalysis?.skillRelations ?? {} };

    if (!resume) {
      const profileSkills = rawProfileSkills;

      if (isMockMode()) {
        return buildDeterministicMatch(
          profileSkills,
          requiredSkills,
          advantageSkills,
          mockSemanticMatch.aiSemanticScore,
          mockSemanticMatch.explanation,
          undefined,
          matchOptions
        );
      }

      const prompt = buildSemanticMatchPrompt({
        profileSkills,
        requiredSkills,
        advantageSkills,
      });
      ctx.recordPrompt(prompt);

      const semantic = await withOneRetry<SemanticMatchAiResponse>(
        "calculateMatch",
        prompt,
        validateSemanticMatch,
        ctx.recordOutput
      );

      return buildDeterministicMatch(
        profileSkills,
        requiredSkills,
        advantageSkills,
        semantic.aiSemanticScore,
        semantic.explanation,
        undefined,
        matchOptions
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
        extractMatchExtras(mockResumeAwareSemanticMatch),
        matchOptions
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
    ctx.recordPrompt(prompt);

    const semantic = await withOneRetry<ResumeAwareSemanticMatchAiResponse>(
      "calculateMatch",
      prompt,
      validateResumeAwareSemanticMatch,
      ctx.recordOutput
    );

    return buildDeterministicMatch(
      profileSkills,
      requiredSkills,
      advantageSkills,
      semantic.aiSemanticScore,
      semantic.explanation,
      extractMatchExtras(semantic),
      matchOptions
    );
  });
}

export async function generateInterviewQuestions(
  input: GenerateQuestionsInput
): Promise<{ questions: InterviewQuestion[] }> {
  return instrument("generateInterviewQuestions", async (ctx) => {
    if (isMockMode()) {
      const timestamp = Date.now();
      // Prefer questions the caller has not already seen, then fill from the
      // rest, so mock mode reflects the exclusion behaviour too.
      const excluded = new Set(
        (input.excludeQuestions ?? []).map((question) => question.trim())
      );
      const unseen = mockInterviewQuestions.filter((q) => !excluded.has(q.question));
      const seen = mockInterviewQuestions.filter((q) => excluded.has(q.question));
      const pool = shuffle([...unseen]).concat(shuffle([...seen]));
      const sliced = pool.slice(0, Math.max(0, input.count));
      const uniqueQuestions = sliced.map((q, i) => ({
        ...q,
        id: `q_${timestamp}_${i}`,
      }));
      return { questions: uniqueQuestions };
    }

    const prompt = buildGenerateQuestionsPrompt({
      interviewType: input.interviewType,
      profileSkills: input.profileSkills,
      jobRequiredSkills: input.jobRequiredSkills,
      count: input.count,
      language: input.language,
      excludeQuestions: input.excludeQuestions,
      cvContext: input.cvContext,
    });
    ctx.recordPrompt(prompt);

    return withOneRetry<{ questions: InterviewQuestion[] }>(
      "generateInterviewQuestions",
      prompt,
      (raw) => validateQuestions(raw, input.count),
      ctx.recordOutput
    );
  });
}

function generateMockEvaluation(userAnswer: string): AnswerEvaluation {
  // Generate somewhat dynamic mock evaluation based on answer characteristics
  const answerLength = userAnswer.trim().length;
  const wordCount = userAnswer.trim().split(/\s+/).length;
  const hasCodeExample = /(`|code|example)/i.test(userAnswer);
  const hasTradeOff = /(trade-off|however|but|alternatively|vs\.|versus|on the other hand)/i.test(
    userAnswer
  );

  // Base scores
  let clarity = 75;
  let correctness = 75;
  let depth = 65;

  // Adjust based on answer characteristics
  if (wordCount > 50) clarity += 8;
  if (wordCount > 100) clarity += 5;
  if (wordCount > 150) depth += 10;

  if (hasCodeExample) {
    depth += 12;
    correctness += 5;
  }

  if (hasTradeOff) {
    depth += 10;
  }

  // Clamp scores
  clarity = Math.min(100, Math.max(50, clarity));
  correctness = Math.min(100, Math.max(50, correctness));
  depth = Math.min(100, Math.max(50, depth));

  const overallScore = Math.round((clarity + correctness + depth) / 3);

  return {
    score: overallScore,
    clarity,
    correctness,
    depth,
    feedback:
      wordCount < 30
        ? "Your answer is quite brief. Consider adding more detail to demonstrate your understanding. Include examples or explain the reasoning behind your statements."
        : hasCodeExample
          ? "Good effort including a concrete example or code reference. This helps ground your explanation. Consider adding one more thought about trade-offs or edge cases to deepen the response."
          : hasTradeOff
            ? "You've touched on important nuances and trade-offs. Adding a concrete example would help illustrate the concept more clearly."
            : "Your answer covers the basics well. To strengthen it, consider adding: (1) a concrete code example, (2) a trade-off or edge case, and (3) how this connects to the role's requirements.",
    improvementTips: [
      hasCodeExample
        ? "Build on your example by explaining the trade-offs or performance implications."
        : "Add a concrete code example or real-world scenario to illustrate your point.",
      hasTradeOff
        ? "Deepen further by connecting this to specific tools or frameworks mentioned in the job description."
        : "Discuss at least one trade-off or limitation of the approach you described.",
      "Conclude by explicitly tying your answer back to the role's expected focus areas.",
    ],
  };
}

export async function evaluateAnswer(
  input: EvaluateAnswerInput
): Promise<AnswerEvaluation> {
  return instrument("evaluateAnswer", async (ctx) => {
    if (isMockMode()) {
      return generateMockEvaluation(input.userAnswer);
    }

    const prompt = buildEvaluateAnswerPrompt({
      question: input.question,
      expectedFocus: input.expectedFocus,
      userAnswer: input.userAnswer,
      interviewType: input.interviewType,
    });
    ctx.recordPrompt(prompt);

    return withOneRetry<AnswerEvaluation>(
      "evaluateAnswer",
      prompt,
      validateAnswerEvaluation,
      ctx.recordOutput
    );
  });
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

function validateAttemptInput(input: SummarizeAttemptInput): void {
  const fn = "summarizeInterviewAttempt";
  if (!input || typeof input !== "object") {
    throw new Error(`${fn}: input is required`);
  }
  if (input.interviewType !== "hr" && input.interviewType !== "technical") {
    throw new Error(
      `${fn}: interviewType must be one of [hr, technical] (received ${JSON.stringify(input.interviewType)})`
    );
  }
  if (!Array.isArray(input.answers) || input.answers.length === 0) {
    throw new Error(`${fn}: answers must be a non-empty array`);
  }
  for (let i = 0; i < input.answers.length; i++) {
    const a = input.answers[i];
    if (!a || typeof a !== "object") {
      throw new Error(`${fn}: answers[${i}] is not an object`);
    }
    if (typeof a.questionId !== "string" || a.questionId.trim() === "") {
      throw new Error(`${fn}: answers[${i}].questionId must be a non-empty string`);
    }
    if (typeof a.question !== "string" || a.question.trim() === "") {
      throw new Error(`${fn}: answers[${i}].question must be a non-empty string`);
    }
    if (typeof a.userAnswer !== "string" || a.userAnswer.trim() === "") {
      throw new Error(`${fn}: answers[${i}].userAnswer must be a non-empty string`);
    }
    const ev = a.evaluation;
    if (!ev || typeof ev !== "object") {
      throw new Error(`${fn}: answers[${i}].evaluation must be an object`);
    }
    for (const k of ["score", "clarity", "correctness", "depth"] as const) {
      if (typeof ev[k] !== "number" || !Number.isFinite(ev[k])) {
        throw new Error(
          `${fn}: answers[${i}].evaluation.${k} must be a finite number`
        );
      }
    }
  }
}

function computeAverageScore(input: SummarizeAttemptInput): number {
  const sum = input.answers.reduce((acc, a) => acc + a.evaluation.score, 0);
  return Math.round(sum / input.answers.length);
}

export async function summarizeInterviewAttempt(
  input: SummarizeAttemptInput
): Promise<InterviewAttemptSummary> {
  validateAttemptInput(input);

  return instrument("summarizeInterviewAttempt", async (ctx) => {
    const averageScore = computeAverageScore(input);
    const resolvedScore = clampScore(
      typeof input.overallScore === "number"
        ? input.overallScore
        : averageScore
    );

    if (isMockMode()) {
      return { ...mockInterviewAttemptSummary, overallScore: resolvedScore };
    }

    const prompt = buildSummarizeAttemptPrompt({
      interviewType: input.interviewType,
      answers: input.answers,
      computedAverageScore: averageScore,
      jobTitle: input.jobTitle,
      profileSkills: input.profileSkills,
    });
    ctx.recordPrompt(prompt);

    const summary = await withOneRetry<InterviewAttemptSummary>(
      "summarizeInterviewAttempt",
      prompt,
      validateInterviewAttemptSummary,
      ctx.recordOutput
    );

    return { ...summary, overallScore: resolvedScore };
  });
}

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  return instrument("parseResume", async (ctx) => {
    if (typeof resumeText !== "string" || resumeText.trim() === "") {
      throw new Error("parseResume: resumeText must be a non-empty string");
    }

    const rawHash = sha256Hex(resumeText);

    if (isMockMode()) {
      return { ...mockParsedResume, raw_text_hash: rawHash };
    }

    const prompt = buildParseResumePrompt(resumeText);
    ctx.recordPrompt(prompt);
    const body = await withOneRetry<Omit<ParsedResume, "raw_text_hash">>(
      "parseResume",
      prompt,
      validateParsedResume,
      ctx.recordOutput
    );

    return { ...body, raw_text_hash: rawHash };
  });
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
