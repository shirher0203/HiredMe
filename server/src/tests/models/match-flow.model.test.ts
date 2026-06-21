import mongoose from "mongoose";
import { MatchFlowModel } from "../../models/match-flow.model";
import type { JobAnalysis, MatchAnalysis } from "../../services/matching/matching.types";
import type { ParsedResume } from "../../services/ai/parsed-resume.types";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "../helpers/mongo-memory";

describe("MatchFlow model", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  afterEach(async () => {
    await clearAllCollections();
  });

  it("creates, saves, and loads a document with required fields", async () => {
    const userId = new mongoose.Types.ObjectId();

    const created = await MatchFlowModel.create({
      userId,
      status: "uploaded",
    });

    expect(created._id).toBeDefined();
    expect(created.status).toBe("uploaded");

    const loaded = await MatchFlowModel.findById(created._id).lean();
    expect(loaded).not.toBeNull();
    expect(loaded!.userId.toString()).toBe(userId.toString());
    expect(loaded!.status).toBe("uploaded");
    expect(loaded!.createdAt).toBeDefined();
    expect(loaded!.updatedAt).toBeDefined();
  });

  it("rejects invalid status on validate", async () => {
    const userId = new mongoose.Types.ObjectId();
    const doc = new MatchFlowModel({
      userId,
      status: "not_a_real_status" as never,
    });

    await expect(doc.validate()).rejects.toThrow();
  });

  it("round-trips nested jobAnalysis, matchReport, and parsedResume without stripping keys", async () => {
    const userId = new mongoose.Types.ObjectId();

    const jobAnalysis: JobAnalysis = {
      roleTitle: "Backend Engineer",
      requiredSkills: ["node", "typescript"],
      advantageSkills: ["docker"],
      seniorityLevel: "mid",
      summary: "Mid-level backend role.",
    };

    const matchReport: MatchAnalysis = {
      finalScore: 72,
      algorithmicScore: 70,
      aiSemanticScore: 78,
      matchedRequired: ["node"],
      missingRequired: ["typescript"],
      matchedAdvantage: ["docker"],
      explanation: "Good overlap.",
      resumeInsights: ["Strong Node experience"],
      matchingEvidence: ["2 years at Acme — Node"],
    };

    const parsedResume: ParsedResume = {
      raw_text_hash: "abc123hash",
      personal_info: {
        full_name: "Test User",
        email: "t@example.com",
        phone: null,
        location: null,
        linkedin_url: null,
        portfolio_or_github_url: null,
      },
      professional_summary: "Engineer",
      work_experience: [
        {
          company_name: "Acme",
          job_title: "Dev",
          start_date: "2020",
          end_date: null,
          location: null,
          responsibilities: ["Built APIs"],
          achievements: [],
        },
      ],
      education: [],
      skills: {
        technical_skills: ["node"],
        soft_skills: [],
        tools_and_software: [],
      },
      projects: [],
      languages: [],
      certifications: [],
      awards: [],
      parsed_metadata: {
        language_detected: "en",
        years_of_experience_estimate: 3,
      },
      suggested_skills: [],
    };

    const created = await MatchFlowModel.create({
      userId,
      status: "matched",
      extractedResumeText: "full text...",
      resumeTextHash: "hash1",
      parsedResume,
      jobRawDescription: "We need Node",
      jobDescriptionHash: "hash2",
      jobAnalysis,
      matchReport,
      matchInputFingerprint: "fp1",
    });

    const loaded = await MatchFlowModel.findById(created._id).lean();
    expect(loaded).not.toBeNull();

    expect(loaded!.jobAnalysis).toEqual(jobAnalysis);
    expect(loaded!.matchReport).toMatchObject({
      finalScore: matchReport.finalScore,
      explanation: matchReport.explanation,
      resumeInsights: matchReport.resumeInsights,
      matchingEvidence: matchReport.matchingEvidence,
    });

    const pr = loaded!.parsedResume as ParsedResume;
    expect(pr.raw_text_hash).toBe(parsedResume.raw_text_hash);
    expect(pr.personal_info.full_name).toBe("Test User");
    expect(pr.work_experience).toHaveLength(1);
    expect(pr.work_experience[0].company_name).toBe("Acme");
    expect(pr.parsed_metadata.years_of_experience_estimate).toBe(3);
  });
});
