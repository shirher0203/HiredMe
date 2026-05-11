import type { NextFunction, Request, Response } from "express";
import { extractTextFromBuffer } from "../services/pdf.service";
import { analyzeJob, calculateMatch, parseResume } from "../services/ai/ai.service";
import type { ExtractCvTextData, SuccessResponse } from "../types/api.types";
import { HttpError } from "../utils/http-error";

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
