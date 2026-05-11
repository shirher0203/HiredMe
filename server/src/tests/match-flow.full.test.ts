import mongoose from "mongoose";
import request from "supertest";
import * as aiService from "../services/ai/ai.service";
import { createApp } from "../app";
import { MatchFlowModel } from "../models/match-flow.model";
import { UserModel } from "../models/user.model";
import { extractTextFromBuffer } from "../services/pdf.service";
import { signAuthToken } from "../utils/auth";
import { sha256Hex } from "../utils/hash";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "./helpers/mongo-memory";

jest.mock("../services/pdf.service", () => ({
  extractTextFromBuffer: jest.fn(),
}));

const mockedExtract = extractTextFromBuffer as jest.MockedFunction<
  typeof extractTextFromBuffer
>;

describe("POST /api/v1/match-flow (full pipeline)", () => {
  const JWT_SECRET = "test-jwt-secret-match-flow-full";

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
    mockedExtract.mockReset();
    jest.restoreAllMocks();
  });

  const resumeText = "full pipeline resume text xxxxx";
  const jobDescription = "Full pipeline job description xxxxx";

  function mockPdfSuccess() {
    mockedExtract.mockResolvedValue({ text: resumeText, pageCount: 2 });
  }

  it("runs extract → parse → analyze → match; terminal status matched and artifacts present", async () => {
    mockPdfSuccess();

    const parseResumeSpy = jest.spyOn(aiService, "parseResume");
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");

    const email = `full${new mongoose.Types.ObjectId().toString()}@example.com`;
    await UserModel.create({
      email,
      passwordHash: "x",
      profile: {
        skills: ["react", "node"],
        experienceYears: 1,
        projects: ["P1"],
      },
    });
    const token = signAuthToken({
      userId: (await UserModel.findOne({ email }).lean())!._id.toString(),
      email,
    });

    const res = await request(app)
      .post("/api/v1/match-flow")
      .set("Authorization", `Bearer ${token}`)
      .field("jobDescription", jobDescription)
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.pipelineCached).toBe(false);
    expect(res.body.data.usedCached).toEqual({
      parseResume: false,
      jobAnalysis: false,
      match: false,
    });
    expect(res.body.data.matchReport.finalScore).toBeDefined();
    expect(res.body.data.matchReport.algorithmicScore).toBeDefined();
    expect(res.body.data.matchReport.aiSemanticScore).toBeDefined();
    expect(res.body.data.parsedResume.raw_text_hash).toBe(sha256Hex(resumeText));
    expect(res.body.data.jobAnalysis.roleTitle).toBeDefined();

    expect(parseResumeSpy).toHaveBeenCalledTimes(1);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);

    const doc = await MatchFlowModel.findById(res.body.data.matchFlowId).lean();
    expect(doc!.status).toBe("matched");
    expect(doc!.extractedResumeText).toBe(resumeText);
    expect(doc!.resumeTextHash).toBe(sha256Hex(resumeText));
    expect(doc!.jobDescriptionHash).toBe(sha256Hex(jobDescription.trim()));
    expect(doc!.parsedResume).toBeTruthy();
    expect(doc!.jobAnalysis).toBeTruthy();
    expect(doc!.matchReport).toBeTruthy();
  });

  it("duplicate identical request does not call parseResume, analyzeJob, or calculateMatch again", async () => {
    mockPdfSuccess();

    const parseResumeSpy = jest.spyOn(aiService, "parseResume");
    const analyzeJobSpy = jest.spyOn(aiService, "analyzeJob");
    const calculateMatchSpy = jest.spyOn(aiService, "calculateMatch");

    const email = `dup${new mongoose.Types.ObjectId().toString()}@example.com`;
    await UserModel.create({
      email,
      passwordHash: "x",
      profile: {
        skills: ["typescript"],
        experienceYears: 2,
        projects: [],
      },
    });
    const user = await UserModel.findOne({ email }).lean();
    const token = signAuthToken({
      userId: user!._id.toString(),
      email,
    });

    const pdfBuf = Buffer.from("%PDF-1.4 dup");

    const first = await request(app)
      .post("/api/v1/match-flow")
      .set("Authorization", `Bearer ${token}`)
      .field("jobDescription", jobDescription)
      .attach("file", pdfBuf, {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });
    expect(first.status).toBe(200);
    expect(first.body.data.pipelineCached).toBe(false);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post("/api/v1/match-flow")
      .set("Authorization", `Bearer ${token}`)
      .field("jobDescription", jobDescription)
      .attach("file", pdfBuf, {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    expect(second.status).toBe(200);
    expect(second.body.data.pipelineCached).toBe(true);
    expect(second.body.data.matchFlowId).toBe(first.body.data.matchFlowId);
    expect(parseResumeSpy).toHaveBeenCalledTimes(1);
    expect(analyzeJobSpy).toHaveBeenCalledTimes(1);
    expect(calculateMatchSpy).toHaveBeenCalledTimes(1);
  });
});
