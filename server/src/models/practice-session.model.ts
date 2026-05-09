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

const practiceSessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: Types.ObjectId, ref: "Job" },
    interviewType: { type: String, enum: ["hr", "technical"], required: true },
    status: { type: String, enum: ["active", "completed"], default: "active", index: true },
    questions: { type: [questionSchema], default: [] },
    turns: { type: [turnSchema], default: [] },
  },
  { timestamps: true }
);

practiceSessionSchema.index({ userId: 1, status: 1 });

export type PracticeSessionDocument = InferSchemaType<typeof practiceSessionSchema> & {
  _id: string;
};

export const PracticeSessionModel = model("PracticeSession", practiceSessionSchema);

