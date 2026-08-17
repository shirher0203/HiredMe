/**
 * HR interviews grounded in the candidate's CV.
 *
 * The interviewType already existed end to end; what was missing was context.
 * The question prompt only ever received skill lists, so an HR interview could
 * not reference anything the candidate had actually done, and the UI could not
 * start one without a job.
 */

import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { createApp } from "../../app";
import { PracticeSessionModel } from "../../models/practice-session.model";
import { UserProfileModel } from "../../models/user-profile.model";
import { buildGenerateQuestionsPrompt } from "../../services/ai/prompts";
import {
  connectTestDb,
  disconnectTestDb,
  clearTestDb,
  makeAuthToken,
} from "../helpers/test-db";

jest.setTimeout(60_000);

function richResume() {
  return {
    raw_text_hash: "resume-hash",
    personal_info: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      linkedin_url: null,
      portfolio_or_github_url: null,
    },
    professional_summary: "Security-track engineer.",
    work_experience: [
      {
        company_name: "Northwind Security",
        job_title: "Security Analyst",
        start_date: "2024",
        end_date: "present",
        location: null,
        responsibilities: ["Triaged alerts", "Wrote detection rules"],
        achievements: ["Cut false positives by half", "Automated triage reporting"],
      },
    ],
    education: [
      {
        institution_name: "Open University",
        degree_type: "BSc",
        field_of_study: "Computer Science",
        start_date: "2022",
        end_date: null,
      },
    ],
    skills: {
      technical_skills: ["python", "cyber-attack"],
      soft_skills: ["teamwork"],
      tools_and_software: ["wireshark"],
    },
    projects: [
      {
        project_name: "Traffic Anomaly Detector",
        description: "Flags unusual network traffic patterns.",
        technologies_used: ["python", "pandas"],
        link: null,
      },
    ],
    languages: [{ language: "English", proficiency_level: "fluent" }],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: "en",
      years_of_experience_estimate: 2,
    },
  };
}

describe("HR practice sessions", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.USE_MOCK_AI = "true";
    await connectTestDb();
    app = createApp();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
    delete process.env.USE_MOCK_AI;
  });

  it("starts an HR session with no jobId", async () => {
    const { token, userId } = makeAuthToken();
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: richResume(),
    });

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "hr", count: 3 });

    expect(res.status).toBe(201);
    expect(res.body.interviewType).toBe("hr");
    expect(res.body.jobId).toBeUndefined();
    expect(res.body.questions).toHaveLength(3);
  });

  it("starts an HR session for a user with an empty profile", async () => {
    const { token } = makeAuthToken();

    const res = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "hr", count: 2 });

    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(2);
  });

  it("persists the session so it can be answered and completed", async () => {
    const { token, userId } = makeAuthToken();
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: richResume(),
    });

    const created = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "hr", count: 2 });

    const sessionId = created.body._id as string;
    const questionId = created.body.questions[0].id as string;

    const answered = await request(app)
      .post(`/api/practice/sessions/${sessionId}/msg`)
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId, userAnswer: "At Northwind I reduced false positives." });
    expect(answered.status).toBe(200);

    const completed = await request(app)
      .patch(`/api/practice/sessions/${sessionId}/complete`)
      .set("Authorization", `Bearer ${token}`);
    expect(completed.status).toBe(200);

    const stored = await PracticeSessionModel.findById(sessionId).lean();
    expect(stored!.interviewType).toBe("hr");
    expect(stored!.jobId).toBeUndefined();
    expect(stored!.status).toBe("completed");
  });

  it("can regenerate a job-less HR session", async () => {
    const { token, userId } = makeAuthToken();
    await UserProfileModel.create({
      userId: new Types.ObjectId(userId),
      profile: richResume(),
    });

    const created = await request(app)
      .post("/api/practice/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ interviewType: "hr", count: 3 });

    const res = await request(app)
      .post(`/api/practice/sessions/${created.body._id}/regenerate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(3);
  });
});

// Asserted at the prompt-builder level, because mock mode returns canned
// questions and so cannot demonstrate what the model was actually told.
describe("HR question prompt construction", () => {
  const cvContext = {
    workExperienceSummary: "Security Analyst at Northwind Security (2024-present)",
    topProjectsSummary: "Traffic Anomaly Detector — python, pandas",
    educationSummary: "BSc Computer Science, Open University",
    achievements: ["Cut false positives by half"],
  };

  it("includes the CV summaries for an HR interview", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["python"],
      count: 3,
      cvContext,
    });

    expect(prompt).toContain("Candidate CV:");
    expect(prompt).toContain("Northwind Security");
    expect(prompt).toContain("Traffic Anomaly Detector");
    expect(prompt).toContain("BSc Computer Science");
    expect(prompt).toContain("Cut false positives by half");
  });

  it("states the HR question rules", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["python"],
      count: 3,
      cvContext,
    });

    expect(prompt).toContain("HR interview rules:");
    expect(prompt).toContain("strengths");
    expect(prompt).toContain("weaknesses");
    expect(prompt).toContain("walk through one of their real projects");
    expect(prompt).toContain("challenge or conflict");
  });

  it("forbids inventing CV facts", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["python"],
      count: 3,
      cvContext,
    });

    expect(prompt).toContain("Use only what the CV states");
    expect(prompt).toContain(
      "Never invent an employer, project, technology, date or accomplishment"
    );
  });

  it("warns against inventing detail when no CV is available", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["python"],
      count: 3,
    });

    expect(prompt).toContain("HR interview rules:");
    expect(prompt).not.toContain("Candidate CV:");
    expect(prompt).toContain("do not invent any specifics");
  });

  it("does not leak CV context into a technical interview", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "technical",
      profileSkills: ["python"],
      jobRequiredSkills: ["threat-detection"],
      count: 3,
      cvContext,
    });

    expect(prompt).not.toContain("Candidate CV:");
    expect(prompt).not.toContain("Northwind Security");
    expect(prompt).not.toContain("HR interview rules:");
  });

  it("caps each CV summary so a long resume cannot dominate the prompt", () => {
    const prompt = buildGenerateQuestionsPrompt({
      interviewType: "hr",
      profileSkills: ["python"],
      count: 3,
      cvContext: {
        workExperienceSummary: "x".repeat(5000),
        achievements: Array.from({ length: 40 }, (_, i) => `Achievement ${i}`),
      },
    });

    const workLine = prompt
      .split("\n")
      .find((line: string) => line.startsWith("Work experience: "));
    expect(workLine!.length).toBeLessThan(1400);
    expect(prompt).toContain("Achievement 5");
    expect(prompt).not.toContain("Achievement 6");
  });
});
