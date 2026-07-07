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

function scheduleWindow(startAt: string) {
  return {
    startAt: new Date(startAt),
    endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
  };
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
    expect(res.body.stageSchedules.technical).toBeTruthy();
    expect(res.body.stageSchedules.technical.startAt).toBe(startAt);
    const endAt = new Date(res.body.stageSchedules.technical.endAt).getTime();
    const startMs = new Date(startAt).getTime();
    expect(endAt - startMs).toBe(60 * 60 * 1000);
    expect(res.body.stageSchedules.hr).toBeNull();
  });

  it("includes stageSchedules in board view", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    await seedJob(userId, {
      stageSchedules: {
        technical: scheduleWindow(startAt),
      },
    });

    const res = await request(app)
      .get("/api/jobs?view=board")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.technical).toHaveLength(1);
    expect(res.body.technical[0].stageSchedules.technical.startAt).toBeTruthy();
  });

  it("unschedules an interview while keeping the job", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    const job = await seedJob(userId, {
      stageSchedules: {
        technical: scheduleWindow(startAt),
      },
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stageSchedules.technical).toBeNull();

    const stored = await JobModel.findById(job._id).lean();
    expect(stored?.stageSchedules?.technical).toBeUndefined();
  });

  it("schedules an interview for an HR job", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId, { status: "hr" });

    const res = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt: futureStartAt() });

    expect(res.status).toBe(200);
    expect(res.body.stageSchedules.hr).toBeTruthy();
  });

  it("keeps HR schedule when job moves to technical", async () => {
    const { token, userId } = makeAuthToken();
    const hrStartAt = futureStartAt(24);
    const job = await seedJob(userId, {
      status: "hr",
      stageSchedules: {
        hr: scheduleWindow(hrStartAt),
      },
    });

    const moveRes = await request(app)
      .patch(`/api/jobs/${String(job._id)}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "technical" });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body.stageSchedules.hr.startAt).toBe(hrStartAt);
    expect(moveRes.body.stageSchedules.technical).toBeNull();
  });

  it("stores independent schedules per stage", async () => {
    const { token, userId } = makeAuthToken();
    const hrStartAt = futureStartAt(24);
    const technicalStartAt = futureStartAt(48);
    const job = await seedJob(userId, {
      status: "hr",
      stageSchedules: {
        hr: scheduleWindow(hrStartAt),
      },
    });

    await request(app)
      .patch(`/api/jobs/${String(job._id)}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "technical" });

    const scheduleRes = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt: technicalStartAt });

    expect(scheduleRes.status).toBe(200);
    expect(scheduleRes.body.stageSchedules.hr.startAt).toBe(hrStartAt);
    expect(scheduleRes.body.stageSchedules.technical.startAt).toBe(technicalStartAt);
  });

  it("unschedules only the current stage", async () => {
    const { token, userId } = makeAuthToken();
    const hrStartAt = futureStartAt(24);
    const technicalStartAt = futureStartAt(48);
    const job = await seedJob(userId, {
      status: "technical",
      stageSchedules: {
        hr: scheduleWindow(hrStartAt),
        technical: scheduleWindow(technicalStartAt),
      },
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stageSchedules.technical).toBeNull();
    expect(res.body.stageSchedules.hr.startAt).toBe(hrStartAt);
  });

  it("unschedules a legacy scheduledInterview-only job", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    const job = await seedJob(userId, {
      status: "technical",
      scheduledInterview: scheduleWindow(startAt),
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stageSchedules.technical).toBeNull();

    const stored = await JobModel.findById(job._id).lean();
    expect(stored?.stageSchedules?.technical).toBeUndefined();
    expect(stored?.scheduledInterview).toBeUndefined();
  });

  it("unschedules when both legacy scheduledInterview and stageSchedules exist", async () => {
    const { token, userId } = makeAuthToken();
    const legacyStartAt = futureStartAt(24);
    const stageStartAt = futureStartAt(48);
    const job = await seedJob(userId, {
      status: "technical",
      scheduledInterview: scheduleWindow(legacyStartAt),
      stageSchedules: {
        technical: scheduleWindow(stageStartAt),
      },
    });

    const res = await request(app)
      .delete(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stageSchedules.technical).toBeNull();

    const stored = await JobModel.findById(job._id).lean();
    expect(stored?.stageSchedules?.technical).toBeUndefined();
    expect(stored?.scheduledInterview).toBeUndefined();
  });

  it("migrates legacy scheduledInterview into stageSchedules on read", async () => {
    const { token, userId } = makeAuthToken();
    const startAt = futureStartAt();
    await seedJob(userId, {
      status: "technical",
      scheduledInterview: scheduleWindow(startAt),
    });

    const res = await request(app)
      .get("/api/jobs?view=board")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.technical[0].stageSchedules.technical.startAt).toBe(startAt);
  });

  it("rejects scheduling for application-stage jobs", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedJob(userId, { status: "applied" });

    const res = await request(app)
      .post(`/api/jobs/${String(job._id)}/schedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startAt: futureStartAt() });

    expect(res.status).toBe(409);
  });

  it("rejects scheduling for offer and not relevant jobs", async () => {
    const { token, userId } = makeAuthToken();
    for (const status of ["offer", "not_relevant"] as const) {
      const job = await seedJob(userId, { status });

      const res = await request(app)
        .post(`/api/jobs/${String(job._id)}/schedule`)
        .set("Authorization", `Bearer ${token}`)
        .send({ startAt: futureStartAt() });

      expect(res.status).toBe(409);
    }
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
      stageSchedules: {
        technical: scheduleWindow(startAt),
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
