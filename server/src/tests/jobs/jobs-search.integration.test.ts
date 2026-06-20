import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { createApp } from "../../app";
import { JobModel } from "../../models/job.model";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

function fullMatch(finalScore: number) {
  return {
    finalScore,
    algorithmicScore: finalScore,
    aiSemanticScore: finalScore,
    matchedRequired: [],
    missingRequired: [],
    matchedAdvantage: [],
    explanation: "seed",
  };
}

describe("Job search & filtering API", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    // Ensure the text index exists before running $text queries.
    await JobModel.init();
    app = createApp();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  async function seedJob(
    userId: string,
    overrides: Record<string, unknown> = {}
  ) {
    return JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Generic Role",
      description: "A generic job description.",
      status: "applied",
      ...overrides,
    });
  }

  it("text search (q) returns only matching jobs", async () => {
    const { token, userId } = makeAuthToken();
    await seedJob(userId, {
      title: "React Developer",
      description: "Build UIs with React and TypeScript",
    });
    await seedJob(userId, {
      title: "Python Engineer",
      description: "Data pipelines in Python",
    });

    const res = await request(app)
      .get("/api/jobs?view=list&q=react")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("React Developer");
  });

  it("status filter returns only jobs in that status", async () => {
    const { token, userId } = makeAuthToken();
    await seedJob(userId, { status: "hr" });
    await seedJob(userId, { status: "technical" });

    const res = await request(app)
      .get("/api/jobs?view=list&status=hr")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe("hr");
  });

  it("minScore filters by matchAnalysis.finalScore", async () => {
    const { token, userId } = makeAuthToken();
    await seedJob(userId, { title: "High", matchAnalysis: fullMatch(90) });
    await seedJob(userId, { title: "Low", matchAnalysis: fullMatch(40) });

    const res = await request(app)
      .get("/api/jobs?view=list&minScore=50")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("High");
  });

  it("cursor pagination covers all items without overlap", async () => {
    const { token, userId } = makeAuthToken();
    for (let i = 0; i < 5; i++) {
      await seedJob(userId, { title: `Job ${i}` });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;

    do {
      const url: string =
        `/api/jobs?view=list&limit=2` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const res = await request(app).get(url).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      for (const item of res.body.items) {
        seen.push(String(item._id));
      }
      cursor = res.body.nextCursor;
      guard += 1;
    } while (cursor && guard < 10);

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("board view (default) returns the groupByStatus structure", async () => {
    const { token, userId } = makeAuthToken();
    await seedJob(userId, { status: "hr" });

    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const status of [
      "applied",
      "hr",
      "technical",
      "assignment",
      "manager",
      "offer",
      "not_relevant",
    ]) {
      expect(res.body).toHaveProperty(status);
    }
    expect(res.body.hr).toHaveLength(1);
  });

  it("does not return another user's jobs", async () => {
    const userA = makeAuthToken();
    await seedJob(userA.userId, { title: "A's job" });

    const userB = makeAuthToken();
    const res = await request(app)
      .get("/api/jobs?view=list")
      .set("Authorization", `Bearer ${userB.token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("rejects an invalid cursor with 400", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .get("/api/jobs?view=list&cursor=not-a-valid-cursor")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("creates a job with optional metadata fields", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .post("/api/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Frontend Engineer",
        company: "Acme Corp",
        description: "React and TypeScript role.",
        notes: "Referral from Alex",
        contact: "recruiter@acme.com",
        jobUrl: "https://acme.com/jobs/frontend",
        source: "manual",
        status: "applied",
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Frontend Engineer");
    expect(res.body.company).toBe("Acme Corp");
    expect(res.body.notes).toBe("Referral from Alex");
    expect(res.body.contact).toBe("recruiter@acme.com");
    expect(res.body.jobUrl).toBe("https://acme.com/jobs/frontend");
    expect(res.body.status).toBe("applied");
  });

  it("patches job details", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId, { title: "Old Title" });

    const res = await request(app)
      .patch(`/api/jobs/${String(job._id)}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "New Title",
        company: "Beta Inc",
        notes: "Follow up next week",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New Title");
    expect(res.body.company).toBe("Beta Inc");
    expect(res.body.notes).toBe("Follow up next week");
  });

  it("updates job pipeline status", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId, { status: "applied" });

    const res = await request(app)
      .patch(`/api/jobs/${String(job._id)}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "technical" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("technical");
  });

  it("deletes a job", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId);

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(String(job._id));

    const remaining = await JobModel.findById(job._id);
    expect(remaining).toBeNull();
  });
});
