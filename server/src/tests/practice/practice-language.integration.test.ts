/**
 * The interview language must survive question regeneration.
 *
 * A Hebrew CV produces a Hebrew session, and the client only sends `language`
 * when the session is created. Before the language was persisted, regenerating
 * fell back to the prompt builder's English default, so a user refreshing a
 * Hebrew interview got English replacements next to their Hebrew answers.
 *
 * The assertions are on the input handed to `generateInterviewQuestions` rather
 * than on the returned text: mock mode returns fixed English questions, so
 * asserting on output would test the fixture instead of the plumbing.
 */

import request from "supertest";
import type { Express } from "express";
import mongoose, { Types } from "mongoose";
import { createApp } from "../../app";
import { PracticeSessionModel } from "../../models/practice-session.model";
import { UserProfileModel } from "../../models/user-profile.model";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";
import * as aiService from "../../services/ai/ai.service";

jest.setTimeout(60_000);

function resume(languageDetected: "en" | "he") {
  return {
    raw_text_hash: `resume-hash-${languageDetected}`,
    personal_info: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: "Candidate summary.",
    work_experience: [],
    education: [],
    skills: {
      technical_skills: ["python"],
      soft_skills: [],
      tools_and_software: ["git"],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: languageDetected,
      years_of_experience_estimate: 1,
    },
  };
}

describe("Interview language persistence", () => {
  let app: Express;
  let generateSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  beforeEach(() => {
    // Delegates to the real implementation so mock-mode generation still runs;
    // the spy exists only to inspect the input.
    generateSpy = jest.spyOn(aiService, "generateInterviewQuestions");
  });

  afterEach(async () => {
    generateSpy.mockRestore();
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  async function startSession(
    token: string,
    userId: string,
    language: "en" | "he"
  ) {
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: resume(language),
    });

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "technical", count: 3, language });

    expect(res.status).toBe(201);
    return res.body as { _id: string; questions: Array<{ id: string }> };
  }

  it("persists the requested language on the session", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId, "he");

    const stored = await PracticeSessionModel.findById(session._id).lean();
    expect(stored?.language).toBe("he");
  });

  it("regenerates a Hebrew session in Hebrew", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId, "he");

    generateSpy.mockClear();

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy.mock.calls[0][0]).toMatchObject({ language: "he" });
  });

  it("regenerates an English session in English", async () => {
    const { token, userId } = makeAuthToken();
    const session = await startSession(token, userId, "en");

    generateSpy.mockClear();

    const res = await request(app)
      .post(`/api/practice/sessions/${session._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(generateSpy.mock.calls[0][0]).toMatchObject({ language: "en" });
  });

  it("defaults a legacy session with no stored language to English", async () => {
    const { token, userId } = makeAuthToken();

    // Inserted through the driver so no schema default is applied — this is the
    // shape of a session created before `language` existed.
    const inserted = await mongoose.connection
      .collection("practicesessions")
      .insertOne({
        userId: new Types.ObjectId(userId),
        interviewType: "technical",
        status: "active",
        questions: [
          {
            id: "q1",
            question: "Legacy question",
            topic: "general",
            expectedFocus: "Anything.",
          },
        ],
        turns: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const stored = await PracticeSessionModel.findById(
      inserted.insertedId
    ).lean();
    expect(stored?.language).toBeUndefined();

    generateSpy.mockClear();

    const res = await request(app)
      .post(`/api/practice/sessions/${inserted.insertedId}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(generateSpy.mock.calls[0][0]).toMatchObject({ language: "en" });
  });
});
