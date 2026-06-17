import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middlewares/validate.middleware";
import { HttpError } from "../../utils/http-error";

const schema = z.object({
  body: z.object({ name: z.string().min(1) }),
});

function buildReq(body: unknown): Request {
  return { body, params: {}, query: {} } as unknown as Request;
}

describe("validate middleware", () => {
  it("calls next() with no error for valid input", () => {
    const req = buildReq({ name: "Nerya" });
    const next = jest.fn() as unknown as NextFunction;

    validate(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined();
  });

  it("coerces/writes the parsed body back onto the request", () => {
    const coercingSchema = z.object({
      body: z.object({ count: z.coerce.number() }),
    });
    const req = buildReq({ count: "5" });
    const next = jest.fn() as unknown as NextFunction;

    validate(coercingSchema)(req, {} as Response, next);

    expect((req.body as { count: number }).count).toBe(5);
  });

  it("forwards HttpError 400 VALIDATION_ERROR for invalid input", () => {
    const req = buildReq({ name: "" });
    const next = jest.fn() as unknown as NextFunction;

    validate(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(typeof err.message).toBe("string");
  });
});
