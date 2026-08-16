/**
 * Regenerating the unanswered questions in a practice session.
 *
 * The two properties that matter: the user gets different questions, and
 * nothing they already answered is disturbed. A regenerated session that
 * dropped an answered question's id would orphan the turn attached to it.
 */

import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { createApp } from "../../app";
import { JobModel } from "../../models/job.model";
import { PracticeSessionModel } from "../../models/practice-session.model";
import { UserProfileModel } from "../../models/user-profile.model";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

function resume() {
  return {
    raw_text_hash: "resume-hash",
    personal_info: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: "Security-track candidate.",
    work_experience: [],
    education: [],
    skills: {
      technical_skills: ["python", "cyber-attack"],
      soft_skills: ["teamwork"],
      tools_and_software: ["wireshark"],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: 1,
    },
  };
}

describe("Practice question regeneration", () => {
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

  async function startSession(token: string, userId: string, jobId?: string) {
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: resume(),
    });

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "technical", count: 4, ...(jobId ? { jobId } : {}) });

    expect(res.status).toBe(201);
    return res.body as {
      _id: string;
      questions: Array<{ id: string; question: string }>;
    };
  }

  it("replaces the unanswered questions", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(session.questions.length);
    const originalIds = session.questions.map((q) => q.id);
    for (const question of res.body.questions) {
      expect(originalIds).not.toContain(question.id);
    }
  });

  it("preserves answered questions and their turns", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);
    const answeredId = session.questions[0].id;
    const answeredText = session.questions[0].question;

    const answerRes = await request(app)
      .post(`/api/practice/sessions/${session._id}/msg`)
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: answeredId, userAnswer: "A considered answer with detail." });
    expect(answerRes.status).toBe(200);

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.questions.map((q: { id: string }) => q.id);
    expect(ids).toContain(answeredId);
    expect(res.body.questions[0].question).toBe(answeredText);

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored!.turns).toHaveLength(1);
    expect(stored!.turns[0].questionId).toBe(answeredId);
    // Every turn still points at a question that exists.
    const storedIds = new Set(stored!.questions.map((q) => q.id));
    for (const turn of stored!.turns) {
      expect(storedIds.has(turn.questionId)).toBe(true);
    }
  });

  it("regenerates only as many questions as are unanswered", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);

    for (const question of session.questions.slice(0, 2)) {
      await request(app)
        .post(`/api/practice/sessions/${session._id}/msg`)
        .set("Authorization", `Bearer ${token}`)
        .send({ questionId: question.id, userAnswer: "An answer with enough substance." });
    }

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(4);
    const answeredIds = session.questions.slice(0, 2).map((q) => q.id);
    const returnedIds = res.body.questions.map((q: { id: string }) => q.id);
    expect(returnedIds.slice(0, 2)).toEqual(answeredIds);
    for (const id of returnedIds.slice(2)) {
      expect(answeredIds).not.toContain(id);
    }
  });

  it("rejects regeneration once every question is answered", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);

    for (const question of session.questions) {
      await request(app)
        .post(`/api/practice/sessions/${session._id}/msg`)
        .set("Authorization", `Bearer ${token}`)
        .send({ questionId: question.id, userAnswer: "An answer with enough substance." });
    }

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("rejects regeneration for a completed session", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);

    await request(app)
      .patch(`/api/practice/sessions/${session._id}/complete`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's session", async () => {
    const owner = makeAuthToken();
    const intruder = makeAuthToken();
    const session = await startSession(owner.token, owner.userId);

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${intruder.token}`);

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId);

    const res = await request(app).post(
      `/api/practice/sessions/${session._id}/regenerate`
    );

    expect(res.status).toBe(401);
  });

  it("works for a session linked to a job", async () => {
    const { token, userId } = makeAuthToken();
    const job = await JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Security Researcher",
      description: "Security research role.",
      jobAnalysis: {
        roleTitle: "Security Researcher",
        requiredSkills: ["threat-detection", "python"],
        advantageSkills: [],
        seniorityLevel: "mid",
        summary: "Security role.",
      },
    });

    const session = await startSession(token, userId, String(job._id));

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.questions.length).toBeGreaterThan(0);
  });
});

describe("Session creation derives skills from the saved profile", () => {
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

  it("still accepts a profileSkills body field without failing validation", async () => {
    const { token, userId } = makeAuthToken();
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: resume(),
    });

    // The current client sends this; it is accepted and ignored rather than
    // rejected, so the field can be removed from the client separately.
    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        interviewType: "technical",
        count: 2,
        profileSkills: ["totally-unrelated-skill"],
      });

    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(2);
  });

  it("creates a session for a user with no saved profile", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "technical", count: 2 });

    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(2);
  });
});
