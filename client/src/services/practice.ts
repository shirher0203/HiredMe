import { getAuthSession } from "./auth";
import type { InterviewQuestion, InterviewType, AnswerEvaluation } from "../types/interview";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export interface PracticeSession {
  _id: string;
  jobId?: string;
  interviewType: InterviewType;
  status: "active" | "completed";
  questions: InterviewQuestion[];
  turns: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePracticeSessionInput {
  interviewType: InterviewType;
  jobId?: string;
  count?: number;
  language?: "he" | "en";
  profileSkills?: string[];
  jobRequiredSkills?: string[];
}

export interface InterviewAttemptSummary {
  summary: string;
  overallScore: number;
  preserve_points: string[];
  improve_points: string[];
  topics_covered: string[];
  overall_feedback: string;
}

function requireAuthHeaders(): HeadersInit {
  const session = getAuthSession();
  if (!session) {
    throw new Error("You must be logged in.");
  }

  return {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  };
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackError: string
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackError));
  }

  return response.json() as Promise<T>;
}

export async function createPracticeSession(
  input: CreatePracticeSessionInput
): Promise<PracticeSession> {
  return requestJson<PracticeSession>(
    "/api/practice/sessions",
    {
      method: "POST",
      headers: requireAuthHeaders(),
      body: JSON.stringify(input),
    },
    "Failed to create practice session."
  );
}

export async function sendPracticeMessage(
  sessionId: string,
  questionId: string,
  userAnswer: string
): Promise<{ evaluation: AnswerEvaluation }> {
  return requestJson<{ evaluation: AnswerEvaluation }>(
    `/api/practice/sessions/${sessionId}/msg`,
    {
      method: "POST",
      headers: requireAuthHeaders(),
      body: JSON.stringify({ questionId, userAnswer }),
    },
    "Failed to evaluate answer."
  );
}

export async function getPracticeSummary(
  sessionId: string
): Promise<InterviewAttemptSummary> {
  return requestJson<InterviewAttemptSummary>(
    `/api/practice/sessions/${sessionId}/summary`,
    {
      method: "GET",
      headers: requireAuthHeaders(),
    },
    "Failed to get practice summary."
  );
}
