import { Schema, model, Types, type InferSchemaType } from "mongoose";

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    topic: { type: String, required: true },
    expectedFocus: { type: String, required: true },
  },
  { _id: false }
);

const answerEvaluationSchema = new Schema(
  {
    score: { type: Number, required: true },
    clarity: { type: Number, required: true },
    correctness: { type: Number, required: true },
    depth: { type: Number, required: true },
    feedback: { type: String, required: true },
    improvementTips: { type: [String], default: [] },
  },
  { _id: false }
);

const turnSchema = new Schema(
  {
    questionId: { type: String, required: true },
    userAnswer: { type: String, required: true },
    evaluation: { type: answerEvaluationSchema, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * The AI-generated attempt summary, persisted so it is generated once.
 * Absent on sessions completed before it was stored, and on sessions whose
 * summary generation failed — completion is never blocked on it.
 */
const attemptSummarySchema = new Schema(
  {
    summary: { type: String, required: true },
    overallScore: { type: Number, required: true },
    preserve_points: { type: [String], default: [] },
    improve_points: { type: [String], default: [] },
    topics_covered: { type: [String], default: [] },
    overall_feedback: { type: String, required: true },
  },
  { _id: false }
);

const practiceSessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: Types.ObjectId, ref: "Job" },
    interviewType: { type: String, enum: ["hr", "technical"], required: true },
    // The language the questions were generated in. Persisted so regenerating
    // mid-session cannot silently switch languages. Sessions created before this
    // field existed read as undefined and are treated as English by callers.
    language: { type: String, enum: ["he", "en"], default: "en" },
    status: { type: String, enum: ["active", "completed"], default: "active", index: true },
    questions: { type: [questionSchema], default: [] },
    turns: { type: [turnSchema], default: [] },
    summary: { type: attemptSummarySchema, default: undefined },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

practiceSessionSchema.index({ userId: 1, status: 1 });
practiceSessionSchema.index({ userId: 1, jobId: 1, createdAt: -1 });

export type PracticeSessionDocument = InferSchemaType<typeof practiceSessionSchema> & {
  _id: string;
};

export const PracticeSessionModel = model("PracticeSession", practiceSessionSchema);

