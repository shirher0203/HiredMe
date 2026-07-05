import { getAuthSession } from "./auth";
import {
  JOB_STATUSES,
  SCHEDULABLE_JOB_STATUSES,
  emptyStageSchedules,
  type CreateJobInput,
  type Job,
  type JobSource,
  type JobStatus,
  type JobsBoard,
  type SchedulableJobStatus,
  type StageSchedules,
  type UpdateJobInput,
} from "../types/jobs";
import type { MatchAnalysis } from "../types/matching";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

interface RawScheduledInterview {
  startAt?: string;
  endAt?: string;
}

interface RawJobRecord {
  id?: string;
  _id?: string;
  title?: string;
  company?: string | null;
  description?: string;
  status?: string;
  notes?: string | null;
  contact?: string | null;
  jobUrl?: string | null;
  source?: string;
  matchAnalysis?: MatchAnalysis | null;
  stageSchedules?: Partial<Record<SchedulableJobStatus, RawScheduledInterview | null>>;
  createdAt?: string;
  updatedAt?: string;
}

function requireAuthHeaders(): HeadersInit {
  const session = getAuthSession();
  if (!session) {
    throw new Error("You must be logged in.");
  }

  return {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
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

function normalizeStatus(raw: unknown): JobStatus {
  if (raw === "to_apply") {
    return "applied";
  }
  if (typeof raw === "string" && JOB_STATUSES.includes(raw as JobStatus)) {
    return raw as JobStatus;
  }
  return "applied";
}

function normalizeSource(raw: unknown): JobSource {
  if (raw === "match") {
    return "match";
  }
  return "manual";
}

function normalizeScheduledInterview(raw: RawScheduledInterview | null | undefined) {
  if (!raw?.startAt || !raw?.endAt) {
    return null;
  }
  return { startAt: raw.startAt, endAt: raw.endAt };
}

function normalizeStageSchedules(
  raw: Partial<Record<SchedulableJobStatus, RawScheduledInterview | null>> | undefined
): StageSchedules {
  const result = emptyStageSchedules();
  if (!raw) {
    return result;
  }
  for (const stage of SCHEDULABLE_JOB_STATUSES) {
    result[stage] = normalizeScheduledInterview(raw[stage]);
  }
  return result;
}

export function normalizeJob(raw: RawJobRecord): Job {
  const id = raw.id ?? (raw._id ? String(raw._id) : "");
  return {
    id,
    title: raw.title ?? "Untitled job",
    company: raw.company ?? null,
    description: raw.description ?? "",
    status: normalizeStatus(raw.status),
    notes: raw.notes ?? null,
    contact: raw.contact ?? null,
    jobUrl: raw.jobUrl ?? null,
    source: normalizeSource(raw.source),
    matchAnalysis: raw.matchAnalysis ?? null,
    stageSchedules: normalizeStageSchedules(raw.stageSchedules),
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
  };
}

function normalizeBoard(raw: Record<string, RawJobRecord[]>): JobsBoard {
  const board = Object.fromEntries(
    JOB_STATUSES.map((status) => [status, [] as Job[]])
  ) as JobsBoard;

  for (const status of JOB_STATUSES) {
    const items = raw[status] ?? [];
    board[status] = items.map(normalizeJob);
  }

  for (const [key, items] of Object.entries(raw)) {
    if (key === "to_apply") {
      board.applied.push(...items.map(normalizeJob));
    }
  }

  return board;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackError: string
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackError));
  }

  return response.json() as Promise<T>;
}

export async function fetchJobsBoard(): Promise<JobsBoard> {
  const raw = await requestJson<Record<string, RawJobRecord[]>>(
    "/api/jobs?view=board",
    {
      method: "GET",
      headers: requireAuthHeaders(),
    },
    "Failed to load applications board."
  );

  return normalizeBoard(raw);
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const raw = await requestJson<RawJobRecord>(
    "/api/jobs",
    {
      method: "POST",
      headers: requireAuthHeaders(),
      body: JSON.stringify(input),
    },
    "Failed to create application."
  );

  return normalizeJob(raw);
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<Job> {
  const raw = await requestJson<RawJobRecord>(
    `/api/jobs/${id}/status`,
    {
      method: "PATCH",
      headers: requireAuthHeaders(),
      body: JSON.stringify({ status }),
    },
    "Failed to update application status."
  );

  return normalizeJob(raw);
}

export async function updateJob(id: string, input: UpdateJobInput): Promise<Job> {
  const raw = await requestJson<RawJobRecord>(
    `/api/jobs/${id}`,
    {
      method: "PATCH",
      headers: requireAuthHeaders(),
      body: JSON.stringify(input),
    },
    "Failed to update application."
  );

  return normalizeJob(raw);
}

export async function deleteJob(id: string): Promise<void> {
  await requestJson<{ id: string }>(
    `/api/jobs/${id}`,
    {
      method: "DELETE",
      headers: requireAuthHeaders(),
    },
    "Failed to delete application."
  );
}

export async function scheduleJob(id: string, startAt: string): Promise<Job> {
  const raw = await requestJson<RawJobRecord>(
    `/api/jobs/${id}/schedule`,
    {
      method: "POST",
      headers: requireAuthHeaders(),
      body: JSON.stringify({ startAt }),
    },
    "Failed to schedule interview."
  );

  return normalizeJob(raw);
}

export async function unscheduleJob(id: string): Promise<Job> {
  const raw = await requestJson<RawJobRecord>(
    `/api/jobs/${id}/schedule`,
    {
      method: "DELETE",
      headers: requireAuthHeaders(),
    },
    "Failed to unschedule interview."
  );

  return normalizeJob(raw);
}
