/**
 * Practice-session completion lifecycle.
 *
 * Two problems this pins down:
 *
 * 1. The interview page read the summary endpoint directly and never called
 *    complete, so sessions finished through the UI stayed `active` forever with
 *    no `completedAt`, and the summary was produced by the endpoint's recovery
 *    path rather than at completion.
 * 2. The summary endpoint persisted whatever it generated, including for a
 *    session still being answered. Because completion skips generation when a
 *    summary already exists, a summary of the first two answers could become the
 *    permanent summary of a five-answer attempt.
 *
 * The state machine itself is unchanged: completion is still a single explicit
 * act, and a session with unanswered questions may still be completed.
 */

jest.mock("../../services/ai/ai.service", () => {
  const actual = jest.requireActual("../../services/ai/ai.service");
  return {
    ...actual,
    summarizeInterviewAttempt: jest.fn(actual.summarizeInterviewAttempt),
  };
});

import request from "supertest";
import type { Express } from "express";
import mongoose, { Types } from "mongoose";
import { createApp } from "../../app";
import { PracticeSessionModel } from "../../models/practice-session.model";
import { summarizeInterviewAttempt } from "../../services/ai/ai.service";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

const mockedSummarize = summarizeInterviewAttempt as unknown as jest.Mock;

const EVALUATION = {
  score: 80,
  clarity: 82,
  correctness: 78,
  depth: 76,
  feedback: "Clear and specific.",
  improvementTips: ["Add an example"],
};

function turn(questionId: string, answer: string) {
  return {
    questionId,
    userAnswer: answer,
    evaluation: EVALUATION,
    createdAt: new Date("2026-04-01T10:00:00.000Z"),
  };
}

describe("Practice session completion lifecycle", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  beforeEach(() => {
    mockedSummarize.mockClear();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  /** Active session with two questions, the first already answered. */
  async function seedActiveSession(userId: string) {
    return PracticeSessionModel.create({
      userId: new Types.ObjectId(userId),
      interviewType: "technical",
      status: "active",
      questions: [
        { id: "q1", question: "What is a closure?", topic: "js", expectedFocus: "scope" },
        { id: "q2", question: "Explain the event loop.", topic: "js", expectedFocus: "async" },
      ],
      turns: [turn("q1", "A closure captures its surrounding scope.")],
    });
  }

  // (a) normal completion marks the session completed and stamps completedAt
  it("marks the session completed and stamps completedAt", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);

    const res = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.status).toBe("completed");
    expect(stored!.completedAt).toBeInstanceOf(Date);
  });

  it("surfaces the completed attempt in history with its score", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    const list = await request(app)
      .get("/api/practice/sessions?status=completed")
      .set("Authorization", `Bearer ${token}`);

    expect(list.status).toBe(200);
    expect(list.body.sessions).toHaveLength(1);
    expect(list.body.sessions[0].hasSummary).toBe(true);
    expect(list.body.sessions[0].completedAt).not.toBeNull();
    expect(typeof list.body.sessions[0].overallScore).toBe("number");
  });

  // (b) repeated completion does not duplicate summary generation
  it("keeps completion idempotent across repeated calls", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);

    const first = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
    const firstCompletedAt = first.body.completedAt;

    for (let i = 0; i < 3; i += 1) {
      const again = await request(app)
        .patch(`/api/practice/sessions/${session._id}/complete`)
        .set("Authorization", `Bearer ${token}`);
      expect(again.status).toBe(200);
      // The original timestamp survives, so completion is genuinely idempotent
      // rather than merely non-failing.
      expect(again.body.completedAt).toBe(firstCompletedAt);
    }

    expect(mockedSummarize).toHaveBeenCalledTimes(1);
  });

  it("retries generation on a later completion when the first attempt failed", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);
    mockedSummarize.mockRejectedValueOnce(new Error("provider exploded"));

    const first = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);
    // Completion is never blocked by summary generation.
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("completed");
    expect((await PracticeSessionModel.findById(session._id).lean())!.summary)
      .toBeUndefined();

    mockedSummarize.mockClear();

    const again = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(again.status).toBe(200);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
    expect((await PracticeSessionModel.findById(session._id).lean())!.summary)
      .toBeDefined();
  });

  // (c) an active session cannot pin a partial summary as its final one
  it("does not persist a summary generated for a still-active session", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);

    const res = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.summary).toBeUndefined();
    expect(stored!.status).toBe("active");
  });

  it("summarizes every answer once completed, not just those answered early", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);

    // Peek at the summary after one answer, the way an API client could.
    await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    // Then answer the remaining question.
    await PracticeSessionModel.updateOne(
      { _id: session._id },
      { $push: { turns: turn("q2", "The event loop drains the microtask queue first.") } }
    );

    mockedSummarize.mockClear();

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    // Regenerated at completion, and over both answers — the earlier one-answer
    // summary did not become the permanent result.
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
    expect(mockedSummarize.mock.calls[0][0].answers).toHaveLength(2);

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.summary).toBeDefined();
  });

  it("still stores the summary when a completed session had none", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedActiveSession(userId);
    await PracticeSessionModel.updateOne(
      { _id: session._id },
      { $set: { status: "completed" } }
    );

    const res = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.summary).toBeDefined();
  });

  // (d) legacy documents keep working
  it("completes a legacy session that predates completedAt and language", async () => {
    const { token, userId } = makeAuthToken();

    // Driver insert, so no schema defaults are applied: this is the shape of a
    // session written before either field existed.
    const inserted = await mongoose.connection
      .collection("practicesessions")
      .insertOne({
        userId: new Types.ObjectId(userId),
        interviewType: "technical",
        status: "active",
        questions: [
          { id: "q1", question: "Legacy question", topic: "general", expectedFocus: "Anything." },
        ],
        turns: [turn("q1", "A legacy answer with enough substance to summarize.")],
        createdAt: new Date("2026-01-01T09:00:00.000Z"),
        updatedAt: new Date("2026-01-01T09:00:00.000Z"),
      });

    const res = await request(app)
      .patch(`/api/practice/sessions/${inserted.insertedId}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");

    const stored = await PracticeSessionModel.findById(inserted.insertedId).lean();
    expect(stored!.completedAt).toBeInstanceOf(Date);
    expect(stored!.summary).toBeDefined();
  });

  it("leaves an already-completed legacy session's summary untouched", async () => {
    const { token, userId } = makeAuthToken();

    const existingSummary = {
      summary:
        "A previously stored summary that is long enough to satisfy the validator's lower bound on length.",
      overallScore: 71,
      preserve_points: ["Kept it concrete"],
      improve_points: ["Add more depth"],
      topics_covered: ["js"],
      overall_feedback: "Solid attempt overall, keep practising.",
    };

    const inserted = await mongoose.connection
      .collection("practicesessions")
      .insertOne({
        userId: new Types.ObjectId(userId),
        interviewType: "technical",
        status: "completed",
        questions: [
          { id: "q1", question: "Legacy question", topic: "general", expectedFocus: "Anything." },
        ],
        turns: [turn("q1", "A legacy answer.")],
        summary: existingSummary,
        createdAt: new Date("2026-01-01T09:00:00.000Z"),
        updatedAt: new Date("2026-01-01T09:00:00.000Z"),
      });

    const res = await request(app)
      .patch(`/api/practice/sessions/${inserted.insertedId}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockedSummarize).not.toHaveBeenCalled();
    expect(res.body.summary.overallScore).toBe(71);
  });
});
