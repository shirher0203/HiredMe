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
 * How a profile skill relates to a required skill.
 *
 * `exact`   — the same string on both sides.
 * `alias`   — different wording, same canonical skill (react.js / react).
 * `related` — an explicitly asserted relationship, either from the job's
 *             `skillRelations` or from the curated `SKILL_RELATIONS` map.
 *             Belonging to the same family is deliberately NOT enough.
 * `none`    — no relationship established.
 */
export type SkillMatchTier = "exact" | "alias" | "related" | "none";

export interface SkillMatchResult {
  tier: SkillMatchTier;
  /** Fraction of the requirement this match satisfies. */
  credit: number;
  /** The profile skill that produced the match, canonical form. */
  matchedBy: string | null;
  /** Human-readable justification, safe to show in the UI. */
  reason: string;
  /** Family of the required skill, when the taxonomy knows it. */
  family?: string;
}

/**
 * Final per-(user, job) match result.
 * Produced by `buildDeterministicMatch` / `calculateMatch`.
 * `finalScore` and `algorithmicScore` are computed in deterministic code;
 * `aiSemanticScore` and `explanation` come from the AI semantic-match call.
 *
 * The `...Fit` / `resumeInsights` / `matchingEvidence` fields are populated
 * only when `calculateMatch` is called with a `ParsedResume`. They are
 * qualitative context from the AI layer and never feed back into the
 * numeric score.
 */
export interface MatchAnalysis {
  finalScore: number;
  algorithmicScore: number;
  aiSemanticScore: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedAdvantage: string[];
  explanation: string;
  educationFit?: string;
  experienceFit?: string;
  projectFit?: string;
  languageFit?: string;
  resumeInsights?: string[];
  matchingEvidence?: string[];
}

/**
 * Optional enrichment fields threaded through `buildDeterministicMatch`
 * when the caller wants the resume-aware signals on the returned
 * `MatchAnalysis`. All fields are optional; any that are `undefined`
 * are simply not included on the output.
 */
export interface MatchAnalysisExtras {
  educationFit?: string;
  experienceFit?: string;
  projectFit?: string;
  languageFit?: string;
  resumeInsights?: string[];
  matchingEvidence?: string[];
}
