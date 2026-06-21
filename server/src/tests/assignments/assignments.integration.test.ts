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

describe("Home Assignment API", () => {
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

  it("uploads an assignment and persists the evaluation (201)", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .post("/api/assignments")
      .set("Authorization", `Bearer ${token}`)
      .field("language", "javascript")
      .attach("file", Buffer.from("function add(a,b){return a+b;}"), "solution.js");

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.fileName).toBe("solution.js");
    expect(res.body.evaluation).toBeDefined();
    expect(res.body.evaluation.score).toBeGreaterThanOrEqual(0);
    expect(res.body.evaluation.score).toBeLessThanOrEqual(100);
  });

  it("lists and fetches an assignment by id for its owner", async () => {
    const { token } = makeAuthToken();

    const createRes = await request(app)
      .post("/api/assignments")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("print('hi')"), "main.py");
    const id = createRes.body.id as string;

    const listRes = await request(app)
      .get("/api/assignments")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(1);

    const getRes = await request(app)
      .get(`/api/assignments/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(String(getRes.body._id)).toBe(id);
    expect(getRes.body.submittedText).toBe("print('hi')");
  });

  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/assignments")
      .attach("file", Buffer.from("x"), "x.txt");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    const { token } = makeAuthToken();
    const res = await request(app)
      .post("/api/assignments")
      .set("Authorization", `Bearer ${token}`)
      .field("language", "javascript");
    expect(res.status).toBe(400);
  });

  it("returns 404 when accessing another user's assignment", async () => {
    const userA = makeAuthToken();
    const createRes = await request(app)
      .post("/api/assignments")
      .set("Authorization", `Bearer ${userA.token}`)
      .attach("file", Buffer.from("some code"), "a.txt");
    const id = createRes.body.id as string;

    const userB = makeAuthToken();
    const res = await request(app)
      .get(`/api/assignments/${id}`)
      .set("Authorization", `Bearer ${userB.token}`);
    expect(res.status).toBe(404);
  });
});
