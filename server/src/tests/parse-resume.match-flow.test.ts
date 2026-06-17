import mongoose from "mongoose";
import request from "supertest";
import * as aiService from "../services/ai/ai.service";
import { createApp } from "../app";
import { MatchFlowModel } from "../models/match-flow.model";
import { signAuthToken } from "../utils/auth";
import { sha256Hex } from "../utils/hash";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "./helpers/mongo-memory";

describe("POST /api/v1/match-flow/:id/parse-resume", () => {
  const JWT_SECRET = "test-jwt-secret-parse-resume-match-flow";

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

  it("calls parseResume once, persists parsedResume with raw_text_hash matching sha256 of extracted text", async () => {
    const parseResumeSpy = jest.spyOn(aiService, "parseResume");

    const text = "hello world xxxxx";
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      extractedResumeText: text,
      resumeTextHash: sha256Hex(text),
      status: "extracted",
    });

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.cached).toBe(false);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);
    expect(parseResumeSpy).toHaveBeenCalledWith(text);

    const expectedHash = sha256Hex(text);
    expect(res.body.data.parsedResume.raw_text_hash).toBe(expectedHash);

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.status).toBe("parsed");
    expect((loaded!.parsedResume as { raw_text_hash: string }).raw_text_hash).toBe(
      expectedHash
    );
  });

  it("does not call parseResume again when raw_text_hash still matches current text hash (cache hit)", async () => {
    const parseResumeSpy = jest.spyOn(aiService, "parseResume");

    const text = "cached resume body xxxxx";
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      extractedResumeText: text,
      resumeTextHash: sha256Hex(text),
      status: "extracted",
    });

    const first = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(true);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);
  });

  it("calls parseResume again when extracted text changes (new hash)", async () => {
    const parseResumeSpy = jest.spyOn(aiService, "parseResume");

    const text = "version one xxxxx";
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      extractedResumeText: text,
      resumeTextHash: sha256Hex(text),
      status: "extracted",
    });

    const first = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);

    const text2 = `${text}X`;
    await MatchFlowModel.updateOne(
      { _id: flow._id },
      {
        $set: {
          extractedResumeText: text2,
          resumeTextHash: sha256Hex(text2),
        },
      }
    );

    const second = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.cached).toBe(false);
    expect(parseResumeSpy).toHaveBeenCalledTimes(2);
    expect(second.body.data.parsedResume.raw_text_hash).toBe(sha256Hex(text2));
  });

  it("returns 400 when extractedResumeText is empty (before AI)", async () => {
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      extractedResumeText: "",
      resumeTextHash: "",
      status: "uploaded",
    });

    const parseResumeSpy = jest.spyOn(aiService, "parseResume");

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(parseResumeSpy).not.toHaveBeenCalled();
  });

  it("returns 422 when parseResume fails with a parseResume: validation error", async () => {
    const text = "trigger failure xxxxx";
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      extractedResumeText: text,
      resumeTextHash: sha256Hex(text),
      status: "extracted",
    });

    jest.spyOn(aiService, "parseResume").mockRejectedValueOnce(
      new Error("parseResume: retry failed — first error: bad; retry error: worse")
    );

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.status).toBe("error");
    expect(res.body.error.code).toBe("AI_VALIDATION_FAILED");
    expect(res.body.error.message).toContain("parseResume:");

    const loaded = await MatchFlowModel.findById(flow._id).lean();
    expect(loaded!.parsedResume).toBeUndefined();
  });

  it("returns 404 for another user's match flow", async () => {
    const otherUserId = new mongoose.Types.ObjectId().toString();
    const text = "private xxxxx";
    const flow = await MatchFlowModel.create({
      userId: new mongoose.Types.ObjectId(otherUserId),
      extractedResumeText: text,
      resumeTextHash: sha256Hex(text),
      status: "extracted",
    });

    const res = await request(app)
      .post(`/api/v1/match-flow/${flow._id.toString()}/parse-resume`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
