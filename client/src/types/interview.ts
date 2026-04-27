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
