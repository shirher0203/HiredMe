/**
 * Re-analysis of an already-analyzed job.
 *
 * POST /api/jobs/:id/analyze caches on a hash of the description, so a job
 * whose text has not changed keeps returning the analysis it was given the
 * first time. That is the right default, but it also means an application
 * analyzed before a scoring change can never pick up the new one — which is
 * exactly what `?force=true` is for, and what the board's Re-analyze action
 * sends.
 */

import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { createApp } from "../../app";
import { JobModel } from "../../models/job.model";
import { UserProfileModel } from "../../models/user-profile.model";
import { hashPayload } from "../../utils/hash";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

const STALE_ANALYSIS = {
  roleTitle: "Stale Role",
  requiredSkills: ["Identity Threat Detection and Response", "Cybersecurity"],
  advantageSkills: [] as string[],
  seniorityLevel: "senior" as const,
  summary: "Analyzed before the scoring changes.",
};

const STALE_MATCH = {
  finalScore: 20,
  algorithmicScore: 0,
  aiSemanticScore: 65,
  matchedRequired: [],
  missingRequired: ["identity threat detection and response", "cybersecurity"],
  matchedAdvantage: [],
  explanation: "Scored under the old formula.",
};

function parsedResume() {
  return {
    raw_text_hash: "resume-hash",
    personal_info: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: "Security-track candidate.",
    work_experience: [],
    education: [],
    skills: {
      technical_skills: ["python", "cyber-attack", "networking"],
      soft_skills: [],
      tools_and_software: ["wireshark"],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: 1,
    },
  };
}

describe("Job re-analysis", () => {
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

  /**
   * A job exactly as the old code would have left it: old-shaped analysis, with
   * cache hashes that genuinely agree with the description and the profile, so
   * the cache really does hit until force is passed.
   */
  async function seedAnalyzedJob(userId: string) {
    const resume = parsedResume();
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: resume,
    });

    const description = "Security research role with identity threat detection.";

    return JobModel.create({
      userId: new Types.ObjectId(userId),
      title: "Security Researcher",
      description,
      status: "applied",
      jobAnalysis: STALE_ANALYSIS,
      jobAnalysisHash: hashPayload({ description }),
      jobAnalyzedAt: new Date("2026-03-01T00:00:00.000Z"),
      matchAnalysis: STALE_MATCH,
      matchAnalysisHash: hashPayload({
        parsedResume: resume,
        requiredSkills: STALE_ANALYSIS.requiredSkills,
        advantageSkills: STALE_ANALYSIS.advantageSkills,
      }),
      matchAnalyzedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
  }

  it("returns the cached analysis without force", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    const res = await request(app)
      .post(`/api/jobs/${job.id}/analyze`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.jobAnalysis.roleTitle).toBe("Stale Role");
    expect(res.body.matchAnalysis.algorithmicScore).toBe(0);
    expect(res.body.matchAnalysis.matchDetails).toBeUndefined();
  });

  it("recomputes the analysis with force=true", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    const res = await request(app)
      .post(`/api/jobs/${job.id}/analyze?force=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.jobAnalysis.roleTitle).not.toBe("Stale Role");
    // The new shape, which the stale document could not have.
    expect(Array.isArray(res.body.matchAnalysis.matchDetails)).toBe(true);
    expect(typeof res.body.matchAnalysis.advantageBonus).toBe("number");
  });

  it("persists the recomputed analysis, so the next read is already fresh", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    await request(app)
      .post(`/api/jobs/${job.id}/analyze?force=true`)
      .set("Authorization", `Bearer ${token}`);

    const stored = await JobModel.findById(job._id).lean();
    expect(stored!.jobAnalysis?.roleTitle).not.toBe("Stale Role");
    expect(stored!.matchAnalysis?.matchDetails).toBeDefined();

    const followUp = await request(app)
      .post(`/api/jobs/${job.id}/analyze`)
      .set("Authorization", `Bearer ${token}`);

    expect(followUp.body.cached).toBe(true);
    expect(followUp.body.matchAnalysis.matchDetails).toBeDefined();
  });

  it("ignores a force value that is not exactly true", async () => {
    const { token, userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    const res = await request(app)
      .post(`/api/jobs/${job.id}/analyze?force=1`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.cached).toBe(true);
    expect(res.body.jobAnalysis.roleTitle).toBe("Stale Role");
  });

  it("refuses to re-analyze another user's job", async () => {
    const owner = makeAuthToken();
    const intruder = makeAuthToken();
    const job = await seedAnalyzedJob(owner.userId);

    const res = await request(app)
      .post(`/api/jobs/${job.id}/analyze?force=true`)
      .set("Authorization", `Bearer ${intruder.token}`);

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { userId } = makeAuthToken();
    const job = await seedAnalyzedJob(userId);

    const res = await request(app).post(`/api/jobs/${job.id}/analyze?force=true`);

    expect(res.status).toBe(401);
  });
});
