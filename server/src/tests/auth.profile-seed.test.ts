import request from "supertest";
import { createApp } from "../app";
import { UserModel } from "../models/user.model";
import { UserProfileModel } from "../models/user-profile.model";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "./helpers/mongo-memory";

describe("POST /api/auth/register profile seed", () => {
  const JWT_SECRET = "test-jwt-secret-auth-profile-seed";
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await connectTestDb();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearAllCollections();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.SERVER_PUBLIC_URL;
  });

  it("creates a user profile document with registration personal info", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "seed@example.com",
        password: "secret123",
        personalInfo: {
          fullName: "Seed User",
          phone: "050-1111111",
          location: "Tel Aviv",
          linkedinUrl: "https://linkedin.example/seed",
          portfolioOrGithubUrl: "https://github.com/seed",
        },
      });

    expect(res.status).toBe(201);

    const user = await UserModel.findOne({ email: "seed@example.com" }).lean();
    expect(user).toBeTruthy();

    const saved = await UserProfileModel.findOne({ userId: user!._id }).lean();
    expect(saved?.profile).toMatchObject({
      raw_text_hash: "",
      personal_info: {
        full_name: "Seed User",
        email: "seed@example.com",
        phone: "050-1111111",
        location: "Tel Aviv",
        linkedin_url: "https://linkedin.example/seed",
        portfolio_or_github_url: "https://github.com/seed",
      },
      professional_summary: null,
      work_experience: [],
      education: [],
      projects: [],
    });
  });

  it("rejects Google auth start when Google credentials are missing", async () => {
    const res = await request(app).get("/api/auth/google/start");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
  });

  it("redirects Google auth start to Google OAuth with configured callback", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";

    const res = await request(app).get("/api/auth/google/start?redirect=/applications");

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(res.headers.location).toContain("client_id=google-client-id");
    expect(res.headers.location).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fauth%2Fgoogle%2Fcallback"
    );
    expect(res.headers.location).toContain("state=");
  });
});
