import mongoose from "mongoose";
import { JobModel } from "../../models/job.model";
import type { MatchAnalysis } from "../../services/matching/matching.types";
import {
  clearAllCollections,
  connectTestDb,
  disconnectTestDb,
} from "../helpers/mongo-memory";

const LEGACY_MATCH_FIELDS = [
  "finalScore",
  "algorithmicScore",
  "aiSemanticScore",
  "matchedRequired",
  "missingRequired",
  "matchedAdvantage",
  "explanation",
] as const;

function baseMatch(): MatchAnalysis {
  return {
    finalScore: 72,
    algorithmicScore: 70,
    aiSemanticScore: 78,
    matchedRequired: ["node"],
    missingRequired: ["typescript"],
    matchedAdvantage: ["docker"],
    explanation: "Good overlap.",
  };
}

async function createJob(matchAnalysis?: MatchAnalysis) {
  return JobModel.create({
    userId: new mongoose.Types.ObjectId(),
    title: "Backend Engineer",
    description: "We need Node and TypeScript.",
    ...(matchAnalysis ? { matchAnalysis } : {}),
  });
}

describe("Job matchAnalysis resume-aware extras", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  afterEach(async () => {
    await clearAllCollections();
  });

  it("round-trips all six resume-aware fields", async () => {
    const matchAnalysis: MatchAnalysis = {
      ...baseMatch(),
      educationFit: "BSc in Computer Science covers the degree requirement.",
      experienceFit: "Three years of backend work against a mid-level ask.",
      projectFit: "The API project maps onto the service work described.",
      languageFit: "Hebrew and English both listed.",
      resumeInsights: ["Add TypeScript to the skills section", "Quantify the API project"],
      matchingEvidence: ["2 years at Acme — Node", "Built REST APIs at Acme"],
    };

    const created = await createJob(matchAnalysis);
    const loaded = await JobModel.findById(created._id).lean();

    expect(loaded).not.toBeNull();
    expect(loaded!.matchAnalysis).toMatchObject(matchAnalysis);
  });

  it("stores no keys for extras that were never produced", async () => {
    const created = await createJob(baseMatch());
    const loaded = await JobModel.findById(created._id).lean();

    const stored = loaded!.matchAnalysis as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([...LEGACY_MATCH_FIELDS].sort());
    expect(stored.resumeInsights).toBeUndefined();
    expect(stored.matchingEvidence).toBeUndefined();
    expect(stored.educationFit).toBeUndefined();
  });

  it("loads a legacy document that predates the extras and serializes it", async () => {
    // Written straight through the driver so the document looks exactly like
    // one saved before the extras existed on the schema.
    const insert = await mongoose.connection.collection("jobs").insertOne({
      userId: new mongoose.Types.ObjectId(),
      title: "Legacy role",
      description: "Saved before the extras were added.",
      status: "applied",
      source: "manual",
      matchAnalysis: baseMatch(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const loaded = await JobModel.findById(insert.insertedId);

    expect(loaded).not.toBeNull();
    expect(loaded!.matchAnalysis?.finalScore).toBe(72);
    expect(loaded!.matchAnalysis?.explanation).toBe("Good overlap.");
    expect(loaded!.matchAnalysis?.resumeInsights).toBeUndefined();
    expect(loaded!.matchAnalysis?.educationFit).toBeUndefined();

    const serialized = JSON.parse(JSON.stringify(loaded!.toJSON()));
    expect(serialized.matchAnalysis.finalScore).toBe(72);
    expect("resumeInsights" in serialized.matchAnalysis).toBe(false);
  });

  it("accepts extras added to a legacy document on re-analysis", async () => {
    const insert = await mongoose.connection.collection("jobs").insertOne({
      userId: new mongoose.Types.ObjectId(),
      title: "Legacy role",
      description: "Saved before the extras were added.",
      status: "applied",
      source: "manual",
      matchAnalysis: baseMatch(),
    });

    const job = await JobModel.findById(insert.insertedId);
    job!.matchAnalysis = {
      ...baseMatch(),
      experienceFit: "Now populated.",
      matchingEvidence: ["Evidence line"],
    };
    await job!.save();

    const reloaded = await JobModel.findById(insert.insertedId).lean();
    expect(reloaded!.matchAnalysis?.experienceFit).toBe("Now populated.");
    expect(reloaded!.matchAnalysis?.matchingEvidence).toEqual(["Evidence line"]);
  });
});
