import type { MatchAnalysis } from "./matching";

export const JOB_STATUSES = [
  "applied",
  "hr",
  "technical",
  "assignment",
  "manager",
  "offer",
  "not_relevant",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobSource = "manual" | "match";

export interface ScheduledInterview {
  startAt: string;
  endAt: string;
}

export interface Job {
  id: string;
  title: string;
  company: string | null;
  description: string;
  status: JobStatus;
  notes: string | null;
  contact: string | null;
  jobUrl: string | null;
  source: JobSource;
  matchAnalysis: MatchAnalysis | null;
  scheduledInterview: ScheduledInterview | null;
  createdAt: string;
  updatedAt: string;
}

export type JobsBoard = Record<JobStatus, Job[]>;

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  applied: "Application",
  hr: "HR — Phone Interview",
  technical: "Technical Interview",
  assignment: "Assignment / Home Exercise",
  manager: "Team / Manager Interview",
  offer: "Offer",
  not_relevant: "Not Relevant",
};

export interface CreateJobInput {
  description: string;
  title?: string;
  company?: string;
  notes?: string;
  contact?: string;
  jobUrl?: string;
  source?: JobSource;
  status?: JobStatus;
}

export interface UpdateJobInput {
  title?: string;
  company?: string;
  description?: string;
  notes?: string;
  contact?: string;
  jobUrl?: string;
}
