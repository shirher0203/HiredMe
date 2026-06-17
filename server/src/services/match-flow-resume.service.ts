import mongoose from "mongoose";
import { MatchFlowModel } from "../models/match-flow.model";
import { extractTextFromBuffer } from "./pdf.service";
import { sha256Hex } from "../utils/hash";

export interface CreateMatchFlowFromPdfResult {
  matchFlowId: string;
  resumeTextHash: string;
  textLength: number;
  pageCount: number;
  filename: string;
}

export async function createMatchFlowFromPdfUpload(params: {
  userId: string;
  buffer: Buffer;
  filename: string;
}): Promise<CreateMatchFlowFromPdfResult> {
  const { text, pageCount } = await extractTextFromBuffer(params.buffer);
  const resumeTextHash = sha256Hex(text);

  const doc = await MatchFlowModel.create({
    userId: new mongoose.Types.ObjectId(params.userId),
    extractedResumeText: text,
    resumeTextHash,
    resumePdfPageCount: pageCount,
    status: "extracted",
  });

  return {
    matchFlowId: doc._id.toString(),
    resumeTextHash,
    textLength: text.length,
    pageCount,
    filename: params.filename,
  };
}
