/**
 * Interview summaries are generated once, not per page view.
 *
 * The summary used to be regenerated on every GET, which re-billed the provider
 * for each view and could return different text for the same finished session.
 * The core regression here is the AI call count: two views must cost one call.
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
import { Types } from "mongoose";
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

describe("Practice summary persistence", () => {
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

  async function seedAnsweredSession(
    userId: string,
    overrides: Record<string, unknown> = {}
  ) {
    return PracticeSessionModel.create({
      userId: new Types.ObjectId(userId),
      interviewType: "technical",
      status: "active",
      questions: [
        { id: "q1", question: "What is a closure?", topic: "js", expectedFocus: "scope" },
        { id: "q2", question: "Explain event loop.", topic: "js", expectedFocus: "async" },
      ],
      turns: [
        {
          questionId: "q1",
          userAnswer: "A closure captures its surrounding scope.",
          evaluation: EVALUATION,
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
      ...overrides,
    });
  }

  it("generates the summary once at completion and persists it", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);

    const res = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.overallScore).toBe("number");
    expect(mockedSummarize).toHaveBeenCalledTimes(1);

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.summary).toBeDefined();
    expect(stored!.completedAt).toBeDefined();
  });

  it("serves two summary views with exactly one AI call in total", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);

    const first = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The whole point: viewing does not generate.
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
    expect(second.body).toEqual(first.body);
  });

  it("returns identical text for the same session across views", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    const views = await Promise.all(
      [1, 2, 3].map(() =>
        request(app)
          .get(`/api/practice/sessions/${session._id}/summary`)
          .set("Authorization", `Bearer ${token}`)
      )
    );

    const texts = new Set(views.map((view) => JSON.stringify(view.body)));
    expect(texts.size).toBe(1);
  });

  it("completes the session even when summary generation fails", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);
    mockedSummarize.mockRejectedValueOnce(new Error("provider exploded"));

    const res = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    // Completion must not be blocked by the summary.
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.summary).toBeUndefined();

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.status).toBe("completed");
    expect(stored!.summary).toBeUndefined();
  });

  it("recovers a missing summary on the next view, then stops generating", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);
    mockedSummarize.mockRejectedValueOnce(new Error("provider exploded"));

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);
    mockedSummarize.mockClear();

    const first = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
  });

  it("does not generate a summary at completion for a session with no answers", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId, { turns: [] });

    const res = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockedSummarize).not.toHaveBeenCalled();

    const summaryRes = await request(app)
      .get(`/api/practice/sessions/${session._id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(summaryRes.status).toBe(400);
  });

  it("does not regenerate when an already-completed session is completed again", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedAnsweredSession(userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);
    mockedSummarize.mockClear();

    const again = await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    expect(again.status).toBe(200);
    expect(mockedSummarize).not.toHaveBeenCalled();
  });
});

describe("Legacy sessions without a persisted summary", () => {
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

  /** A session exactly as the old code left it: no summary, no completedAt. */
  async function insertLegacySession(userId: string) {
    const result = await PracticeSessionModel.collection.insertOne({
      userId: new Types.ObjectId(userId),
      interviewType: "technical",
      status: "completed",
      questions: [
        { id: "q1", question: "What is a closure?", topic: "js", expectedFocus: "scope" },
      ],
      turns: [
        {
          questionId: "q1",
          userAnswer: "A closure captures its surrounding scope.",
          evaluation: EVALUATION,
          createdAt: new Date("2026-01-15T10:00:00.000Z"),
        },
      ],
      createdAt: new Date("2026-01-15T09:00:00.000Z"),
      updatedAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    return result.insertedId;
  }

  it("generates once, persists, and then makes no further AI call", async () => {
    const { token, userId } = makeAuthToken();
    const id = await insertLegacySession(userId);

    const first = await request(app)
      .get(`/api/practice/sessions/${id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);

    const stored = await PracticeSessionModel.findById(id).lean();
    expect(stored!.summary).toBeDefined();

    const second = await request(app)
      .get(`/api/practice/sessions/${id}/summary`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(mockedSummarize).toHaveBeenCalledTimes(1);
    expect(second.body).toEqual(first.body);
  });

  it("appears in the session list with a derived score", async () => {
    const { token, userId } = makeAuthToken();
    await insertLegacySession(userId);

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    const [item] = res.body.sessions;
    // No persisted summary, so the score is derived from the answers instead of
    // crashing or being reported as null.
    expect(item.hasSummary).toBe(false);
    expect(item.overallScore).toBe(EVALUATION.score);
  });

  it("sorts by createdAt when completedAt is absent", async () => {
    const { token, userId } = makeAuthToken();
    await insertLegacySession(userId);
    await insertLegacySession(userId);

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    for (const item of res.body.sessions) {
      // Falls back to createdAt rather than returning null.
      expect(item.completedAt).not.toBeNull();
    }
  });
});
