import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app";
import {
  connectTestDb,
  disconnectTestDb,
  makeAuthToken,
} from "../helpers/test-db";
import { __clearRepoCache } from "../../services/github/github.service";

jest.setTimeout(60_000);

function mockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe("GitHub analyze API", () => {
  let app: Express;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  beforeEach(() => {
    __clearRepoCache();
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.endsWith("/languages")) {
          return Promise.resolve(mockResponse(200, { TypeScript: 100 }));
        }
        if (url.endsWith("/readme")) {
          return Promise.resolve(
            mockResponse(200, {
              content: Buffer.from("# Readme").toString("base64"),
            })
          );
        }
        if (url.includes("/contents/package.json")) {
          return Promise.resolve(
            mockResponse(200, { content: Buffer.from("{}").toString("base64") })
          );
        }
        return Promise.resolve(
          mockResponse(200, {
            full_name: "shirher0203/HiredMe",
            description: "AI job platform",
            language: "TypeScript",
            stargazers_count: 3,
          })
        );
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  it("returns 200 with metadata and analysis for a valid URL", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .post("/api/github/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://github.com/shirher0203/HiredMe" });

    expect(res.status).toBe(200);
    expect(res.body.metadata.fullName).toBe("shirher0203/HiredMe");
    expect(res.body.analysis).toBeDefined();
    expect(res.body.analysis.codeQualityScore).toBeGreaterThanOrEqual(0);
    expect(res.body.analysis.codeQualityScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(res.body.analysis.detectedStack)).toBe(true);
  });

  it("returns 400 for a non-github URL", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .post("/api/github/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://gitlab.com/owner/repo" });

    expect(res.status).toBe(400);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/github/analyze")
      .send({ url: "https://github.com/shirher0203/HiredMe" });

    expect(res.status).toBe(401);
  });
});
