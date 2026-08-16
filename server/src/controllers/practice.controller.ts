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
import { enrichFromResume } from "../services/matching/resume-adapter";

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
async function loadSavedResume(userId: string): Promise<ParsedResume | null> {
  const saved = await UserProfileModel.findOne({ userId }).lean();
  return (saved?.profile as ParsedResume | undefined) ?? null;
}

function resumeSkills(resume: ParsedResume | null): string[] {
  if (!resume) return [];
  return [
    ...(resume.skills?.technical_skills ?? []),
    ...(resume.skills?.tools_and_software ?? []),
  ].filter((skill): skill is string => typeof skill === "string" && skill.trim() !== "");
}

/**
 * CV summaries for HR question generation.
 *
 * Reuses `enrichFromResume`, which already produces exactly these summaries for
 * the resume-aware match prompt, so HR grounding costs no new computation and
 * cannot drift from what matching sees.
 */
function buildCvContext(resume: ParsedResume | null) {
  if (!resume) return undefined;

  const enrichment = enrichFromResume(resume);
  const achievements = (resume.work_experience ?? [])
    .flatMap((entry) => entry.achievements ?? [])
    .filter((item): item is string => typeof item === "string" && item.trim() !== "");

  const context = {
    workExperienceSummary: enrichment.workExperienceSummary,
    topProjectsSummary: enrichment.topProjectsSummary,
    educationSummary: enrichment.educationSummary,
    achievements,
  };

  const hasAnything =
    Boolean(context.workExperienceSummary?.trim()) ||
    Boolean(context.topProjectsSummary?.trim()) ||
    Boolean(context.educationSummary?.trim()) ||
    achievements.length > 0;

  return hasAnything ? context : undefined;
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
    const savedResume = await loadSavedResume(userId);
    const profileSkills = resumeSkills(savedResume);
    // HR interviews are about the candidate's history, so they get the CV
    // summaries. Technical interviews stay scoped to the job's skills.
    const cvContext =
      interviewType === "hr" ? buildCvContext(savedResume) : undefined;
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
      cvContext,
    });

    const session = await PracticeSessionModel.create({
      userId: asObjectId(userId),
      jobId: jobId ? asObjectId(jobId) : undefined,
      interviewType,
      language,
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

    const [savedResume, excludeQuestions] = await Promise.all([
      loadSavedResume(userId),
      collectAskedQuestions(userId, session),
    ]);
    const profileSkills = resumeSkills(savedResume);
    const cvContext =
      session.interviewType === "hr" ? buildCvContext(savedResume) : undefined;

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
      // Reuse the session's own language. Sessions created before it was stored
      // have none, and English matches what they were generated with.
      language: session.language === "he" ? "he" : "en",
      excludeQuestions,
      cvContext,
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

type SessionForSummary = {
  interviewType: "hr" | "technical";
  jobId?: unknown;
  questions: { id: string; question: string }[];
  turns: {
    questionId: string;
    userAnswer: string;
    evaluation: {
      score: number;
      clarity: number;
      correctness: number;
      depth: number;
      feedback: string;
      improvementTips: string[];
    };
  }[];
};

/**
 * Builds the summarizer input from a session, or null when there is nothing to
 * summarize.
 */
async function buildSummaryInput(session: SessionForSummary) {
  if (session.turns.length === 0) return null;

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
    ? await JobModel.findOne({ _id: session.jobId })
        .select("title")
        .lean()
        .then((job) => job?.title)
    : undefined;

  return { interviewType: session.interviewType, answers, jobTitle };
}

export async function completePracticeSession(
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

    session.status = "completed";
    // Preserved across repeat calls, so completion stays idempotent: the first
    // completion's timestamp is the one that sticks.
    if (!session.completedAt) session.completedAt = new Date();

    // Generate the summary once, here, instead of on every view. Guarded on the
    // summary rather than on the previous status so that a completion whose
    // generation failed can succeed on a retry, while a session that already has
    // one is never summarized twice.
    //
    // Completion must never fail because of it: an unset summary is handled by
    // the fallback in getPracticeSummary.
    if (!session.summary) {
      try {
        const input = await buildSummaryInput(session);
        if (input) {
          session.summary = await summarizeInterviewAttempt(input);
        }
      } catch {
        // Left unset on purpose; the session is still completed.
      }
    }

    await session.save();

    return res.status(200).json(session.toJSON());
  } catch (err) {
    return next(err);
  }
}

/**
 * Lightweight list of the caller's sessions, newest first.
 *
 * Deliberately does not return questions or turns: the job drawer only needs
 * enough to show which attempts exist and how they scored.
 */
export async function listPracticeSessions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const filter: Record<string, unknown> = { userId: asObjectId(userId) };

    const { jobId, interviewType, status } = req.query;
    if (typeof jobId === "string" && jobId.trim() !== "") {
      filter.jobId = asObjectId(jobId);
    }
    if (interviewType === "hr" || interviewType === "technical") {
      filter.interviewType = interviewType;
    }
    if (status === "active" || status === "completed") {
      filter.status = status;
    }

    const sessions = await PracticeSessionModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .select("jobId interviewType status questions turns summary completedAt createdAt")
      .lean();

    const items = sessions.map((session) => {
      const answeredCount = session.turns?.length ?? 0;
      const scores = (session.turns ?? []).map((turn) => turn.evaluation?.score ?? 0);
      // Prefer the persisted summary's score; fall back to the mean of the
      // per-answer scores for sessions completed before summaries were stored.
      const overallScore =
        session.summary?.overallScore ??
        (scores.length > 0
          ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
          : null);

      return {
        id: String(session._id),
        jobId: session.jobId ? String(session.jobId) : null,
        interviewType: session.interviewType,
        status: session.status,
        questionCount: session.questions?.length ?? 0,
        answeredCount,
        overallScore,
        hasSummary: Boolean(session.summary),
        createdAt: session.createdAt ?? null,
        // Older completed sessions have no completedAt; fall back to createdAt
        // so ordering and display never break on them.
        completedAt: session.completedAt ?? session.createdAt ?? null,
      };
    });

    return res.status(200).json({ sessions: items });
  } catch (err) {
    return next(err);
  }
}

/**
 * Returns the session's summary.
 *
 * The summary used to be regenerated on every request, which re-billed the
 * provider for each page view and could return different text for the same
 * finished session. It is now generated at most once and persisted; this handler
 * only generates when a session has none, which covers sessions completed before
 * summaries were stored and ones whose generation failed at completion time.
 */
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
    });

    if (!session) {
      throw new HttpError(404, "NOT_FOUND", "Session not found");
    }

    if (session.summary) {
      return res.status(200).json(session.summary);
    }

    if (session.turns.length === 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "No answers to summarize");
    }

    const input = await buildSummaryInput(session);
    if (!input) {
      throw new HttpError(400, "VALIDATION_ERROR", "No answers to summarize");
    }

    const summary = await summarizeInterviewAttempt(input);

    // Only a finished session gets its summary stored. An active one can still
    // gain answers, and persisting a summary of the answers so far would pin a
    // partial result: completion skips generation when a summary already exists,
    // so the partial one would become the permanent final one.
    if (session.status === "completed") {
      session.summary = summary;
      await session.save();
    }

    return res.status(200).json(summary);
  } catch (err) {
    return next(err);
  }
}
