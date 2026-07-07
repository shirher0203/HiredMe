import type { NextFunction, Request, Response } from "express";
import { PracticeSessionModel } from "../models/practice-session.model";
import { JobModel } from "../models/job.model";
import { HttpError } from "../utils/http-error";
import { asObjectId, requireIdParam, requireUser } from "./controller-utils";
import {
  evaluateAnswer,
  generateInterviewQuestions,
  summarizeInterviewAttempt,
} from "../services/ai/ai.service";

interface CreateSessionBody {
  interviewType: "hr" | "technical";
  count?: number;
  jobId?: string;
  language?: "he" | "en";
  profileSkills?: string[];
  jobRequiredSkills?: string[];
}

export async function createPracticeSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const body = (req.validated?.body ?? req.body ?? {}) as CreateSessionBody;

    const interviewType = body.interviewType;
    if (interviewType !== "hr" && interviewType !== "technical") {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid interviewType");
    }

    const count = typeof body.count === "number" ? body.count : 5;
    const profileSkills = Array.isArray(body.profileSkills)
      ? body.profileSkills.filter((s: unknown): s is string => typeof s === "string")
      : [];
    // Start from any skills the frontend supplied; if the linked job has its
    // own analyzed required skills, those take precedence below.
    let jobRequiredSkills = Array.isArray(body.jobRequiredSkills)
      ? body.jobRequiredSkills.filter((s: unknown): s is string => typeof s === "string")
      : undefined;
    const language = body.language === "he" ? "he" : "en";

    let jobId: string | undefined;
    if (typeof body.jobId === "string" && body.jobId.trim() !== "") {
      const job = await JobModel.findOne({
        _id: asObjectId(body.jobId),
        userId,
      }).lean();
      if (!job) {
        throw new HttpError(404, "NOT_FOUND", "Job not found");
      }
      jobId = String(job._id);

      const analyzedSkills = job.jobAnalysis?.requiredSkills;
      if (Array.isArray(analyzedSkills) && analyzedSkills.length > 0) {
        jobRequiredSkills = analyzedSkills.filter(
          (s: unknown): s is string => typeof s === "string"
        );
      }
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

export async function getPracticeSummary(
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
    }).lean();

    if (!session) {
      throw new HttpError(404, "NOT_FOUND", "Session not found");
    }

    if (session.turns.length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "No answers to summarize");
    }

    const answers = session.turns.map((turn) => {
      const question = session.questions.find((q) => q.id === turn.questionId);
      if (!question) {
        throw new HttpError(404, "NOT_FOUND", `Question ${turn.questionId} not found`);
      }
      return {
        questionId: turn.questionId,
        question: question.question,
        userAnswer: turn.userAnswer,
        evaluation: turn.evaluation,
      };
    });

    const jobTitle = session.jobId
      ? await JobModel.findOne({ _id: session.jobId }).select("title").lean().then((j) => j?.title)
      : undefined;

    const summary = await summarizeInterviewAttempt({
      interviewType: session.interviewType,
      answers,
      jobTitle,
    });

    return res.status(200).json(summary);
  } catch (err) {
    return next(err);
  }
}
