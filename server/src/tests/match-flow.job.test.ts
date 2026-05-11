import mongoose from "mongoose";
import request from "supertest";
import * as aiService from "../services/ai/ai.service";
import { createApp } from "../app";
import { MatchFlowModel } from "../models/match-flow.model";
import { mockJobAnalysis } from "../services/ai/mock-ai.responses";
import { signAuthToken } from "../utils/auth";
import { sha256Hex } from "../utils/hash";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "./helpers/mongo-memory";

describe("PATCH /api/v1/match-flow/:id/job", () => {
  const JWT_SECRET = "test-jwt-secret-match-flow-job";

  let app: ReturnType<typeof createApp>;
  let token: string;
  let userId: string;

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
    userId = new mongoose.Types.ObjectId().toString();
    token = signAuthToken({ userId, email: "u@example.com" });
    jest.restoreAllMocks();
  });

  async function createFlowForUser(uid: string) {
    return MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(uid),
      extractedResumeText: "resume body xxxxx",
      resumeTextHash: sha256Hex("resume body xxxxx"),
      status: "extracted",
    });
  }

  it("calls analyzeJob once and persists jobAnalysis on first PATCH", async () => {
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const flow = await createFlowForUser(userId);
    const description = "We need a senior backend engineer with Node.js";

    const res = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: description });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.cached).toBe(false);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
    expect(analyzeJobSpy).toHaveBeenCalledWith(description);

    expect(res.body.data.jobAnalysis).toMatchObject({
      roleTitle: mockJobAnalysis.roleTitle,
      seniorityLevel: mockJobAnalysis.seniorityLevel,
    });

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.status).toBe("job_analyzed");
    expect(loaded!.jobRawDescription).toBe(description);
    expect(loaded!.jobDescriptionHash).toBe(sha256Hex(description));
    expect(loaded!.jobAnalysis).toMatchObject({
      roleTitle: mockJobAnalysis.roleTitle,
    });
  });

  it("does not call analyzeJob again when jobDescription hash is unchanged (cache hit)", async () => {
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const flow = await createFlowForUser(userId);
    const description = "Same JD text for cache xxxxx";

    const first = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: description });
    expect(first.status).toBe(200);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: description });
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
  });

  it("calls analyzeJob again when job description changes", async () => {
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const flow = await createFlowForUser(userId);

    const first = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: "Version A of the role xxxxx" });
    expect(first.status).toBe(200);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: "Version B of the role xxxxx" });
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(false);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(2);
  });

  it("returns 400 for invalid body (missing or wrong type jobDescription)", async () => {
    const flow = await createFlowForUser(userId);
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");

    const missing = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const wrongType = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: 123 });
    expect(wrongType.status).toBe(400);

    const whitespace = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: "   \n\t  " });
    expect(whitespace.status).toBe(400);

    expect(analyzeJobSpy).not.toHaveBeenCalled();
  });

  it("returns 422 when analyzeJob fails with analyzeJob: validation error", async () => {
    const flow = await createFlowForUser(userId);
    jest.spyOn(aiService, "analyzeJob").mockRejectedValueOnce(
      new Error("analyzeJob: field 'summary' is not a non-empty string")
    );

    const res = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: "Some JD text xxxxx" });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe("error");
    expect(res.body.error.code).toBe("AI_VALIDATION_FAILED");
    expect(res.body.error.message).toContain("analyzeJob:");

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.jobAnalysis).toBeUndefined();
  });

  it("returns 404 for another user's match flow", async () => {
    const otherUserId = new mongoose.Types.ObjectId().toString();
    const flow = await createFlowForUser(otherUserId);

    const res = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: "JD xxxxx" });

    expect(res.status).toBe(404);
  });

  it("treats leading/trailing whitespace as trimmed for hashing (same cache as trimmed string)", async () => {
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const flow = await createFlowForUser(userId);
    const core = "Whitespace normalization test xxxxx";

    const first = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: `  ${core}  ` });
    expect(first.status).toBe(200);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
    expect(analyzeJobSpy).toHaveBeenCalledWith(core);

    const second = await request(app)
      .patch(`/api/v1/match-flow/${flow._id.toString()}/job`)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send({ jobDescription: core });
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
  });
});
