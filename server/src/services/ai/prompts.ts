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
  },
  "suggested_skills": [
    {
      "skill": string,
      "reason": string,
      "confidence": number (0-100)
    }
  ]
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
    "",
    "suggested_skills rules:",
    "This is a RECOMMENDATION list, not a verified skills list. Prioritize recall over precision.",
    "The user reviews and approves each entry manually on a follow-up screen, so over-suggesting is the desired failure mode. Missing relevant skills is the failure mode to avoid.",
    "If the resume strongly indicates a software role, return a long ranked list of potentially relevant skills even when individual confidence is only moderate.",
    "Target: 50+ entries whenever the resume has enough signal. For typical software-engineering resumes, prefer 75-100 entries.",
    "Each entry is a skill the candidate likely knows but did NOT list explicitly anywhere in skills.technical_skills, skills.tools_and_software, or projects[].technologies_used.",
    "Do NOT repeat any skill that already appears in those three places (case-insensitive).",
    "Cover adjacent technologies, tools, frameworks, methodologies, languages, cloud / DevOps, testing, observability, and concepts that are commonly paired with what the candidate already knows. Include lower-confidence adjacent skills near the bottom of the list rather than omitting them.",
    'skill: short canonical name in lowercase (e.g. "react", "docker", "graphql"). Single token or hyphenated. No version numbers, no marketing names.',
    'reason: one short sentence (10-200 chars) explaining why this is a likely skill (e.g. "commonly used together with React in modern frontend stacks").',
    "confidence: integer between 0 and 100 that reflects certainty. Higher = stronger evidence from the resume. Lower-confidence entries (e.g. 30-60) are expected and welcome — do not stop after only high-confidence suggestions.",
    "Sort the array by confidence descending. Keep emitting until the list is exhausted, not after a quality cutoff.",
    "Only return an empty array when the resume contains too little signal to suggest anything reasonable.",
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

export interface SummarizeAttemptPromptInput {
  readonly interviewType: "hr" | "technical";
  readonly answers: ReadonlyArray<{
    readonly questionId: string;
    readonly question: string;
    readonly userAnswer: string;
    readonly evaluation: {
      readonly score: number;
      readonly clarity: number;
      readonly correctness: number;
      readonly depth: number;
      readonly feedback: string;
      readonly improvementTips: string[];
    };
  }>;
  readonly computedAverageScore: number | null;
  readonly jobTitle?: string;
  readonly profileSkills?: string[];
}

const ATTEMPT_ANSWER_MAX_CHARS = 2000;

export function buildSummarizeAttemptPrompt(
  input: SummarizeAttemptPromptInput
): string {
  const schema = `{
  "summary": string,
  "overallScore": number (0-100),
  "preserve_points": string[],
  "improve_points": string[],
  "topics_covered": string[],
  "overall_feedback": string
}`;

  const rules = [
    `summary: 50-800 character paragraph describing how the candidate performed across the ${input.interviewType} interview. Synthesize across all answers; do NOT copy per-answer evaluation feedback verbatim.`,
    "overallScore: integer in 0-100. Reflect the candidate's overall performance across all answers, weighted by importance.",
    "preserve_points: 1-2 short strings (10-200 chars each) — concrete things the candidate should keep doing.",
    "improve_points: 1-2 short strings (10-200 chars each) — concrete things the candidate should work on.",
    "topics_covered: 0-15 short topic tags (1-60 chars each), lowercase and deduped.",
    "overall_feedback: 20-300 character closing note addressed to the candidate.",
    "Do not invent topics the candidate did not answer about. Do not repeat the same point in both preserve_points and improve_points.",
  ].join("\n");

  const answerLines: string[] = [];
  for (let i = 0; i < input.answers.length; i++) {
    const a = input.answers[i];
    const truncated = a.userAnswer.length > ATTEMPT_ANSWER_MAX_CHARS;
    const body = truncated
      ? `[truncated to ${ATTEMPT_ANSWER_MAX_CHARS} chars]\n${a.userAnswer.slice(
          0,
          ATTEMPT_ANSWER_MAX_CHARS
        )}`
      : a.userAnswer;
    answerLines.push(
      `--- Answer ${i + 1} (${a.questionId}) ---`,
      `Question: ${a.question}`,
      `Candidate answer: ${body}`,
      `Evaluation: score=${a.evaluation.score}, clarity=${a.evaluation.clarity}, correctness=${a.evaluation.correctness}, depth=${a.evaluation.depth}.`,
      `Evaluation feedback: ${a.evaluation.feedback}`
    );
  }

  const contextLines: string[] = [];
  if (input.jobTitle) contextLines.push(`Target role: ${input.jobTitle}`);
  if (input.profileSkills && input.profileSkills.length > 0) {
    contextLines.push(
      formatStringList("Candidate skills", input.profileSkills)
    );
  }
  if (input.computedAverageScore !== null) {
    contextLines.push(
      `Computed average score across answers: ${input.computedAverageScore}`
    );
  }

  return [
    SYSTEM_HEADER,
    "",
    `Task: summarize the candidate's performance on a completed ${input.interviewType} interview with ${input.answers.length} answered question(s).`,
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    rules,
    "",
    ...contextLines,
    "",
    ...answerLines,
  ].join("\n");
}

export interface EvaluateHomeAssignmentPromptInput {
  readonly code: string;
  readonly language?: string;
  readonly jobContext?: string;
}

const HOME_ASSIGNMENT_MAX_CHARS = 20000;

export function buildEvaluateHomeAssignmentPrompt(
  input: EvaluateHomeAssignmentPromptInput
): string {
  // TODO(role3): prompt tuning — member 3 will calibrate the scoring rubric
  // and wording later. Keep the JSON schema and field names stable so the
  // validator in ai.service.ts does not need to change.
  const schema = `{
  "score": number (0-100),
  "summary": string,
  "strengths": string[],
  "improvements": string[]
}`;

  const truncated = input.code.length > HOME_ASSIGNMENT_MAX_CHARS;
  const code = truncated
    ? `[truncated to ${HOME_ASSIGNMENT_MAX_CHARS} chars]\n${input.code.slice(
        0,
        HOME_ASSIGNMENT_MAX_CHARS
      )}`
    : input.code;

  const lines = [
    SYSTEM_HEADER,
    "",
    "Task: evaluate the candidate's home assignment code submission below.",
    "Score overall quality (correctness, readability, structure, and best practices).",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    '"score" must be a number between 0 and 100 (inclusive). Do not use a percentage string.',
    '"strengths" and "improvements" must contain strings only — 2 or 3 concrete items each.',
    "",
  ];
  if (input.language) {
    lines.push(`Programming language: ${input.language}`);
  }
  if (input.jobContext) {
    lines.push(`Target role context: ${input.jobContext}`);
  }
  lines.push("", "Code submission:", code);
  return lines.join("\n");
}

export interface AnalyzeGithubRepoPromptInput {
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: string[];
  stars: number;
  readme: string | null;
  packageJson: string | null;
}

const GITHUB_README_MAX_CHARS = 8000;
const GITHUB_PACKAGE_JSON_MAX_CHARS = 4000;

export function buildAnalyzeGithubRepoPrompt(
  input: AnalyzeGithubRepoPromptInput
): string {
  // TODO(role3): prompt tuning — member 3 will calibrate the rubric and
  // wording later. Keep the JSON schema and field names stable so the
  // validator in ai.service.ts does not need to change.
  const schema = `{
  "architectureSummary": string,
  "codeQualityScore": number (0-100),
  "strengths": string[],
  "concerns": string[],
  "detectedStack": string[]
}`;

  const readme =
    input.readme && input.readme.length > GITHUB_README_MAX_CHARS
      ? `${input.readme.slice(0, GITHUB_README_MAX_CHARS)}\n[truncated]`
      : input.readme ?? "(no README)";
  const packageJson =
    input.packageJson && input.packageJson.length > GITHUB_PACKAGE_JSON_MAX_CHARS
      ? `${input.packageJson.slice(0, GITHUB_PACKAGE_JSON_MAX_CHARS)}\n[truncated]`
      : input.packageJson ?? "(no package.json)";

  return [
    SYSTEM_HEADER,
    "",
    "Task: analyze the GitHub repository below and assess its architecture and code quality.",
    "",
    "Respond with a single JSON object that matches exactly this schema:",
    schema,
    "",
    '"codeQualityScore" must be a number between 0 and 100 (inclusive).',
    '"strengths", "concerns", and "detectedStack" must contain strings only.',
    "",
    `Repository: ${input.fullName}`,
    `Description: ${input.description ?? "(none)"}`,
    `Primary language: ${input.primaryLanguage ?? "(unknown)"}`,
    formatStringList("Languages", input.languages),
    `Stars: ${input.stars}`,
    "",
    "package.json:",
    packageJson,
    "",
    "README:",
    readme,
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
