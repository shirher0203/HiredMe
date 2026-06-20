import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

describe("app integration (foundation)", () => {
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

  it("GET /api/health returns 200 and { ok: true }", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("protected route without a token returns 401", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("protected route with a valid token is authorized (not 401)", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .get("/api/jobs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});
