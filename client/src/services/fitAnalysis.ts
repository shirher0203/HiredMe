import { getAuthSession } from "./auth";
import type { JobAnalysis, MatchAnalysis } from "../types/matching";
import type { ParsedResume } from "../types/parsedResume";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export interface AnalyzeFitPreviewInput {
  jobDescription: string;
}

export interface AnalyzeFitPreviewResult {
  job: JobAnalysis;
  match: MatchAnalysis;
  parsedResume: ParsedResume;
}

export interface MatchResultNavigationState extends AnalyzeFitPreviewResult {
  jobDescription: string;
}

function buildAuthHeaders(): HeadersInit {
  const session = getAuthSession();
  if (!session) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}

export async function analyzeFitPreview(
  input: AnalyzeFitPreviewInput
): Promise<AnalyzeFitPreviewResult> {
  const response = await fetch(`${API_BASE_URL}/api/v1/cv/analyze-profile`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobDescription: input.jobDescription }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message ?? "Failed to analyze resume.";
    throw new Error(message);
  }

  return response.json() as Promise<AnalyzeFitPreviewResult>;
}
