import { getAuthSession } from "./auth";
import type { ParsedResume, ParsedResumePersonalInfo } from "../types/parsedResume";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiEnvelope<T> {
  status: "success";
  data: T;
}

export interface UserProfilePayload {
  profile: ParsedResume | null;
  personalInfo: ParsedResumePersonalInfo;
  rawCvFileUrl: string | null;
  updatedAt: string | null;
}
interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

function buildAuthHeaders(extra?: HeadersInit): HeadersInit {
  const session = getAuthSession();
  return {
    ...(extra ?? {}),
    ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function parseCv(file: File): Promise<ParsedResume> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/cv/parse`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to parse CV."));
  }

  const body = (await response.json()) as ApiEnvelope<{ parsedResume: ParsedResume }>;
  return body.data.parsedResume;
}

export async function getUserProfile(): Promise<UserProfilePayload> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/profile`, {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load profile."));
  }

  const body = (await response.json()) as ApiEnvelope<UserProfilePayload>;
  return body.data;
}

export async function saveUserProfile(profile: ParsedResume): Promise<ParsedResume> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users/profile`, {
    method: "PUT",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ profile }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to save profile."));
  }

  const body = (await response.json()) as ApiEnvelope<{ profile: ParsedResume }>;
  return body.data.profile;
}
