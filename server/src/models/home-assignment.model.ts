import { Schema, model, Types, type InferSchemaType } from "mongoose";

const evaluationSchema = new Schema(
  {
    score: { type: Number, required: true },
    summary: { type: String, required: true },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
  },
  { _id: false }
);

const homeAssignmentSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: Types.ObjectId, ref: "Job" },
    fileName: { type: String, required: true },
    language: { type: String },
    submittedText: { type: String, required: true },
    evaluation: { type: evaluationSchema, required: true },
    evaluatedAt: { type: Date },
  },
  { timestamps: true }
);

homeAssignmentSchema.index({ userId: 1, createdAt: -1 });

export type HomeAssignmentDocument = InferSchemaType<
  typeof homeAssignmentSchema
> & { _id: string };

export const HomeAssignmentModel = model("HomeAssignment", homeAssignmentSchema);
