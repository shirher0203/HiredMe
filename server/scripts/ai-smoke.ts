/**
 * Live smoke test for the Gemini integration.
 *
 * Forces USE_MOCK_AI=false and runs every public AI service function
 * sequentially with realistic junior-full-stack inputs. Prints one
 * PASS/FAIL line per function and a final "<N>/5 passed" summary.
 * Exits non-zero if anything fails or if GEMINI_API_KEY is missing.
 *
 * Usage (from the `server/` directory):
 *   npm run smoke:ai
 *
 * Hits the network and costs quota — intentionally a throwaway script,
 * not a Jest test.
 */

import "dotenv/config";

process.env.USE_MOCK_AI = "false";

import {
  analyzeProfile,
  analyzeJob,
  calculateMatch,
  generateInterviewQuestions,
  evaluateAnswer,
  parseResume,
} from "../src/services/ai/ai.service";
import type { ProfileInput, JobAnalysis } from "../src/services/matching/matching.types";

const PROFILE: ProfileInput = {
  skills: ["react", "node", "typescript"],
  experienceYears: 1,
  projects: [
    "Todo app with React, Node and MongoDB",
    "Personal portfolio site built with Next.js",
  ],
  education: "BSc Computer Science",
  goals: "full-stack role",
};

const JOB_DESCRIPTION = [
  "Junior Full-Stack Developer.",
  "We build customer-facing web apps using React, Node.js and TypeScript.",
  "Looking for 0-2 years of experience with MongoDB and REST APIs.",
  "Nice to have: Docker, CI/CD, AWS.",
].join("\n");

const CANDIDATE_ANSWER = [
  "I would start by defining clear component boundaries and keeping state",
  "close to where it is used. For shared state across screens I usually reach",
  "for a small store like Zustand or React context, depending on how much",
  "the state changes. I keep side effects inside custom hooks so the UI",
  "components stay predictable and easy to test.",
].join(" ");

const RESUME_TEXT = [
  "Dana Levi",
  "dana.levi@example.com | +972-50-123-4567 | Tel Aviv, Israel",
  "https://www.linkedin.com/in/dana-levi | https://github.com/dana-levi",
  "",
  "Summary",
  "Junior full-stack developer with one year of hands-on experience building",
  "React and Node services on a MongoDB-backed stack.",
  "",
  "Experience",
  "Acme Labs — Junior Full-Stack Developer (Jul 2024 - present), Tel Aviv",
  "- Built React components with TypeScript for the internal admin dashboard.",
  "- Implemented REST endpoints in Node and Express backed by MongoDB.",
  "- Reduced dashboard load time by 40% by memoizing heavy list views.",
  "",
  "Education",
  "Tel Aviv University — BSc in Computer Science (2021-2024).",
  "",
  "Skills",
  "Technical: React.js, Node.js, TypeScript, MongoDB",
  "Tools: Git, Docker, VSCode",
  "Soft: communication, ownership",
  "",
  "Projects",
  "HiredMe — AI-powered platform that matches profiles to jobs and simulates interviews.",
  "Built with React, Node, MongoDB, and TypeScript. https://github.com/shirher0203/HiredMe",
  "",
  "Languages",
  "Hebrew (native), English (fluent).",
].join("\n");

async function run<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; value: T | null }> {
  const start = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - start;
    console.log(`[PASS] ${name} (${ms}ms)`);
    return { ok: true, value };
  } catch (err) {
    const ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[FAIL] ${name} (${ms}ms): ${message}`);
    return { ok: false, value: null };
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  if (!apiKey) {
    console.error("FAIL: GEMINI_API_KEY is not set in server/.env");
    process.exit(1);
  }

  console.log(`Model: ${model}`);
  console.log("Key:   configured");
  console.log("");

  let passed = 0;

  const profileStep = await run("analyzeProfile", () => analyzeProfile(PROFILE));
  if (profileStep.ok) passed++;

  const jobStep = await run("analyzeJob", () => analyzeJob(JOB_DESCRIPTION));
  if (jobStep.ok) passed++;
  const jobAnalysis: JobAnalysis | null = jobStep.value;

  const matchStep = await run("calculateMatch", async () => {
    if (!jobAnalysis) {
      throw new Error("prior step did not produce a JobAnalysis");
    }
    return calculateMatch(PROFILE, jobAnalysis);
  });
  if (matchStep.ok) passed++;

  const questionsStep = await run("generateInterviewQuestions", () =>
    generateInterviewQuestions({
      interviewType: "technical",
      profileSkills: PROFILE.skills,
      jobRequiredSkills: jobAnalysis?.requiredSkills,
      count: 3,
    })
  );
  if (questionsStep.ok) passed++;

  const evaluateStep = await run("evaluateAnswer", async () => {
    const firstQuestion = questionsStep.value?.questions?.[0];
    if (!firstQuestion) {
      throw new Error("prior step did not produce any questions");
    }
    return evaluateAnswer({
      question: firstQuestion.question,
      expectedFocus: firstQuestion.expectedFocus,
      userAnswer: CANDIDATE_ANSWER,
      interviewType: "technical",
    });
  });
  if (evaluateStep.ok) passed++;

  const resumeStep = await run("parseResume", () => parseResume(RESUME_TEXT));
  if (resumeStep.ok) passed++;

  const resumeAwareMatchStep = await run(
    "calculateMatch(resume-aware)",
    async () => {
      if (!jobAnalysis) {
        throw new Error("prior step did not produce a JobAnalysis");
      }
      if (!resumeStep.value) {
        throw new Error("prior step did not produce a ParsedResume");
      }
      return calculateMatch(PROFILE, jobAnalysis, resumeStep.value);
    }
  );
  if (resumeAwareMatchStep.ok) passed++;

  console.log("");
  console.log(`${passed}/7 passed`);

  process.exit(passed === 7 ? 0 : 1);
}

main();
