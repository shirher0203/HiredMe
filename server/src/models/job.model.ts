import { Schema, model, Types, type InferSchemaType } from "mongoose";

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
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["to_apply", "applied", "hr", "technical", "offer"],
      default: "to_apply",
      index: true,
    },
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

export type JobDocument = InferSchemaType<typeof jobSchema> & { _id: string };

export const JobModel = model("Job", jobSchema);

