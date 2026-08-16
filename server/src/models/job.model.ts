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

export const SCHEDULABLE_JOB_STATUSES = [
  "hr",
  "technical",
  "assignment",
  "manager",
] as const satisfies readonly JobStatus[];

export type SchedulableJobStatus = (typeof SCHEDULABLE_JOB_STATUSES)[number];

export function isSchedulableJobStatus(status: JobStatus): status is SchedulableJobStatus {
  return (SCHEDULABLE_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

export const JOB_SOURCES = ["manual", "match"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

// The fields after `summary` are additive and optional: jobs analyzed before
// they existed keep loading, read as empty, and fall back to the curated
// relation map when matching.
const jobAnalysisSchema = new Schema(
  {
    roleTitle: { type: String, required: true },
    requiredSkills: { type: [String], default: [] },
    advantageSkills: { type: [String], default: [] },
    seniorityLevel: { type: String, enum: ["junior", "mid", "senior"], required: true },
    summary: { type: String, required: true },
    toolsMentioned: { type: [String], default: undefined },
    impliedSkills: { type: [String], default: undefined },
    nonSkillRequirements: { type: [String], default: undefined },
    // Free-form map of canonical skill -> related canonical terms.
    skillRelations: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { _id: false }
);

// The resume-aware fields below are optional on purpose: `calculateMatch`
// only produces them when it is given a parsed resume, and documents written
// before they existed must keep loading. Declaring no `default` keeps them
// absent rather than stored as null.
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
    // `default: undefined` suppresses Mongoose's implicit `[]` on array paths
    // so an absent list stays absent instead of being stored as empty.
    resumeInsights: { type: [String], default: undefined },
    matchingEvidence: { type: [String], default: undefined },
  },
  { _id: false }
);

const scheduledInterviewSchema = new Schema(
  {
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
  },
  { _id: false }
);

const stageSchedulesSchema = new Schema(
  {
    hr: { type: scheduledInterviewSchema },
    technical: { type: scheduledInterviewSchema },
    assignment: { type: scheduledInterviewSchema },
    manager: { type: scheduledInterviewSchema },
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
    scheduledInterview: { type: scheduledInterviewSchema, default: null },
    stageSchedules: { type: stageSchedulesSchema, default: () => ({}) },
  },
  { timestamps: true }
);

jobSchema.index({ userId: 1, status: 1 });
jobSchema.index({ userId: 1, createdAt: -1, _id: -1 });
jobSchema.index({ title: "text", description: "text" });

export type JobDocument = InferSchemaType<typeof jobSchema> & { _id: string };

export const JobModel = model("Job", jobSchema);
