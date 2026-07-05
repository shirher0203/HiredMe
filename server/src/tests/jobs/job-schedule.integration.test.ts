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

function futureStartAt(hoursFromNow = 24): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe("Job interview scheduling API", () => {
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

  async function seedJob(userId: string, overrides: Record<string, unknown> = {}) {
    return JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Frontend Engineer",
      company: "Google",
      description: "Build UIs with React.",
      status: "technical",
      ...overrides,
    });
  }

  it("schedules an interview for a technical job", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId);
    const startAt = futureStartAt();

    const res = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt });

    expect(res.status).toBe(200);
    expect(res.body.scheduledInterview).toBeTruthy();
    expect(res.body.scheduledInterview.startAt).toBe(startAt);
    const endAt = new Date(res.body.scheduledInterview.endAt).getTime();
    const startMs = new Date(startAt).getTime();
    expect(endAt - startMs).toBe(60 * 60 * 1000);
  });

  it("includes scheduledInterview in board view", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    await seedJob(userId, {
      scheduledInterview: {
        startAt: new Date(startAt),
        endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .get("/api/jobs?view=board")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.technical).toHaveLength(1);
    expect(res.body.technical[0].scheduledInterview.startAt).toBeTruthy();
  });

  it("unschedules an interview while keeping the job", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    const job = await seedJob(userId, {
      scheduledInterview: {
        startAt: new Date(startAt),
        endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.scheduledInterview).toBeNull();

    const stored = await JobModel.findById(job._id).lean();
    expect(stored?.scheduledInterview).toBeNull();
  });

  it("rejects scheduling for non-technical jobs", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId, { status: "applied" });

    const res = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt: futureStartAt() });

    expect(res.status).toBe(409);
  });

  it("rejects scheduling in the past", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId);
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt: past });

    expect(res.status).toBe(400);
  });

  it("removes schedule when the job is deleted", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    const job = await seedJob(userId, {
      scheduledInterview: {
        startAt: new Date(startAt),
        endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const stored = await JobModel.findById(job._id).lean();
    expect(stored).toBeNull();
  });
});
