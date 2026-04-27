import { mockFitPreviewJob, mockFitPreviewMatch } from "../mocks/fitPreview";
import type { JobAnalysis, MatchAnalysis } from "../types/matching";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface AnalyzeFitPreviewInput {
  jobDescription: string;
  resumeFile: File;
}

export interface AnalyzeFitPreviewResult {
  job: JobAnalysis;
  match: MatchAnalysis;
}

export async function analyzeFitPreview(
  input: AnalyzeFitPreviewInput
): Promise<AnalyzeFitPreviewResult> {
  void input;
  await delay(750);
  return {
    job: mockFitPreviewJob,
    match: mockFitPreviewMatch,
  };
}
