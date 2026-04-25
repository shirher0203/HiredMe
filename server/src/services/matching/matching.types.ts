/**
 * Shared TypeScript contracts for the Role 4 matching layer.
 *
 * Produced by: Role 4 (matching service, AI service).
 * Consumed by: Role 4 internal code, and later by Role 3 (Backend Lead)
 * from controllers. Types are plain data — no runtime dependencies.
 */

/**
 * User profile data passed into the matching / AI layer.
 * Supplied by the Backend Lead, reflecting the user's persisted profile.
 */
export interface ProfileInput {
  readonly skills: string[];
  readonly experienceYears: number;
  readonly projects: string[];
  readonly education?: string;
  readonly goals?: string;
}

/**
 * Raw job input used when asking the AI to analyze a job description.
 * Produced by the caller (Backend); consumed by `analyzeJob`.
 */
export interface JobAnalysisInput {
  readonly jobDescription: string;
  readonly companyName?: string;
  readonly roleTitle?: string;
}

/**
 * Structured result of job-description analysis.
 * Produced by `analyzeJob` (AI service); consumed by `calculateMatch`
 * and persisted by the Backend on the job document.
 */
export interface JobAnalysis {
  roleTitle: string;
  requiredSkills: string[];
  advantageSkills: string[];
  seniorityLevel: "junior" | "mid" | "senior";
  summary: string;
}

/**
 * Final per-(user, job) match result.
 * Produced by `buildDeterministicMatch` / `calculateMatch`.
 * `finalScore` and `algorithmicScore` are computed in deterministic code;
 * `aiSemanticScore` and `explanation` come from the AI semantic-match call.
 */
export interface MatchAnalysis {
  finalScore: number;
  algorithmicScore: number;
  aiSemanticScore: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedAdvantage: string[];
  explanation: string;
}
