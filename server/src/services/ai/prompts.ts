// Prompt builders for the AI provider.
//
// Pure string builders — no I/O, no SDK imports, no JSON parsing. Every
// prompt demands strict JSON-only output and pins the exact response shape
// so downstream parsing / validation (safe-json.ts, ai.service.ts) stays
// boring.

import type { ProfileInput } from "../matching/matching.types";

const SYSTEM_HEADER = [
  "You are a precise JSON API.",
  "Return ONLY valid JSON.",
  "Do not include explanations.",
  "Do not include markdown.",
  "Do not wrap the response in code fences.",
  "The response must be a single JSON object and nothing else.",
  "Do not return arrays as the root response.",
  "Do not add any fields beyond those specified in the schema.",
  "All score fields must be numbers in the inclusive range 0-100.",
  'Do not use percentage strings like "85%" — use the number 85.',
  "All string-array fields must contain strings only.",
].join("\n");

function formatStringList(label: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `${label}: (none)`;
  }
  return `${label}: ${values.map((v) => JSON.stringify(v)).join(", ")}`;
}

export interface AnalyzeJobPromptInput {
  readonly jobDescription: string;
  readonly roleTitle?: string;
  readonly companyName?: string;
}

export function buildAnalyzeJobPrompt(input: AnalyzeJobPromptInput): string {
  const schema = `{
  "roleTitle": string,
  "requiredSkills": string[],
  "advantageSkills": string[],
  "seniorityLevel": "junior" | "mid" | "senior",
  "summary": string
}`;

  const hints: string[] = [];
  if (input.roleTitle) {
    hints.push(`Candidate role title hint: ${input.roleTitle}`);
  }
  if (input.companyName) {
    hints.push(`Company: ${input.companyName}`);
  }

  return [
    SYSTEM_HEADER,
    "",
    "Task: analyze the job description below and extract a structured summary.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    ...hints,
    "",
    "Job description:",
    input.jobDescription,
  ].join("\n");
}

export interface SemanticMatchPromptInput {
  readonly profileSkills: string[];
  readonly requiredSkills: string[];
  readonly advantageSkills: string[];
}

export function buildSemanticMatchPrompt(
  input: SemanticMatchPromptInput
): string {
  const schema = `{
  "aiSemanticScore": number (0-100),
  "explanation": string
}`;

  return [
    SYSTEM_HEADER,
    "",
    "Task: estimate how well the candidate's skills semantically cover the",
    "job's required and advantage skills. Consider synonyms and closely related",
    "technologies (e.g. \"React\" ≈ \"modern JS frameworks\"). Do NOT compute a",
    "final match score — only the semantic sub-score.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    "aiSemanticScore must be a number between 0 and 100 (inclusive).",
    "Do not return a percentage string.",
    "",
    formatStringList("Candidate skills", input.profileSkills),
    formatStringList("Job required skills", input.requiredSkills),
    formatStringList("Job advantage skills", input.advantageSkills),
  ].join("\n");
}

export interface ResumeAwareSemanticMatchPromptInput {
  readonly profileSkills: string[];
  readonly requiredSkills: string[];
  readonly advantageSkills: string[];
  readonly workExperienceSummary: string;
  readonly educationSummary: string;
  readonly topProjectsSummary: string;
  readonly languagesSummary: string;
  readonly experienceYears: number;
}

export function buildResumeAwareSemanticMatchPrompt(
  input: ResumeAwareSemanticMatchPromptInput
): string {
  const schema = `{
  "aiSemanticScore": number (0-100),
  "explanation": string,
  "educationFit": string | null,
  "experienceFit": string | null,
  "projectFit": string | null,
  "languageFit": string | null,
  "resumeInsights": string[],
  "matchingEvidence": string[]
}`;

  const resumeLines = [
    `Candidate experience years: ${input.experienceYears}`,
    input.workExperienceSummary === ""
      ? "Work experience: (none reported)"
      : `Work experience: ${input.workExperienceSummary}`,
    input.educationSummary === ""
      ? "Education: (none reported)"
      : `Education: ${input.educationSummary}`,
    input.topProjectsSummary === ""
      ? "Top projects: (none reported)"
      : `Top projects: ${input.topProjectsSummary}`,
    input.languagesSummary === ""
      ? "Languages: (none reported)"
      : `Languages: ${input.languagesSummary}`,
  ];

  return [
    SYSTEM_HEADER,
    "",
    "Task: estimate how well the candidate's resume semantically covers the job.",
    "Consider synonyms and closely related technologies (e.g. \"React\" ≈ \"modern JS frameworks\").",
    "Also produce short qualitative fit notes for education, experience, projects,",
    "and language. Do NOT compute a final match score — only the semantic sub-score.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    "aiSemanticScore must be a number between 0 and 100 (inclusive).",
    "Do not return a percentage string.",
    "educationFit / experienceFit / projectFit / languageFit are short sentences (10-200 chars) or null if there is not enough information.",
    "resumeInsights: 0-5 short strings highlighting notable signals (strengths or gaps).",
    "matchingEvidence: 0-5 short strings citing concrete resume items that justify the score.",
    "",
    formatStringList("Candidate skills", input.profileSkills),
    formatStringList("Job required skills", input.requiredSkills),
    formatStringList("Job advantage skills", input.advantageSkills),
    "",
    ...resumeLines,
  ].join("\n");
}

export interface GenerateQuestionsPromptInput {
  readonly interviewType: "hr" | "technical";
  readonly profileSkills: string[];
  readonly jobRequiredSkills?: string[];
  readonly count: number;
  readonly language?: "en" | "he";
}

export function buildGenerateQuestionsPrompt(
  input: GenerateQuestionsPromptInput
): string {
  const schema = `{
  "questions": [
    {
      "id": string,
      "question": string,
      "topic": string,
      "expectedFocus": string
    }
  ]
}`;

  const language = input.language ?? "en";
  const jobSkills = input.jobRequiredSkills ?? [];

  return [
    SYSTEM_HEADER,
    "",
    `Task: generate exactly ${input.count} interview questions for a ${input.interviewType} interview.`,
    `Write the questions in ${language === "he" ? "Hebrew" : "English"}.`,
    'Use stable ids "q1", "q2", "q3", ... in order.',
    'Each question needs a short "topic" tag (e.g. "react", "system-design", "behavioral").',
    '"expectedFocus" describes what a strong answer should address.',
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    `The "questions" array must contain exactly ${input.count} items.`,
    "Every field must be a non-empty string. Do not add any additional fields.",
    "",
    formatStringList("Candidate skills", input.profileSkills),
    formatStringList("Job required skills", jobSkills),
  ].join("\n");
}

export interface EvaluateAnswerPromptInput {
  readonly question: string;
  readonly expectedFocus: string;
  readonly userAnswer: string;
  readonly interviewType: "hr" | "technical";
}

export function buildEvaluateAnswerPrompt(
  input: EvaluateAnswerPromptInput
): string {
  const schema = `{
  "score": number (0-100),
  "clarity": number (0-100),
  "correctness": number (0-100),
  "depth": number (0-100),
  "feedback": string,
  "improvementTips": string[]
}`;

  return [
    SYSTEM_HEADER,
    "",
    `Task: evaluate the candidate's answer to a ${input.interviewType} interview question.`,
    "Score clarity (how understandable the answer is), correctness (factual",
    "accuracy), and depth (how thoroughly it covers the expected focus).",
    '"score" is the overall weighted score.',
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    "All numeric fields must be numbers between 0 and 100 (inclusive).",
    'Do not use percentage strings like "85%".',
    '"improvementTips" must contain strings only — 2 or 3 concrete tips.',
    "",
    `Question: ${input.question}`,
    `Expected focus: ${input.expectedFocus}`,
    `Candidate answer: ${input.userAnswer}`,
  ].join("\n");
}

const RESUME_MAX_CHARS = 20000;

export function buildParseResumePrompt(resumeText: string): string {
  const schema = `{
  "personal_info": {
    "full_name": string | null,
    "email": string | null,
    "phone": string | null,
    "location": string | null,
    "linkedin_url": string | null,
    "portfolio_or_github_url": string | null
  },
  "professional_summary": string | null,
  "work_experience": [
    {
      "company_name": string | null,
      "job_title": string | null,
      "start_date": string | null,
      "end_date": string | null,
      "location": string | null,
      "responsibilities": string[],
      "achievements": string[]
    }
  ],
  "education": [
    {
      "institution_name": string | null,
      "degree_type": string | null,
      "field_of_study": string | null,
      "start_date": string | null,
      "end_date": string | null
    }
  ],
  "skills": {
    "technical_skills": string[],
    "soft_skills": string[],
    "tools_and_software": string[]
  },
  "projects": [
    {
      "project_name": string | null,
      "description": string | null,
      "technologies_used": string[],
      "link": string | null
    }
  ],
  "languages": [
    {
      "language": string | null,
      "proficiency_level": string | null
    }
  ],
  "certifications": [
    {
      "name": string | null,
      "issuer": string | null,
      "date": string | null
    }
  ],
  "awards": [
    {
      "title": string | null,
      "issuer": string | null,
      "date": string | null
    }
  ],
  "parsed_metadata": {
    "language_detected": "en" | "he" | "mixed" | "other" | null,
    "years_of_experience_estimate": number
  }
}`;

  const rules = [
    "Every top-level key listed above MUST be present.",
    "If a string field is unknown, return null — do NOT omit the key.",
    "If a list field has no entries, return [] — do NOT omit the key.",
    "Do not invent facts. If something is not in the resume, it is null or [].",
    "Preserve chronological order when it is clear from the source text.",
    'Dates should be "YYYY-MM" when month is known, "YYYY" when only year is known, or "present" for ongoing roles. Unknown dates are null.',
    "Preserve the original language for names, companies and locations. Translate long free-text summaries to English.",
    "Do NOT add any fields beyond those listed in the schema.",
    "parsed_metadata.years_of_experience_estimate must be a non-negative number.",
    'parsed_metadata.language_detected must be one of "en", "he", "mixed", "other", or null.',
  ].join("\n");

  const truncated = resumeText.length > RESUME_MAX_CHARS;
  const body = truncated
    ? `[truncated to ${RESUME_MAX_CHARS} chars]\n${resumeText.slice(0, RESUME_MAX_CHARS)}`
    : resumeText;

  return [
    SYSTEM_HEADER,
    "",
    "Task: extract a structured JSON representation of the candidate's resume below.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    rules,
    "",
    "Resume text:",
    body,
  ].join("\n");
}

export function buildAnalyzeProfilePrompt(profile: ProfileInput): string {
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
