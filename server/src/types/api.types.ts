import type { ParsedResume } from "../services/ai/parsed-resume.types";
import type { JobAnalysis, MatchAnalysis } from "../services/matching/matching.types";

export interface SuccessResponse<TData> {
  status: "success";
  data: TData;
}

export interface ErrorResponse {
  status: "error";
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ExtractCvTextData {
  filename: string;
  pageCount: number;
  extractedText: string;
}

export interface MatchFlowResumeUploadData {
  matchFlowId: string;
  resumeTextHash: string;
  textLength: number;
  pageCount: number;
  filename: string;
}

export interface MatchFlowParseResumeData {
  parsedResume: ParsedResume;
  cached: boolean;
}

export interface MatchFlowJobAnalysisData {
  jobAnalysis: JobAnalysis;
  cached: boolean;
}

export interface MatchFlowMatchData {
  matchReport: MatchAnalysis;
  cached: boolean;
}

export interface MatchFlowFullPipelineData {
  matchFlowId: string;
  filename: string;
  pageCount: number;
  resumeTextHash: string;
  jobDescriptionHash: string;
  parsedResume: ParsedResume;
  jobAnalysis: JobAnalysis;
  matchReport: MatchAnalysis;
  pipelineCached: boolean;
  usedCached: {
    parseResume: boolean;
    jobAnalysis: boolean;
    match: boolean;
  };
}
