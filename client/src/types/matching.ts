export interface JobAnalysis {
  roleTitle: string;
  requiredSkills: string[];
  advantageSkills: string[];
  seniorityLevel: "junior" | "mid" | "senior";
  summary: string;
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
  educationFit?: string;
  experienceFit?: string;
  projectFit?: string;
  languageFit?: string;
  resumeInsights?: string[];
  matchingEvidence?: string[];
}
