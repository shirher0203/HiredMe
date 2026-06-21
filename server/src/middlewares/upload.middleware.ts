import multer from "multer";
import { HttpError } from "../utils/http-error";

const PDF_MIME_TYPE = "application/pdf";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== PDF_MIME_TYPE) {
      return callback(
        new HttpError(400, "INVALID_FILE_TYPE", "Only PDF files are supported")
      );
    }

    return callback(null, true);
  },
});

const MAX_ASSIGNMENT_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Uploader for home-assignment submissions. Unlike `upload` it accepts any
 * file type (code files, plain text, or PDF) since assignments are not
 * limited to PDFs. Text extraction is handled in the controller.
 */
export const uploadAssignment = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ASSIGNMENT_SIZE_BYTES,
  },
});
