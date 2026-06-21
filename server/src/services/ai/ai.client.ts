// The one and only place where the Gemini SDK is imported.
//
// Contract: callAi takes a prompt and returns raw provider text. It does NOT
// parse JSON, validate shape, clamp numbers, or apply business logic —
// downstream layers (safe-json.ts, ai.service.ts) own that. Keeping this
// wrapper thin is what makes the system provider-agnostic: swapping to a
// different SDK later only changes this file.

import "dotenv/config";
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from "@google/generative-ai";

import { logAiClientCall, logAiClientError } from "./ai.logger";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const SYSTEM_INSTRUCTION =
  "You are a precise JSON API. Respond with valid JSON only.";

let cachedModel: GenerativeModel | undefined;
let cachedModelKey: string | undefined;

export function getActiveModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function isApiKeyConfigured(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return typeof k === "string" && k.trim() !== "";
}

function getModel(): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const modelName = getActiveModelName();
  const key = `${apiKey}::${modelName}`;

  if (cachedModel && cachedModelKey === key) {
    return cachedModel;
  }

  const client = new GoogleGenerativeAI(apiKey);
  cachedModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.2,
    },
  });
  cachedModelKey = key;
  return cachedModel;
}

export async function callAi(prompt: string): Promise<string> {
  if (process.env.USE_MOCK_AI === "true") {
    throw new Error("AI client should not be called in mock mode");
  }

  const modelName = getActiveModelName();
  const start = Date.now();

  try {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text || text.trim() === "") {
      throw new Error("Empty response from AI Provider");
    }

    logAiClientCall({
      model: modelName,
      durationMs: Date.now() - start,
      outputChars: text.length,
    });

    return text;
  } catch (err) {
    logAiClientError({
      model: modelName,
      durationMs: Date.now() - start,
      error: err,
    });
    throw err;
  }
}
