import mongoose from "mongoose";
import request from "supertest";
import * as aiService from "../services/ai/ai.service";
import { createApp } from "../app";
import { MatchFlowModel } from "../models/match-flow.model";
import { UserModel } from "../models/user.model";
import { mockJobAnalysis, mockParsedResume } from "../services/ai/mock-ai.responses";
import { signAuthToken } from "../utils/auth";
import { sha256Hex } from "../utils/hash";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "./helpers/mongo-memory";

describe("POST /api/v1/match-flow/:id/match", () => {
  const JWT_SECRET = "test-jwt-secret-match-flow-match";

  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  beforeEach(async () => {
    await clearAllCollections();
    jest.restoreAllMocks();
  });

  async function seedUserAndFlow() {
    const email = `m${new mongoose.Types.ObjectId().toString()}@example.com`;
    const user = await UserModel.create({
      email,
      passwordHash: "test-hash",
      profile: {
        skills: ["react", "typescript"],
        experienceYears: 2,
        projects: ["HiredMe"],
        education: "BSc CS",
        goals: "Full-stack",
      },
    });

    const resumeText = "resume body for match flow xxxxx";
    const resumeTextHash = sha256Hex(resumeText);
    const jobDescription = "Looking for full-stack engineer xxxxx";
    const jobDescriptionHash = sha256Hex(jobDescription.trim());

    const flow = await MatchFlowModel.create({
      userId: user._id,
      extractedResumeText: resumeText,
      resumeTextHash,
      parsedResume: {
        ...mockParsedResume,
        raw_text_hash: resumeTextHash,
      },
      jobRawDescription: jobDescription,
      jobDescriptionHash,
      jobAnalysis: mockJobAnalysis,
      status: "job_analyzed",
    });

    const token = signAuthToken({
      userId: user._id.toString(),
      email: user.email,
    });

    return { user, flow, token };
  }

  it("calls calculateMatch once and returns scores on first POST", async () => {
    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");
    const { flow, token } = await seedUserAndFlow();

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.cached).toBe(false);
    expect(typeof res.body.data.matchReport.finalScore).toBe("number");
    expect(typeof res.body.data.matchReport.algorithmicScore).toBe("number");
    expect(typeof res.body.data.matchReport.aiSemanticScore).toBe("number");
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.status).toBe("matched");
    expect(loaded!.matchInputFingerprint).toBeTruthy();
    expect(loaded!.matchReport).toBeTruthy();
  });

  it("returns cached match without calling calculateMatch again when fingerprint unchanged", async () => {
    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");
    const { flow, token } = await seedUserAndFlow();

    const first = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
    expect(second.body.data.matchReport.finalScore).toBe(first.body.data.matchReport.finalScore);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);
  });

  it("calls calculateMatch again when user profile skills change (new fingerprint)", async () => {
    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");
    const { user, flow, token } = await seedUserAndFlow();

    const first = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { "profile.skills": ["react", "typescript", "docker"] } }
    );

    const second = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(false);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when parsedResume or jobAnalysis is missing", async () => {
    const email = `n${new mongoose.Types.ObjectId().toString()}@example.com`;
    const user = await UserModel.create({
      email,
      passwordHash: "x",
      profile: { skills: ["a"], experienceYears: 1, projects: [] },
    });
    const token = signAuthToken({ userId: user._id.toString(), email });

    const resumeText = "text xxxxx";
    const flow = await MatchFlowModel.create({
      userId: user._id,
      extractedResumeText: resumeText,
      resumeTextHash: sha256Hex(resumeText),
      jobDescriptionHash: sha256Hex("jd xxxxx"),
      jobAnalysis: mockJobAnalysis,
      status: "job_analyzed",
    });

    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(calculateMatchSpy).not.toHaveBeenCalled();
  });

  it("returns 422 when calculateMatch fails with calculateMatch: error", async () => {
    const { flow, token } = await seedUserAndFlow();
    jest.spyOn(aiService, "calculateMatch").mockRejectedValueOnce(
      new Error("calculateMatch: retry failed — first error: x; retry error: y")
    );

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("AI_VALIDATION_FAILED");
    expect(res.body.error.message).toContain("calculateMatch:");

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.matchReport).toBeUndefined();
  });

  it("returns 404 for another user's match flow", async () => {
    const { flow } = await seedUserAndFlow();
    const other = await UserModel.create({
      email: `o${new mongoose.Types.ObjectId().toString()}@example.com`,
      passwordHash: "x",
      profile: {},
    });
    const token = signAuthToken({
      userId: other._id.toString(),
      email: other.email,
    });

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 when user record is missing", async () => {
    const email = `orphan${new mongoose.Types.ObjectId().toString()}@example.com`;
    const user = await UserModel.create({
      email,
      passwordHash: "x",
      profile: { skills: [], experienceYears: 0, projects: [] },
    });
    const token = signAuthToken({ userId: user._id.toString(), email });

    const resumeText = "orphan resume xxxxx";
    const resumeTextHash = sha256Hex(resumeText);
    const flow = await MatchFlowModel.create({
      userId: user._id,
      extractedResumeText: resumeText,
      resumeTextHash,
      parsedResume: { ...mockParsedResume, raw_text_hash: resumeTextHash },
      jobRawDescription: "jd xxxxx",
      jobDescriptionHash: sha256Hex("jd xxxxx"),
      jobAnalysis: mockJobAnalysis,
      status: "job_analyzed",
    });

    await UserModel.deleteOne({ _id: user._id });

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/match`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("User not found");
  });
});
