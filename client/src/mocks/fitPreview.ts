import type { JobAnalysis, MatchAnalysis } from "../types/matching";

export const mockFitPreviewJob: JobAnalysis = {
  roleTitle: "Junior Full-Stack Developer",
  requiredSkills: ["react", "node", "mongodb", "typescript"],
  advantageSkills: ["docker", "aws"],
  seniorityLevel: "junior",
  summary:
    "Junior full-stack role building React and Node features on a MongoDB-backed TypeScript stack.",
};

export const mockFitPreviewMatch: MatchAnalysis = {
  finalScore: 74,
  algorithmicScore: 75,
  aiSemanticScore: 72,
  matchedRequired: ["react", "node", "typescript"],
  missingRequired: ["mongodb"],
  matchedAdvantage: [],
  explanation:
    "Strong semantic fit on React, Node, and TypeScript; MongoDB experience is implied but not demonstrated.",
};
