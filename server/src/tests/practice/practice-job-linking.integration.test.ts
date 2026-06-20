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

describe("Practice session job-linking", () => {
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

  async function seedAnalyzedJob(userId: string) {
    return JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Backend Role",
      description: "Node + MongoDB backend role.",
      status: "applied",
      jobAnalysis: {
        roleTitle: "Backend Developer",
        requiredSkills: ["node", "mongodb", "typescript"],
        advantageSkills: ["docker"],
        seniorityLevel: "junior",
        summary: "Junior backend role.",
      },
    });
  }

  it("creates a session linked to a job that has jobAnalysis", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "technical", jobId: String(job._id) });

    expect(res.status).toBe(201);
    expect(String(res.body.jobId)).toBe(String(job._id));
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeGreaterThan(0);
  });

  it("creates a general session without a jobId (regression)", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "hr" });

    expect(res.status).toBe(201);
    expect(res.body.jobId).toBeUndefined();
    expect(res.body.questions.length).toBeGreaterThan(0);
  });

  it("returns 404 when the jobId belongs to another user", async () => {
    const userA = makeAuthToken();
    const job = await seedAnalyzedJob(userA.userId);

    const userB = makeAuthToken();
    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ interviewType: "technical", jobId: String(job._id) });

    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid interviewType", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "coding" });

    expect(res.status).toBe(400);
  });
});
