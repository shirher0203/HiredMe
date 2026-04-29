import type { NextFunction, Request, Response } from "express";
import { PracticeSessionModel } from "../models/practice-session.model";
import { JobModel } from "../models/job.model";
import { HttpError } from "../utils/http-error";
import { asObjectId, requireIdParam, requireUser } from "./controller-utils";
import {
  evaluateAnswer,
  generateInterviewQuestions,
} from "../services/ai/ai.service";

export async function createPracticeSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const interviewType = req.body?.interviewType;
    if (interviewType !== "hr" && interviewType !== "technical") {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid interviewType");
    }

    const count = typeof req.body?.count === "number" ? req.body.count : 5;
    const profileSkills = Array.isArray(req.body?.profileSkills)
      ? req.body.profileSkills.filter((s: unknown): s is string => typeof s === "string")
      : [];
    const jobRequiredSkills = Array.isArray(req.body?.jobRequiredSkills)
      ? req.body.jobRequiredSkills.filter((s: unknown): s is string => typeof s === "string")
      : undefined;
    const language = req.body?.language === "he" ? "he" : "en";

    let jobId: string | undefined;
    if (typeof req.body?.jobId === "string") {
      const job = await JobModel.findOne({
        _id: asObjectId(req.body.jobId),
        userId,
      }).lean();
      if (!job) {
        throw new HttpError(404, "NOT_FOUND", "Job not found");
      }
      jobId = String(job._id);
    }

    const { questions } = await generateInterviewQuestions({
      interviewType,
      profileSkills,
      jobRequiredSkills,
      count: Math.max(1, Math.min(10, count)),
      language,
    });

    const session = await PracticeSessionModel.create({
      userId: asObjectId(userId),
      jobId: jobId ? asObjectId(jobId) : undefined,
      interviewType,
      status: "active",
      questions,
      turns: [],
    });

    return res.status(201).json(session);
  } catch (err) {
    return next(err);
  }
}

export async function sendPracticeMessage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const sessionId = requireIdParam(req.params.id);
    const session = await PracticeSessionModel.findOne({
      _id: asObjectId(sessionId),
      userId,
    });
    if (!session) {
      throw new HttpError(404, "NOT_FOUND", "Session not found");
    }
    if (session.status === "completed") {
      throw new HttpError(400, "VALIDATION_ERROR", "Session already completed");
    }

    const questionId = req.body?.questionId;
    const userAnswer = req.body?.userAnswer;
    if (typeof questionId !== "string" || typeof userAnswer !== "string" || userAnswer.trim() === "") {
      throw new HttpError(400, "VALIDATION_ERROR", "questionId and userAnswer are required");
    }

    const question = session.questions.find((q) => q.id === questionId);
    if (!question) {
      throw new HttpError(404, "NOT_FOUND", "Question not found");
    }

    const evaluation = await evaluateAnswer({
      question: question.question,
      expectedFocus: question.expectedFocus,
      userAnswer: userAnswer.trim(),
      interviewType: session.interviewType,
    });

    session.turns.push({
      questionId,
      userAnswer: userAnswer.trim(),
      evaluation,
      createdAt: new Date(),
    });
    await session.save();

    return res.status(200).json({ evaluation });
  } catch (err) {
    return next(err);
  }
}

export async function completePracticeSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const sessionId = requireIdParam(req.params.id);
    const session = await PracticeSessionModel.findOneAndUpdate(
      { _id: asObjectId(sessionId), userId },
      { $set: { status: "completed" } },
      { new: true }
    ).lean();
    if (!session) {
      throw new HttpError(404, "NOT_FOUND", "Session not found");
    }

    return res.status(200).json(session);
  } catch (err) {
    return next(err);
  }
}
