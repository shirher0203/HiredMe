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
/**
 * Structured result of job-description analysis.
 *
 * The fields after `summary` were added later and are all optional, so job
 * documents written before they existed still load and still match — they fall
 * back to the curated relation map instead of the job's own assertions.
 *
 * `requiredSkills` and `advantageSkills` are persisted in canonical form.
 * `toolsMentioned` and `impliedSkills` exist so recall does not have to be
 * bought by polluting the scored list. `nonSkillRequirements` holds years,
 * degrees and soft asks: displayed, never scored.
 */
export interface JobAnalysis {
  roleTitle: string;
  requiredSkills: string[];
  advantageSkills: string[];
  seniorityLevel: "junior" | "mid" | "senior";
  summary: string;
  toolsMentioned?: string[];
  impliedSkills?: string[];
  nonSkillRequirements?: string[];
  /** Canonical skill -> canonical terms the model asserts are transferable. */
  skillRelations?: Record<string, string[]>;
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
 * One row of the match explanation: which requirement, what satisfied it, how
 * strongly, and why. Every point of the deterministic score is traceable to one
 * of these, which is what makes the score defensible on screen.
 */
export interface SkillMatchDetail {
  required: string;
  matchedBy: string | null;
  tier: SkillMatchTier;
  credit: number;
  reason: string;
  family?: string;
  /**
   * Where the matching profile skill came from.
   *
   * `skills`     — a skills array on the profile.
   * `experience` — harvested verbatim from CV prose (role, responsibility,
   *                achievement, project or field of study).
   */
  source?: "skills" | "experience";
}

/**
 * The deterministic score, broken into the evidence that produced it.
 *
 * Kept on the analysis for testing, debugging and support: the public UI shows a
 * candidate-facing summary, but the components are what make a score arguable
 * after the fact. Every field is additive into `algorithmicScore`.
 */
export interface MatchScoreComponents {
  /** Graded required-skill coverage, 0-100. The dominant term. */
  coverageScore: number;
  /** Preferred skills the candidate already has. */
  advantageBonus: number;
  /** Explicitly named tools/technologies the candidate overlaps with. */
  toolsBonus: number;
  /** Relevant professional experience. Zero without domain overlap. */
  domainExperienceBonus: number;
  /** Formal qualification, only when the job asks for one. */
  educationBonus: number;
  /** 0..1 — how much domain overlap was established at all. */
  domainRelevance: number;
  /** Distinct matched signals across required, advantage and tools. */
  relevanceSignals: number;
  matchedToolsCount: number;
  toolsConsidered: number;
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
  /** Deterministic score: graded skill coverage plus the advantage bonus. */
  algorithmicScore: number;
  aiSemanticScore: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedAdvantage: string[];
  explanation: string;
  /** Per-requirement breakdown. Absent on matches computed before it existed. */
  matchDetails?: SkillMatchDetail[];
  /** 0..1 — how much of the earned credit came from related rather than exact matches. */
  relatedShare?: number;
  /** Requirements that were actually scoreable, i.e. excluding years and degrees. */
  scorableRequiredCount?: number;
  advantageBonus?: number;
  /** Tools/technologies from the job the candidate demonstrably overlaps with. */
  matchedTools?: string[];
  /** Additive breakdown of `algorithmicScore`. Absent on older matches. */
  scoreComponents?: MatchScoreComponents;
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
