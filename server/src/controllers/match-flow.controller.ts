import type { NextFunction, Request, Response } from "express";
import { createMatchFlowFromPdfUpload } from "../services/match-flow-resume.service";
import type { MatchFlowResumeUploadData, SuccessResponse } from "../types/api.types";
import { HttpError } from "../utils/http-error";

export async function postMatchFlowResume(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new HttpError(401, "UNAUTHORIZED", "Missing user context");
    }

    if (!req.file) {
      throw new HttpError(400, "MISSING_FILE", "PDF file is required");
    }

    const result = await createMatchFlowFromPdfUpload({
      userId,
      buffer: req.file.buffer,
      filename: req.file.originalname,
    });

    const response: SuccessResponse<MatchFlowResumeUploadData> = {
      status: "success",
      data: result,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
