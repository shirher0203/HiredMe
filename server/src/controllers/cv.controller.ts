import type { NextFunction, Request, Response } from "express";
import { extractTextFromBuffer } from "../services/pdf.service";
import { analyzeJob, calculateMatch, parseResume } from "../services/ai/ai.service";
import type { ExtractCvTextData, ParseCvData, SuccessResponse } from "../types/api.types";
import type { ParsedResume } from "../services/ai/parsed-resume.types";
import { UserProfileModel } from "../models/user-profile.model";
import { UserModel } from "../models/user.model";
import { requireUser } from "./controller-utils";
import { HttpError } from "../utils/http-error";
import { withAccountPersonalInfo } from "../utils/personal-info";

function toProfileInput(parsedResume: ParsedResume) {
  return {
    skills: [
      ...parsedResume.skills.technical_skills,
      ...parsedResume.skills.tools_and_software,
    ],
    experienceYears:
      Number.isFinite(parsedResume.parsed_metadata.years_of_experience_estimate) &&
      parsedResume.parsed_metadata.years_of_experience_estimate > 0
        ? parsedResume.parsed_metadata.years_of_experience_estimate
        : 0,
    projects: parsedResume.projects
      .map((project) => project.project_name)
      .filter((name): name is string => typeof name === "string" && name.trim() !== ""),
    education: parsedResume.education
      .map((item) =>
        [item.degree_type, item.field_of_study, item.institution_name]
          .filter((part): part is string => typeof part === "string" && part.trim() !== "")
          .join(" ")
      )
      .filter(Boolean)
      .join("; "),
  };
}

export async function extractCvText(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new HttpError(400, "MISSING_FILE", "PDF file is required");
    }

    const { text, pageCount } = await extractTextFromBuffer(req.file.buffer);

    console.log("Extracted Text Length:", text.length);

    const response: SuccessResponse<ExtractCvTextData> = {
      status: "success",
      data: {
        filename: req.file.originalname,
        pageCount,
        extractedText: text,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
}

export async function analyzeResumeMatch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new HttpError(400, "MISSING_FILE", "PDF file is required");
    }

    const jobDescription = req.body?.jobDescription;
    if (typeof jobDescription !== "string" || jobDescription.trim() === "") {
      throw new HttpError(400, "VALIDATION_ERROR", "jobDescription is required");
    }

    const { text } = await extractTextFromBuffer(req.file.buffer);
    const parsedResume = await parseResume(text);

    const job = await analyzeJob(jobDescription.trim());
    const match = await calculateMatch(
      {
        skills: [],
        experienceYears:
          Number.isFinite(parsedResume.parsed_metadata.years_of_experience_estimate) &&
          parsedResume.parsed_metadata.years_of_experience_estimate > 0
            ? parsedResume.parsed_metadata.years_of_experience_estimate
            : 0,
        projects: [],
      },
      job,
      parsedResume
    );

    return res.status(200).json({ job, match, parsedResume });
  } catch (err) {
    return next(err);
  }
}

export async function analyzeProfileMatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const jobDescription = req.body?.jobDescription;
    if (typeof jobDescription !== "string" || jobDescription.trim() === "") {
      throw new HttpError(400, "VALIDATION_ERROR", "jobDescription is required");
    }

    const savedProfile = await UserProfileModel.findOne({ userId }).lean();
    if (!savedProfile?.profile) {
      throw new HttpError(
        404,
        "PROFILE_NOT_FOUND",
        "Create and save your profile before analyzing a job match"
      );
    }

    const parsedResume = savedProfile.profile as ParsedResume;
    const job = await analyzeJob(jobDescription.trim());
    const match = await calculateMatch(toProfileInput(parsedResume), job, parsedResume);

    return res.status(200).json({ job, match, parsedResume });
  } catch (err) {
    return next(err);
  }
}

export async function parseCv(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new HttpError(400, "MISSING_FILE", "PDF file is required");
    }

    const { userId } = requireUser(req);
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      throw new HttpError(404, "NOT_FOUND", "User not found");
    }

    const { text } = await extractTextFromBuffer(req.file.buffer);
    const parsedResume = withAccountPersonalInfo(await parseResume(text), user);

    const response: SuccessResponse<ParseCvData> = {
      status: "success",
      data: {
        parsedResume,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
}
