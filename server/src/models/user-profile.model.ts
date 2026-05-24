import { Schema, model, Types, type InferSchemaType } from "mongoose";

const userProfileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    rawCvFileUrl: { type: String },
    profile: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export type UserProfileDocument = InferSchemaType<typeof userProfileSchema> & {
  _id: Types.ObjectId;
};

export const UserProfileModel = model("UserProfile", userProfileSchema);
