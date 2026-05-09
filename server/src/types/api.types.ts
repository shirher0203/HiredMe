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
