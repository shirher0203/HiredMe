import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app";
import { MatchFlowModel } from "../models/match-flow.model";
import { extractTextFromBuffer } from "../services/pdf.service";
import { signAuthToken } from "../utils/auth";
import { sha256Hex } from "../utils/hash";
import { HttpError } from "../utils/http-error";
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

describe("POST /api/v1/match-flow/resume", () => {
  const JWT_SECRET = "test-jwt-secret-for-match-flow-upload";

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
    mockedExtract.mockReset();
    userId = new mongoose.Types.ObjectId().toString();
    token = signAuthToken({ userId, email: "candidate@example.com" });
  });

  it("returns 200 and persists extracted text and hash when PDF parse succeeds", async () => {
    const text = "hello world xxxxx";
    mockedExtract.mockResolvedValue({ text, pageCount: 1 });

    const res = await request(app)
      .post("/api/v1/match-flow/resume")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 minimal"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toMatchObject({
      resumeTextHash: sha256Hex(text),
      textLength: text.length,
      pageCount: 1,
      filename: "cv.pdf",
    });
    expect(res.body.data.matchFlowId).toBeDefined();

    const doc = await MatchFlowModel.findById(res.body.data.matchFlowId).lean();
    expect(doc).not.toBeNull();
    expect(doc!.extractedResumeText).toBe(text);
    expect(doc!.resumeTextHash).toBe(sha256Hex(text));
    expect(doc!.resumePdfPageCount).toBe(1);
    expect(doc!.status).toBe("extracted");
    expect(doc!.userId.toString()).toBe(userId);
  });

  it("returns 400 EMPTY_PDF_TEXT when extraction fails with HttpError", async () => {
    mockedExtract.mockRejectedValue(
      new HttpError(400, "EMPTY_PDF_TEXT", "Scanned or empty PDF detected. OCR required.")
    );

    const res = await request(app)
      .post("/api/v1/match-flow/resume")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "empty.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.error.code).toBe("EMPTY_PDF_TEXT");

    const count = await MatchFlowModel.countDocuments();
    expect(count).toBe(0);
  });

  it("returns 400 MISSING_FILE when no file is uploaded", async () => {
    const res = await request(app)
      .post("/api/v1/match-flow/resume")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.error.code).toBe("MISSING_FILE");
  });

  it("returns 400 INVALID_FILE_TYPE for non-PDF MIME (aligned with CV upload)", async () => {
    const res = await request(app)
      .post("/api/v1/match-flow/resume")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("not a pdf"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("returns 401 without Bearer token", async () => {
    const res = await request(app)
      .post("/api/v1/match-flow/resume")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(401);
  });
});
