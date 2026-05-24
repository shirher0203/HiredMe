import { Types } from "mongoose";
import type { JobAnalysis, MatchAnalysis } from "./matching/matching.types";
import type { ParsedResume } from "./ai/parsed-resume.types";
import { analyzeJob, calculateMatch, parseResume } from "./ai/ai.service";
import { MatchFlowModel } from "../models/match-flow.model";
import { UserModel } from "../models/user.model";
import { computeMatchInputFingerprint, userToProfileInput } from "../utils/profile-input";
import { sha256Hex } from "../utils/hash";
import { HttpError } from "../utils/http-error";
import { withAccountPersonalInfo } from "../utils/personal-info";

export async function parseResumeForMatchFlow(
  matchFlowId: Types.ObjectId,
  userId: string
): Promise<{ parsedResume: ParsedResume; cached: boolean }> {
  const doc = await MatchFlowModel.findOne({
    _id: matchFlowId,
    userId: new Types.ObjectId(userId),
  });

  if (!doc) {
    throw new HttpError(404, "NOT_FOUND", "Match flow not found");
  }

  const text = doc.extractedResumeText;
  if (typeof text !== "string" || text.trim() === "") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "extractedResumeText is empty; upload a resume PDF first"
    );
  }

  /** Authoritative hash for the exact string passed to `parseResume` (Role 4 contract). */
  const resumeTextHash = sha256Hex(text);

  if (doc.resumeTextHash !== resumeTextHash) {
    doc.resumeTextHash = resumeTextHash;
  }

  const existing = doc.parsedResume as ParsedResume | undefined;
  if (existing !== undefined && existing !== null && existing.raw_text_hash === resumeTextHash) {
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }
    return { parsedResume: withAccountPersonalInfo(existing, user), cached: true };
  }

  try {
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }
    const parsedResume = withAccountPersonalInfo(await parseResume(text), user);
    doc.parsedResume = parsedResume;
    doc.status = "parsed";
    doc.lastError = undefined;
    await doc.save();
    return { parsedResume, cached: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("parseResume:")) {
      throw new HttpError(422, "AI_VALIDATION_FAILED", msg);
    }
    throw err;
  }
}

export async function analyzeJobForMatchFlow(
  matchFlowId: Types.ObjectId,
  userId: string,
  jobDescription: string
): Promise<{ jobAnalysis: JobAnalysis; cached: boolean }> {
  if (typeof jobDescription !== "string") {
    throw new HttpError(400, "VALIDATION_ERROR", "jobDescription must be a string");
  }

  const normalized = jobDescription.trim();
  if (normalized === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "jobDescription must be non-empty");
  }

  const jobDescriptionHash = sha256Hex(normalized);

  const doc = await MatchFlowModel.findOne({
    _id: matchFlowId,
    userId: new Types.ObjectId(userId),
  });

  if (!doc) {
    throw new HttpError(404, "NOT_FOUND", "Match flow not found");
  }

  const existingAnalysis = doc.jobAnalysis as JobAnalysis | undefined;
  if (
    doc.jobDescriptionHash === jobDescriptionHash &&
    existingAnalysis !== undefined &&
    existingAnalysis !== null
  ) {
    return { jobAnalysis: existingAnalysis, cached: true };
  }

  try {
    const jobAnalysis = await analyzeJob(normalized);
    doc.jobRawDescription = normalized;
    doc.jobDescriptionHash = jobDescriptionHash;
    doc.jobAnalysis = jobAnalysis;
    doc.status = "job_analyzed";
    doc.lastError = undefined;
    await doc.save();
    return { jobAnalysis, cached: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("analyzeJob:")) {
      throw new HttpError(422, "AI_VALIDATION_FAILED", msg);
    }
    throw err;
  }
}

export async function calculateMatchForMatchFlow(
  matchFlowId: Types.ObjectId,
  userId: string
): Promise<{ matchReport: MatchAnalysis; cached: boolean }> {
  const doc = await MatchFlowModel.findOne({
    _id: matchFlowId,
    userId: new Types.ObjectId(userId),
  });

  if (!doc) {
    throw new HttpError(404, "NOT_FOUND", "Match flow not found");
  }

  const jobAnalysis = doc.jobAnalysis as JobAnalysis | undefined;
  const parsedResume = doc.parsedResume as ParsedResume | undefined;

  if (
    jobAnalysis === undefined ||
    jobAnalysis === null ||
    parsedResume === undefined ||
    parsedResume === null
  ) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "parsedResume and jobAnalysis are required; complete parse-resume and job steps first"
    );
  }

  const resumeTextHash = doc.resumeTextHash;
  const jobDescriptionHash = doc.jobDescriptionHash;

  if (
    typeof resumeTextHash !== "string" ||
    resumeTextHash === "" ||
    typeof jobDescriptionHash !== "string" ||
    jobDescriptionHash === ""
  ) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Missing resumeTextHash or jobDescriptionHash; re-run resume upload and job analysis"
    );
  }

  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }

  const profileInput = userToProfileInput(user);
  const fingerprint = computeMatchInputFingerprint(
    profileInput,
    jobDescriptionHash,
    resumeTextHash
  );

  const existingReport = doc.matchReport as MatchAnalysis | undefined;
  if (
    doc.matchInputFingerprint === fingerprint &&
    existingReport !== undefined &&
    existingReport !== null
  ) {
    return { matchReport: existingReport, cached: true };
  }

  try {
    const matchReport = await calculateMatch(profileInput, jobAnalysis, parsedResume);
    doc.matchReport = matchReport;
    doc.matchInputFingerprint = fingerprint;
    doc.status = "matched";
    doc.lastError = undefined;
    await doc.save();
    return { matchReport, cached: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("calculateMatch:")) {
      throw new HttpError(422, "AI_VALIDATION_FAILED", msg);
    }
    throw err;
  }
}
