import { PDFParse } from "pdf-parse";
import { HttpError } from "../utils/http-error";

interface ExtractedPdfText {
  text: string;
  pageCount: number;
}

export async function extractTextFromBuffer(buffer: Buffer): Promise<ExtractedPdfText> {
  const parser = new PDFParse({ data: buffer });

  try {
    const pdfData = await parser.getText();
    const text = pdfData.text;

    if (text.trim().length < 10) {
      throw new HttpError(
        400,
        "EMPTY_PDF_TEXT",
        "Scanned or empty PDF detected. OCR required."
      );
    }

    return {
      text,
      pageCount: pdfData.total,
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }

    throw new HttpError(500, "PARSE_ERROR", "Failed to parse PDF file");
  } finally {
    await parser.destroy();
  }
}
