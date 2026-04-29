import { Schema, model, type InferSchemaType } from "mongoose";

const profileSchema = new Schema(
  {
    skills: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0 },
    projects: { type: [String], default: [] },
    education: { type: String },
    goals: { type: String },
  },
  { _id: false }
);

const profileAnalysisSchema = new Schema(
  {
    seniorityEstimate: { type: String, enum: ["junior", "mid", "senior"] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    suggestedRoles: { type: [String], default: [] },
    summary: { type: String },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    profile: { type: profileSchema, default: () => ({}) },
    profileAnalysis: { type: profileAnalysisSchema },
    profileAnalysisHash: { type: String },
    profileAnalyzedAt: { type: Date },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };

export const UserModel = model("User", userSchema);

