import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app";
import { UserProfileModel } from "../models/user-profile.model";
import { UserModel } from "../models/user.model";
import { extractTextFromBuffer } from "../services/pdf.service";
import { signAuthToken } from "../utils/auth";
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

function buildProfile() {
  return {
    raw_text_hash: "hash-1",
    personal_info: {
      full_name: "Jane Candidate",
      email: "jane@example.com",
      phone: null,
      location: "Tel Aviv",
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: "Full stack developer",
    work_experience: [],
    education: [],
    skills: {
      technical_skills: ["React", "TypeScript"],
      soft_skills: ["Communication"],
      tools_and_software: ["Git"],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: 2,
    },
  };
}

describe("User profile CV flow", () => {
  const JWT_SECRET = "test-jwt-secret-for-user-profile";

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
    const user = await UserModel.create({
      email: "candidate@example.com",
      passwordHash: "test-hash",
      personalInfo: {
        fullName: "Account Candidate",
        phone: "050-1234567",
        location: "Haifa",
        linkedinUrl: "https://linkedin.example/account",
        portfolioOrGithubUrl: "https://github.com/account",
      },
    });
    userId = user._id.toString();
    token = signAuthToken({ userId, email: user.email });
  });

  it("parses an uploaded PDF into structured resume JSON without saving it", async () => {
    mockedExtract.mockResolvedValue({
      text: "Jane Candidate React TypeScript Node",
      pageCount: 1,
    });

    const res = await request(app)
      .post("/api/v1/cv/parse")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4 minimal"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.parsedResume).toMatchObject({
      personal_info: {
        full_name: "Account Candidate",
        email: "candidate@example.com",
        phone: "050-1234567",
        location: "Haifa",
        linkedin_url: "https://linkedin.example/account",
        portfolio_or_github_url: "https://github.com/account",
      },
      work_experience: expect.any(Array),
      education: expect.any(Array),
      skills: expect.any(Object),
      projects: expect.any(Array),
    });

    expect(await UserProfileModel.countDocuments()).toBe(0);
  });

  it("returns the registration-seeded profile before CV upload", async () => {
    const res = await request(app)
      .get("/api/v1/users/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "success",
      data: {
        profile: {
          raw_text_hash: "",
          personal_info: {
            full_name: "Account Candidate",
            email: "candidate@example.com",
            phone: "050-1234567",
            location: "Haifa",
            linkedin_url: "https://linkedin.example/account",
            portfolio_or_github_url: "https://github.com/account",
          },
          work_experience: [],
          education: [],
          projects: [],
        },
        personalInfo: {
          full_name: "Account Candidate",
          email: "candidate@example.com",
          phone: "050-1234567",
          location: "Haifa",
          linkedin_url: "https://linkedin.example/account",
          portfolio_or_github_url: "https://github.com/account",
        },
        rawCvFileUrl: null,
        updatedAt: expect.any(String),
      },
    });
  });

  it("upserts and returns the verified structured profile", async () => {
    const profile = buildProfile();

    const saveRes = await request(app)
      .put("/api/v1/users/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ profile });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.data.personalInfo).toMatchObject({
      full_name: "Account Candidate",
      email: "candidate@example.com",
      phone: "050-1234567",
      location: "Haifa",
      linkedin_url: "https://linkedin.example/account",
      portfolio_or_github_url: "https://github.com/account",
    });
    expect(saveRes.body.data.profile).toMatchObject({
      ...profile,
      personal_info: {
        full_name: "Account Candidate",
        email: "candidate@example.com",
        phone: "050-1234567",
        location: "Haifa",
        linkedin_url: "https://linkedin.example/account",
        portfolio_or_github_url: "https://github.com/account",
      },
    });

    const getRes = await request(app)
      .get("/api/v1/users/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.profile.personal_info).toMatchObject({
      full_name: "Account Candidate",
      email: "candidate@example.com",
      phone: "050-1234567",
      location: "Haifa",
      linkedin_url: "https://linkedin.example/account",
      portfolio_or_github_url: "https://github.com/account",
    });

    const saved = await UserProfileModel.findOne({ userId }).lean();
    expect(saved?.profile).toMatchObject(saveRes.body.data.profile);
  });

  it("rejects malformed profile payloads", async () => {
    const res = await request(app)
      .put("/api/v1/users/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ profile: { personal_info: {} } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("analyzes a job description against the saved user profile", async () => {
    const profile = buildProfile();
    await UserProfileModel.create({ userId, profile });

    const res = await request(app)
      .post("/api/v1/cv/analyze-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobDescription: "Frontend role requiring React and TypeScript" });

    expect(res.status).toBe(200);
    expect(res.body.job).toBeDefined();
    expect(res.body.match).toBeDefined();
    expect(res.body.parsedResume).toMatchObject(profile);
  });

  it("returns 404 when analyzing a job without a saved profile", async () => {
    const res = await request(app)
      .post("/api/v1/cv/analyze-profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ jobDescription: "Frontend role requiring React" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PROFILE_NOT_FOUND");
  });

  it("requires auth for parse and profile endpoints", async () => {
    const parseRes = await request(app)
      .post("/api/v1/cv/parse")
      .attach("file", Buffer.from("%PDF-1.4 minimal"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });
    const profileRes = await request(app).get("/api/v1/users/profile");

    expect(parseRes.status).toBe(401);
    expect(profileRes.status).toBe(401);
  });
});
