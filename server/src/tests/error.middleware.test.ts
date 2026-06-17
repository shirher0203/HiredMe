import express from "express";
import multer from "multer";
import request from "supertest";
import type { Request, Response } from "express";
import { errorMiddleware } from "../middlewares/error.middleware";
import {
  INTERNAL_ERROR_PUBLIC_MESSAGE,
  isAiValidationErrorMessage,
} from "../middlewares/error-map";
import { HttpError } from "../utils/http-error";

function minimalApp(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.get("/case", handler);
  app.use(errorMiddleware);
  return app;
}

describe("errorMiddleware", () => {
  describe("HttpError (PDF + existing codes)", () => {
    it("returns 400 for EMPTY_PDF_TEXT", async () => {
      const app = minimalApp((_req, _res, next) => {
        next(
          new HttpError(
            400,
            "EMPTY_PDF_TEXT",
            "Scanned or empty PDF detected. OCR required."
          )
        );
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(400);
      expect(res.body.status).toBe("error");
      expect(res.body.error.code).toBe("EMPTY_PDF_TEXT");
      expect(res.body.error.message).toContain("OCR");
    });

    it("returns 500 for PARSE_ERROR", async () => {
      const app = minimalApp((_req, _res, next) => {
        next(new HttpError(500, "PARSE_ERROR", "Failed to parse PDF file"));
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("PARSE_ERROR");
    });

    it("returns AI_VALIDATION_FAILED at 422 when HttpError already wraps AI (match-flow services)", async () => {
      const app = minimalApp((_req, _res, next) => {
        next(
          new HttpError(422, "AI_VALIDATION_FAILED", "parseResume: field 'x' invalid")
        );
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("AI_VALIDATION_FAILED");
      expect(res.body.error.message).toContain("parseResume:");
    });
  });

  describe("plain Error with AI prefixes → 422", () => {
    it.each([
      ["parseResume:", "parseResume: retry failed"],
      ["analyzeJob:", "analyzeJob: field 'summary' invalid"],
      ["calculateMatch:", "calculateMatch: retry failed"],
    ])("maps %s prefix to 422 AI_VALIDATION_FAILED", async (_label, msg) => {
      const app = minimalApp((_req, _res, next) => {
        next(new Error(msg));
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(422);
      expect(res.body.status).toBe("error");
      expect(res.body.error.code).toBe("AI_VALIDATION_FAILED");
      expect(res.body.error.message).toBe(msg);
    });
  });

  describe("multer errors (upload limits)", () => {
    it("LIMIT_FILE_SIZE → 413 FILE_TOO_LARGE", () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      const err = new multer.MulterError("LIMIT_FILE_SIZE");
      errorMiddleware(err, {} as Request, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          error: expect.objectContaining({
            code: "FILE_TOO_LARGE",
            message: "PDF file must be 5MB or smaller",
          }),
        })
      );
    });
  });

  describe("unexpected errors", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("in non-production, exposes Error.message in INTERNAL_ERROR", async () => {
      process.env.NODE_ENV = "development";
      const app = minimalApp((_req, _res, next) => {
        next(new Error("Database exploded"));
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.error.message).toBe("Database exploded");
    });

    it("in production, hides internal Error.message (no stack in JSON)", async () => {
      process.env.NODE_ENV = "production";
      const app = minimalApp((_req, _res, next) => {
        const e = new Error("SECRET stack-prone detail");
        e.stack = "Error: SECRET\n    at fake.ts:1:1";
        next(e);
      });

      const res = await request(app).get("/case");
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.error.message).toBe(INTERNAL_ERROR_PUBLIC_MESSAGE);
      expect(JSON.stringify(res.body)).not.toContain("SECRET");
      expect(JSON.stringify(res.body)).not.toContain("fake.ts");
    });
  });
});

describe("isAiValidationErrorMessage", () => {
  it("returns true only for known prefixes", () => {
    expect(isAiValidationErrorMessage("parseResume: bad")).toBe(true);
    expect(isAiValidationErrorMessage("analyzeJob: bad")).toBe(true);
    expect(isAiValidationErrorMessage("calculateMatch: bad")).toBe(true);
    expect(isAiValidationErrorMessage("not ai")).toBe(false);
  });
});
