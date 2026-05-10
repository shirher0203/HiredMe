import type { ParsedResume } from "../services/ai/parsed-resume.types";

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
