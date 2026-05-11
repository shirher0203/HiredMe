import mongoose from "mongoose";
import type { JobAnalysis, MatchAnalysis } from "./matching/matching.types";
import type { ParsedResume } from "./ai/parsed-resume.types";
import { MatchFlowModel } from "../models/match-flow.model";
import { extractTextFromBuffer } from "./pdf.service";
import { sha256Hex } from "../utils/hash";
import { HttpError } from "../utils/http-error";
import {
  analyzeJobForMatchFlow,
  calculateMatchForMatchFlow,
  parseResumeForMatchFlow,
} from "./match-flow.service";

export interface FullMatchFlowPipelineResult {
  matchFlowId: string;
  filename: string;
  pageCount: number;
  resumeTextHash: string;
  jobDescriptionHash: string;
  parsedResume: ParsedResume;
  jobAnalysis: JobAnalysis;
  matchReport: MatchAnalysis;
  /** True when an existing completed flow was returned without running AI steps. */
  pipelineCached: boolean;
  usedCached: {
    parseResume: boolean;
    jobAnalysis: boolean;
    match: boolean;
  };
}

function validateJobDescription(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "jobDescription must be a string");
  }
  const normalized = raw.trim();
  if (normalized === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "jobDescription must be non-empty");
  }
  return normalized;
}

/**
 * Multipart full pipeline: extract PDF → parse resume → analyze job → match.
 * Reuses step services (each has its own caching). If the user already has a
 * **matched** flow with the same `resumeTextHash` and `jobDescriptionHash`,
 * returns it immediately without calling `parseResume` / `analyzeJob` / `calculateMatch`.
 */
export async function runFullMatchFlowPipeline(params: {
  userId: string;
  buffer: Buffer;
  filename: string;
  jobDescription: unknown;
}): Promise<FullMatchFlowPipelineResult> {
  const normalizedJob = validateJobDescription(params.jobDescription);
  const jobDescriptionHash = sha256Hex(normalizedJob);

  const { text, pageCount } = await extractTextFromBuffer(params.buffer);
  const resumeTextHash = sha256Hex(text);

  const userOid = new mongoose.Types.ObjectId(params.userId);

  const existing = await MatchFlowModel.findOne({
    userId: userOid,
    resumeTextHash,
    jobDescriptionHash,
    status: "matched",
  }).lean();

  if (
    existing !== null &&
    existing.parsedResume !== undefined &&
    existing.parsedResume !== null &&
    existing.jobAnalysis !== undefined &&
    existing.jobAnalysis !== null &&
    existing.matchReport !== undefined &&
    existing.matchReport !== null
  ) {
    return {
      matchFlowId: existing._id.toString(),
      filename: params.filename,
      pageCount: existing.resumePdfPageCount ?? pageCount,
      resumeTextHash,
      jobDescriptionHash,
      parsedResume: existing.parsedResume as ParsedResume,
      jobAnalysis: existing.jobAnalysis as JobAnalysis,
      matchReport: existing.matchReport as MatchAnalysis,
      pipelineCached: true,
      usedCached: {
        parseResume: true,
        jobAnalysis: true,
        match: true,
      },
    };
  }

  const doc = await MatchFlowModel.create({
    userId: userOid,
    extractedResumeText: text,
    resumeTextHash,
    resumePdfPageCount: pageCount,
    status: "extracted",
  });

  const flowId = doc._id;

  const parseResult = await parseResumeForMatchFlow(flowId, params.userId);
  const jobResult = await analyzeJobForMatchFlow(flowId, params.userId, normalizedJob);
  const matchResult = await calculateMatchForMatchFlow(flowId, params.userId);

  return {
    matchFlowId: flowId.toString(),
    filename: params.filename,
    pageCount,
    resumeTextHash,
    jobDescriptionHash,
    parsedResume: parseResult.parsedResume,
    jobAnalysis: jobResult.jobAnalysis,
    matchReport: matchResult.matchReport,
    pipelineCached: false,
    usedCached: {
      parseResume: parseResult.cached,
      jobAnalysis: jobResult.cached,
      match: matchResult.cached,
    },
  };
}
