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

  console.log("");
  console.log(`${passed}/5 passed`);

  process.exit(passed === 5 ? 0 : 1);
}

main();
