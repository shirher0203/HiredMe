/**
 * Backward compatibility for jobs analyzed before the extraction fields existed.
 *
 * A production database is full of jobAnalysis subdocuments with exactly the
 * original five fields. They have to keep loading, keep matching, and keep
 * scoring — falling back to the curated relation map, since they carry no
 * skillRelations of their own.
 */

import mongoose from "mongoose";
import { JobModel } from "../../models/job.model";
import { calculateMatch } from "../../services/ai/ai.service";
import type { JobAnalysis, ProfileInput } from "../../services/matching/matching.types";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "../helpers/mongo-memory";
import { MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS } from "../fixtures/microsoft-job-partial";
import { SECURITY_CANDIDATE_PROFILE } from "../fixtures/security-candidate-profile";

const LEGACY_ANALYSIS = {
  roleTitle: "Security Researcher",
  requiredSkills: [
    "Identity Threat Detection and Response",
    "Cybersecurity",
    "Threat Detection",
    "Security Investigation",
  ],
  advantageSkills: ["Attacker Landscape Knowledge", "Enterprise Security"],
  seniorityLevel: "senior",
  summary: "Security research role saved before the extraction fields existed.",
};

const ORIGINAL_MOCK_FLAG = process.env.USE_MOCK_AI;

async function insertLegacyJob() {
  return mongoose.connection.collection("jobs").insertOne({
    userId: new mongoose.Types.ObjectId(),
    title: "Security Researcher",
    description: "Saved before the extraction fields existed.",
    status: "applied",
    source: "manual",
    jobAnalysis: LEGACY_ANALYSIS,
    jobAnalysisHash: "legacy-hash",
    jobAnalyzedAt: new Date("2026-02-01T00:00:00.000Z"),
  });
}

describe("legacy jobAnalysis documents", () => {
  beforeAll(async () => {
    await connectTestDb();
    // Mock mode keeps calculateMatch offline; the deterministic half, which is
    // what this test is about, runs identically either way.
    process.env.USE_MOCK_AI = "true";
  });

  afterAll(async () => {
    await disconnectTestDb();
    if (ORIGINAL_MOCK_FLAG === undefined) delete process.env.USE_MOCK_AI;
    else process.env.USE_MOCK_AI = ORIGINAL_MOCK_FLAG;
  });

  afterEach(async () => {
    await clearAllCollections();
  });

  it("loads with the new fields absent rather than failing", async () => {
    const insert = await insertLegacyJob();

    const job = await JobModel.findById(insert.insertedId);

    expect(job).not.toBeNull();
    expect(job!.jobAnalysis?.roleTitle).toBe("Security Researcher");
    expect(job!.jobAnalysis?.requiredSkills).toHaveLength(4);
    expect(job!.jobAnalysis?.toolsMentioned).toBeUndefined();
    expect(job!.jobAnalysis?.impliedSkills).toBeUndefined();
    expect(job!.jobAnalysis?.nonSkillRequirements).toBeUndefined();
    expect(job!.jobAnalysis?.skillRelations).toBeUndefined();
  });

  it("serializes to the client without the new fields", async () => {
    const insert = await insertLegacyJob();
    const job = await JobModel.findById(insert.insertedId);

    const serialized = JSON.parse(JSON.stringify(job!.toJSON()));

    expect(serialized.jobAnalysis.requiredSkills).toHaveLength(4);
    expect("skillRelations" in serialized.jobAnalysis).toBe(false);
  });

  it("still matches, falling back to the curated relation map", async () => {
    const insert = await insertLegacyJob();
    const job = await JobModel.findById(insert.insertedId);
    const analysis = job!.jobAnalysis as unknown as JobAnalysis;

    const match = await calculateMatch(SECURITY_CANDIDATE_PROFILE, analysis);

    // No skillRelations on this document, so every related match below comes
    // from the curated floor rather than from the job's own assertions.
    expect(analysis.skillRelations).toBeUndefined();
    expect(match.finalScore).toBeGreaterThanOrEqual(0);
    expect(match.finalScore).toBeLessThanOrEqual(100);
    expect(match.matchedRequired.length + match.missingRequired.length).toBeGreaterThan(0);
  });

  it("can be re-analyzed into the new shape in place", async () => {
    const insert = await insertLegacyJob();
    const job = await JobModel.findById(insert.insertedId);

    job!.jobAnalysis = {
      ...MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS,
      toolsMentioned: ["wireshark"],
      impliedSkills: ["networking"],
      nonSkillRequirements: ["5+ years of experience"],
      skillRelations: { cybersecurity: ["cyber-attack"] },
    };
    await job!.save();

    const reloaded = await JobModel.findById(insert.insertedId).lean();

    expect(reloaded!.jobAnalysis?.toolsMentioned).toEqual(["wireshark"]);
    expect(reloaded!.jobAnalysis?.skillRelations).toEqual({
      cybersecurity: ["cyber-attack"],
    });
  });

  it("accepts a profile with no skills at all without throwing", async () => {
    const insert = await insertLegacyJob();
    const job = await JobModel.findById(insert.insertedId);
    const analysis = job!.jobAnalysis as unknown as JobAnalysis;
    const emptyProfile: ProfileInput = {
      skills: [],
      experienceYears: 0,
      projects: [],
    };

    const match = await calculateMatch(emptyProfile, analysis);

    expect(match.matchedRequired).toEqual([]);
    expect(match.algorithmicScore).toBe(0);
  });
});
