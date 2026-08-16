/**
 * GET /api/practice/sessions — the list the job drawer needs to show prior
 * attempts. Ownership, filtering and ordering are the properties worth pinning:
 * a list endpoint that leaks another user's sessions is the failure that matters.
 */

import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { createApp } from "../../app";
import { JobModel } from "../../models/job.model";
import { PracticeSessionModel } from "../../models/practice-session.model";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

function evaluation(score: number) {
  return {
    score,
    clarity: score,
    correctness: score,
    depth: score,
    feedback: "Feedback.",
    improvementTips: ["Tip"],
  };
}

describe("Practice session history", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  async function seedSession(
    userId: string,
    overrides: Record<string, unknown> = {}
  ) {
    return PracticeSessionModel.create({
      userId: new Types.ObjectId(userId),
      interviewType: "technical",
      status: "active",
      questions: [
        { id: "q1", question: "Q1?", topic: "js", expectedFocus: "focus" },
        { id: "q2", question: "Q2?", topic: "js", expectedFocus: "focus" },
      ],
      turns: [
        {
          questionId: "q1",
          userAnswer: "An answer.",
          evaluation: evaluation(70),
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
      ...overrides,
    });
  }

  it("returns an empty list for a user with no sessions", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it("returns a lightweight view without questions or turns", async () => {
    const { token, userId } = makeAuthToken();
    await seedSession(userId);

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const [item] = res.body.sessions;
    expect(Object.keys(item).sort()).toEqual([
      "answeredCount",
      "completedAt",
      "createdAt",
      "hasSummary",
      "id",
      "interviewType",
      "jobId",
      "overallScore",
      "questionCount",
      "status",
    ]);
    expect(item.questionCount).toBe(2);
    expect(item.answeredCount).toBe(1);
  });

  it("only returns the caller's own sessions", async () => {
    const owner = makeAuthToken();
    const other = makeAuthToken();
    await seedSession(owner.userId);
    await seedSession(other.userId);

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.body.sessions).toHaveLength(1);
  });

  it("filters by jobId", async () => {
    const { token, userId } = makeAuthToken();
    const jobA = await JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Role A",
      description: "A",
    });
    const jobB = await JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Role B",
      description: "B",
    });
    await seedSession(userId, { jobId: jobA._id });
    await seedSession(userId, { jobId: jobB._id });

    const res = await request(app)
      .get(`/api/practice/sessions?jobId=${jobA._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].jobId).toBe(String(jobA._id));
  });

  it("returns an empty list for another user's jobId", async () => {
    const owner = makeAuthToken();
    const other = makeAuthToken();
    const job = await JobModel.create({
      userId: new Types.ObjectId(other.userId),
      title: "Their role",
      description: "Theirs",
    });
    await seedSession(other.userId, { jobId: job._id });

    const res = await request(app)
      .get(`/api/practice/sessions?jobId=${job._id}`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.body.sessions).toEqual([]);
  });

  it("filters by interviewType and status", async () => {
    const { token, userId } = makeAuthToken();
    await seedSession(userId, { interviewType: "hr", status: "completed" });
    await seedSession(userId, { interviewType: "technical", status: "active" });

    const hr = await request(app)
      .get("/api/practice/sessions?interviewType=hr")
      .set("Authorization", `Bearer ${token}`);
    expect(hr.body.sessions).toHaveLength(1);
    expect(hr.body.sessions[0].interviewType).toBe("hr");

    const active = await request(app)
      .get("/api/practice/sessions?status=active")
      .set("Authorization", `Bearer ${token}`);
    expect(active.body.sessions).toHaveLength(1);
    expect(active.body.sessions[0].status).toBe("active");
  });

  it("rejects an unknown filter value", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .get("/api/practice/sessions?status=archived")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("orders newest first", async () => {
    const { token, userId } = makeAuthToken();
    const older = await seedSession(userId);
    const newer = await seedSession(userId);
    await PracticeSessionModel.updateOne(
      { _id: older._id },
      { $set: { createdAt: new Date("2026-01-01T00:00:00.000Z") } }
    );
    await PracticeSessionModel.updateOne(
      { _id: newer._id },
      { $set: { createdAt: new Date("2026-06-01T00:00:00.000Z") } }
    );

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.sessions.map((s: { id: string }) => s.id)).toEqual([
      String(newer._id),
      String(older._id),
    ]);
  });

  it("reports the persisted summary score for completed sessions", async () => {
    const { token, userId } = makeAuthToken();
    const session = await seedSession(userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    const [item] = res.body.sessions;
    expect(item.status).toBe("completed");
    expect(item.hasSummary).toBe(true);
    expect(typeof item.overallScore).toBe("number");
    expect(item.completedAt).not.toBeNull();
  });

  it("reports a null score for a session with no answers", async () => {
    const { token, userId } = makeAuthToken();
    await seedSession(userId, { turns: [] });

    const res = await request(app)
      .get("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.sessions[0].overallScore).toBeNull();
    expect(res.body.sessions[0].answeredCount).toBe(0);
  });

  it("supports comparing two attempts for the same job", async () => {
    const { token, userId } = makeAuthToken();
    const job = await JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Role",
      description: "D",
    });
    const first = await seedSession(userId, {
      jobId: job._id,
      turns: [
        {
          questionId: "q1",
          userAnswer: "First attempt.",
          evaluation: evaluation(60),
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
    });
    const second = await seedSession(userId, {
      jobId: job._id,
      turns: [
        {
          questionId: "q1",
          userAnswer: "Second attempt, better.",
          evaluation: evaluation(85),
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
        },
      ],
    });
    await PracticeSessionModel.updateOne(
      { _id: first._id },
      { $set: { createdAt: new Date("2026-04-01T09:00:00.000Z") } }
    );
    await PracticeSessionModel.updateOne(
      { _id: second._id },
      { $set: { createdAt: new Date("2026-05-01T09:00:00.000Z") } }
    );

    const res = await request(app)
      .get(`/api/practice/sessions?jobId=${job._id}`)
      .set("Authorization", `Bearer ${token}`);

    const scores = res.body.sessions.map((s: { overallScore: number }) => s.overallScore);
    // Newest first, so the delta the client shows is scores[0] - scores[1].
    expect(scores).toEqual([85, 60]);
    expect(scores[0] - scores[1]).toBe(25);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/practice/sessions");

    expect(res.status).toBe(401);
  });
});
