import type { NextFunction, Request, Response } from "express";
import { asObjectId, requireIdParam, requireUser } from "./controller-utils";
import { createMatchFlowFromPdfUpload } from "../services/match-flow-resume.service";
import { parseResumeForMatchFlow } from "../services/match-flow.service";
import type {
  MatchFlowParseResumeData,
  MatchFlowResumeUploadData,
  SuccessResponse,
} from "../types/api.types";
import { HttpError } from "../utils/http-error";

export async function postMatchFlowParseResume(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const idParam = requireIdParam(req.params.id);
    const flowId = asObjectId(idParam);

    const result = await parseResumeForMatchFlow(flowId, userId);

    const response: SuccessResponse<MatchFlowParseResumeData> = {
      status: "success",
      data: result,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

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
