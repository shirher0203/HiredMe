import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const JOB_STATUSES = [
  "applied",
  "hr",
  "technical",
  "assignment",
  "manager",
  "offer",
  "not_relevant",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_SOURCES = ["manual", "match"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

const jobAnalysisSchema = new Schema(
  {
    roleTitle: { type: String, required: true },
    requiredSkills: { type: [String], default: [] },
    advantageSkills: { type: [String], default: [] },
    seniorityLevel: { type: String, enum: ["junior", "mid", "senior"], required: true },
    summary: { type: String, required: true },
  },
  { _id: false }
);

const matchAnalysisSchema = new Schema(
  {
    finalScore: { type: Number, required: true },
    algorithmicScore: { type: Number, required: true },
    aiSemanticScore: { type: Number, required: true },
    matchedRequired: { type: [String], default: [] },
    missingRequired: { type: [String], default: [] },
    matchedAdvantage: { type: [String], default: [] },
    explanation: { type: String, required: true },
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    company: { type: String, trim: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: "applied",
      index: true,
    },
    notes: { type: String, trim: true },
    contact: { type: String, trim: true },
    jobUrl: { type: String, trim: true },
    source: { type: String, enum: JOB_SOURCES, default: "manual" },
    jobAnalysis: { type: jobAnalysisSchema },
    jobAnalysisHash: { type: String },
    jobAnalyzedAt: { type: Date },
    matchAnalysis: { type: matchAnalysisSchema },
    matchAnalysisHash: { type: String },
    matchAnalyzedAt: { type: Date },
  },
  { timestamps: true }
);

jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, createdAt: -1, _id: -1 });
jobSchema.index({ title: "text", description: "text" });

export type JobDocument = InferSchemaType<typeof jobSchema> & { _id: string };

export const JobModel = model("Job", jobSchema);
