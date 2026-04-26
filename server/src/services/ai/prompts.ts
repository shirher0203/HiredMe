// Prompt builders for the AI provider.
//
// Pure string builders — no I/O, no SDK imports, no JSON parsing. Every
// prompt demands strict JSON-only output and pins the exact response shape
// so downstream parsing / validation (safe-json.ts, ai.service.ts) stays
// boring.

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
