import type { NextFunction, Request, Response } from "express";
import { PracticeSessionModel } from "../models/practice-session.model";
import { JobModel } from "../models/job.model";
import { UserProfileModel } from "../models/user-profile.model";
import { HttpError } from "../utils/http-error";
import { asObjectId, requireIdParam, requireUser } from "./controller-utils";
import {
  evaluateAnswer,
  generateInterviewQuestions,
  summarizeInterviewAttempt,
} from "../services/ai/ai.service";
import type { ParsedResume } from "../services/ai/parsed-resume.types";

interface CreateSessionBody {
  interviewType: "hr" | "technical";
  count?: number;
  jobId?: string;
  language?: "he" | "en";
  /** Accepted and ignored: skills are read from the saved profile. */
  profileSkills?: string[];
  jobRequiredSkills?: string[];
}

/** How many of the user's recent sessions contribute already-asked questions. */
const EXCLUSION_HISTORY_SESSIONS = 3;

/**
 * Reads the candidate's skills from their saved profile.
 *
 * The client used to supply these in the request body, which meant the client
 * decided what the model saw about the user. Deriving them here makes the
 * question set a function of the stored profile instead.
 */
async function loadProfileSkills(userId: string): Promise<string[]> {
  const saved = await UserProfileModel.findOne({ userId }).lean();
  if (!saved?.profile) return [];
  const resume = saved.profile as ParsedResume;
  return [
    ...(resume.skills?.technical_skills ?? []),
    ...(resume.skills?.tools_and_software ?? []),
  ].filter((skill): skill is string => typeof skill === "string" && skill.trim() !== "");
}

/**
 * Question texts the user has already been asked: everything in this session,
 * plus their recent sessions for the same job.
 */
async function collectAskedQuestions(
  userId: string,
  session: { _id: unknown; jobId?: unknown; questions: { question: string }[] }
): Promise<string[]> {
  const asked = new Set<string>();
  for (const question of session.questions) asked.add(question.question);

  const priorFilter: Record<string, unknown> = {
    userId: asObjectId(userId),
    _id: { $ne: session._id },
  };
  if (session.jobId) priorFilter.jobId = session.jobId;

  const prior = await PracticeSessionModel.find(priorFilter)
    .sort({ createdAt: -1 })
    .limit(EXCLUSION_HISTORY_SESSIONS)
    .select("questions")
    .lean();

  for (const previous of prior) {
    for (const question of previous.questions ?? []) {
      if (question?.question) asked.add(question.question);
    }
  }

  return [...asked];
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
    // body.profileSkills is still accepted by the schema for one release so the
    // current client keeps working, but it is deliberately not read.
    const profileSkills = await loadProfileSkills(userId);
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

/**
 * Replaces the questions the candidate has not answered yet.
 *
 * Answered questions and their turns are left completely alone: a turn whose
 * questionId disappeared would be an orphan, and the answers already given are
 * the part of the session worth keeping.
 */
export async function regeneratePracticeQuestions(
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
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Cannot regenerate questions for a completed session"
      );
    }

    const answeredIds = new Set(session.turns.map((turn) => turn.questionId));
    const answered = session.questions.filter((q) => answeredIds.has(q.id));
    const unansweredCount = session.questions.length - answered.length;
    if (unansweredCount === 0) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Every question in this session has been answered"
      );
    }

    const [profileSkills, excludeQuestions] = await Promise.all([
      loadProfileSkills(userId),
      collectAskedQuestions(userId, session),
    ]);

    let jobRequiredSkills: string[] | undefined;
    if (session.jobId) {
      const job = await JobModel.findOne({ _id: session.jobId, userId })
        .select("jobAnalysis")
        .lean();
      const analyzedSkills = job?.jobAnalysis?.requiredSkills;
      if (Array.isArray(analyzedSkills) && analyzedSkills.length > 0) {
        jobRequiredSkills = analyzedSkills.filter(
          (s: unknown): s is string => typeof s === "string"
        );
      }
    }

    const { questions: generated } = await generateInterviewQuestions({
      interviewType: session.interviewType,
      profileSkills,
      jobRequiredSkills,
      count: unansweredCount,
      excludeQuestions,
    });

    // Fresh ids for the replacements so they cannot collide with an answered
    // question's id, which would re-attach an old turn to a new question.
    const answeredIdSet = new Set(answered.map((q) => q.id));
    const replacements = generated.map((question, index) => {
      let id = `r${session.turns.length + index + 1}`;
      let suffix = 0;
      while (answeredIdSet.has(id)) {
        suffix += 1;
        id = `r${session.turns.length + index + 1}-${suffix}`;
      }
      answeredIdSet.add(id);
      return { ...question, id };
    });

    session.set("questions", [
      ...answered.map((question) => ({
        id: question.id,
        question: question.question,
        topic: question.topic,
        expectedFocus: question.expectedFocus,
      })),
      ...replacements,
    ]);
    await session.save();

    return res.status(200).json({ questions: session.questions });
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
