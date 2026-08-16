export interface JobAnalysis {
  roleTitle: string;
  requiredSkills: string[];
  advantageSkills: string[];
  seniorityLevel: "junior" | "mid" | "senior";
  summary: string;
}

export type SkillMatchTier = "exact" | "alias" | "related" | "none";

/**
 * One row of the match explanation: which requirement, what satisfied it, how
 * strongly, and why. Absent on matches computed before graded scoring existed.
 */
export interface SkillMatchDetail {
  required: string;
  matchedBy: string | null;
  tier: SkillMatchTier;
  credit: number;
  reason?: string;
  family?: string;
}

/**
 * The resume-aware fields are only present when the match was computed with a
 * saved CV profile, and are absent on jobs analyzed before they were stored.
 */
export interface MatchAnalysis {
  finalScore: number;
  algorithmicScore: number;
  aiSemanticScore: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedAdvantage: string[];
  explanation: string;
  matchDetails?: SkillMatchDetail[];
  relatedShare?: number;
  scorableRequiredCount?: number;
  advantageBonus?: number;
  educationFit?: string;
  experienceFit?: string;
  projectFit?: string;
  languageFit?: string;
  resumeInsights?: string[];
  matchingEvidence?: string[];
}
