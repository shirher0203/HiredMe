import type { NextFunction, Request, Response } from "express";
import { HomeAssignmentModel } from "../models/home-assignment.model";
import { JobModel } from "../models/job.model";
import { HttpError } from "../utils/http-error";
import { requireUser, asObjectId, requireIdParam } from "./controller-utils";
import { evaluateHomeAssignment } from "../services/ai/ai.service";
import { extractTextFromBuffer } from "../services/pdf.service";

const PDF_MIME_TYPE = "application/pdf";

async function extractSubmissionText(
  file: Express.Multer.File
): Promise<string> {
  if (file.mimetype === PDF_MIME_TYPE) {
    const { text } = await extractTextFromBuffer(file.buffer);
    return text;
  }

  const text = file.buffer.toString("utf8");
  if (text.trim().length === 0) {
    throw new HttpError(400, "EMPTY_FILE", "Uploaded file is empty");
  }
  return text;
}

export async function createAssignment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    if (!req.file) {
      throw new HttpError(400, "MISSING_FILE", "Assignment file is required");
    }

    const language =
      typeof req.body?.language === "string" ? req.body.language : undefined;

    let jobId: string | undefined;
    let jobContext: string | undefined;
    if (typeof req.body?.jobId === "string" && req.body.jobId.trim() !== "") {
      const job = await JobModel.findOne({
        _id: asObjectId(req.body.jobId),
        userId,
      }).lean();
      if (!job) {
        throw new HttpError(404, "NOT_FOUND", "Job not found");
      }
      jobId = String(job._id);
      jobContext = job.description;
    }

    const submittedText = await extractSubmissionText(req.file);
    const evaluation = await evaluateHomeAssignment({
      code: submittedText,
      language,
      jobContext,
    });

    const assignment = await HomeAssignmentModel.create({
      userId: asObjectId(userId),
      jobId: jobId ? asObjectId(jobId) : undefined,
      fileName: req.file.originalname,
      language,
      submittedText,
      evaluation,
      evaluatedAt: new Date(),
    });

    return res.status(201).json({
      id: String(assignment._id),
      fileName: assignment.fileName,
      language: assignment.language ?? null,
      jobId: assignment.jobId ? String(assignment.jobId) : null,
      evaluation: assignment.evaluation,
      evaluatedAt: assignment.evaluatedAt,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAssignments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const items = await HomeAssignmentModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json(items);
  } catch (err) {
    return next(err);
  }
}

export async function getAssignmentById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const id = requireIdParam(req.params.id);
    const item = await HomeAssignmentModel.findOne({
      _id: asObjectId(id),
      userId,
    }).lean();
    if (!item) {
      throw new HttpError(404, "NOT_FOUND", "Assignment not found");
    }
    return res.status(200).json(item);
  } catch (err) {
    return next(err);
  }
}
