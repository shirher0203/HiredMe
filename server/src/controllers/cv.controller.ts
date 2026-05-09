import type { NextFunction, Request, Response } from "express";
import { extractTextFromBuffer } from "../services/pdf.service";
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
