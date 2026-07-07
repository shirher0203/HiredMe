import type { JobAnalysis, MatchAnalysis } from "./matching";

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

export const SCHEDULABLE_JOB_STATUSES = [
  "hr",
  "technical",
  "assignment",
  "manager",
] as const satisfies readonly JobStatus[];

export type SchedulableJobStatus = (typeof SCHEDULABLE_JOB_STATUSES)[number];

export function isSchedulableJobStatus(status: JobStatus): status is SchedulableJobStatus {
  return (SCHEDULABLE_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

export type JobSource = "manual" | "match";

export interface ScheduledInterview {
  startAt: string;
  endAt: string;
}

export type StageSchedules = Record<SchedulableJobStatus, ScheduledInterview | null>;

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
  jobAnalysis: JobAnalysis | null;
  matchAnalysis: MatchAnalysis | null;
  stageSchedules: StageSchedules;
  createdAt: string;
  updatedAt: string;
}

export function emptyStageSchedules(): StageSchedules {
  return Object.fromEntries(
    SCHEDULABLE_JOB_STATUSES.map((stage) => [stage, null])
  ) as StageSchedules;
}

export function getStageSchedule(
  job: Job,
  status: JobStatus
): ScheduledInterview | null {
  if (!isSchedulableJobStatus(status)) {
    return null;
  }
  return job.stageSchedules[status];
}

export function getScheduledStages(
  job: Job
): { status: SchedulableJobStatus; schedule: ScheduledInterview }[] {
  return SCHEDULABLE_JOB_STATUSES.flatMap((status) => {
    const schedule = job.stageSchedules[status];
    return schedule ? [{ status, schedule }] : [];
  });
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
