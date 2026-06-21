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
});