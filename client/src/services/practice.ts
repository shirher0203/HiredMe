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

/** Lightweight view of a past attempt, as returned by the list endpoint. */
export interface PracticeSessionListItem {
  id: string;
  jobId: string | null;
  interviewType: InterviewType;
  status: "active" | "completed";
  questionCount: number;
  answeredCount: number;
  overallScore: number | null;
  hasSummary: boolean;
  createdAt: string | null;
  completedAt: string | null;
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

/**
 * Replaces the questions the user has not answered yet. Answered questions and
 * their evaluations are preserved by the server.
 */
export async function regeneratePracticeQuestions(
  sessionId: string
): Promise<{ questions: InterviewQuestion[] }> {
  return requestJson<{ questions: InterviewQuestion[] }>(
    `/api/practice/sessions/${sessionId}/regenerate`,
    {
      method: "POST",
      headers: requireAuthHeaders(),
    },
    "Failed to regenerate questions."
  );
}

/**
 * Past attempts, newest first. Optionally scoped to one application.
 */
export async function listPracticeSessions(
  filters: {
    jobId?: string;
    interviewType?: InterviewType;
    status?: "active" | "completed";
  } = {}
): Promise<{ sessions: PracticeSessionListItem[] }> {
  const params = new URLSearchParams();
  if (filters.jobId) params.set("jobId", filters.jobId);
  if (filters.interviewType) params.set("interviewType", filters.interviewType);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();

  return requestJson<{ sessions: PracticeSessionListItem[] }>(
    `/api/practice/sessions${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: requireAuthHeaders(),
    },
    "Failed to load practice history."
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
