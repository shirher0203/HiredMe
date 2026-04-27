export interface JobAnalysis {
  roleTitle: string;
  requiredSkills: string[];
  advantageSkills: string[];
  seniorityLevel: "junior" | "mid" | "senior";
  summary: string;
}

export interface MatchAnalysis {
  finalScore: number;
  algorithmicScore: number;
  aiSemanticScore: number;
  matchedRequired: string[];
  missingRequired: string[];
  matchedAdvantage: string[];
  explanation: string;
}
