export type InterviewType = "hr" | "technical";

export interface InterviewQuestion {
  id: string;
  question: string;
  topic: string;
  expectedFocus: string;
}

export interface AnswerEvaluation {
  score: number;
  clarity: number;
  correctness: number;
  depth: number;
  feedback: string;
  improvementTips: string[];
}

export interface InterviewAttemptSummary {
  summary: string;
  overallScore: number;
  preserve_points: string[];
  improve_points: string[];
  topics_covered: string[];
  overall_feedback: string;
}
