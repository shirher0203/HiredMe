import { Schema, model, Types, type InferSchemaType } from "mongoose";

const jobAnalysisSchema = new Schema(
  {
    roleTitle: { type: String, required: true },
    requiredSkills: { type: [String], default: [] },
    advantageSkills: { type: [String], default: [] },
    seniorityLevel: {
      type: String,
      enum: ["junior", "mid", "senior"],
      required: true,
    },
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
    educationFit: { type: String },
    experienceFit: { type: String },
    projectFit: { type: String },
    languageFit: { type: String },
    resumeInsights: { type: [String], default: undefined },
    matchingEvidence: { type: [String], default: undefined },
  },
  { _id: false }
);

const MATCH_FLOW_STATUSES = [
  "uploaded",
  "extracted",
  "parsed",
  "job_analyzed",
  "matched",
  "failed",
] as const;

const matchFlowSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    extractedResumeText: { type: String },
    resumeTextHash: { type: String },
    /** Full `ParsedResume` from `parseResume` — stored as Mixed for forward compatibility. */
    parsedResume: { type: Schema.Types.Mixed },
    jobRawDescription: { type: String },
    jobDescriptionHash: { type: String },
    jobAnalysis: { type: jobAnalysisSchema },
    matchReport: { type: matchAnalysisSchema },
    matchInputFingerprint: { type: String },
    status: {
      type: String,
      enum: MATCH_FLOW_STATUSES,
      default: "uploaded",
    },
    lastError: { type: String },
  },
  { timestamps: true }
);

matchFlowSchema.index({ userId: 1, createdAt: -1 });

export type MatchFlowStatus = (typeof MATCH_FLOW_STATUSES)[number];

export type MatchFlowDocument = InferSchemaType<typeof matchFlowSchema> & {
  _id: Types.ObjectId;
};

export const MatchFlowModel = model("MatchFlow", matchFlowSchema);
