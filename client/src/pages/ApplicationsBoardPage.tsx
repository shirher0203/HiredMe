import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StagedProgress } from "../components/StagedProgress";
import { getAuthSession } from "../services/auth";
import {
  listPracticeSessions,
  type PracticeSessionListItem,
} from "../services/practice";
import {
  analyzeJob as analyzeSavedJob,
  createJob,
  deleteJob,
  fetchJobsBoard,
  scheduleJob as scheduleJobApi,
  unscheduleJob as unscheduleJobApi,
  updateJob,
  updateJobStatus,
} from "../services/jobs";
import {
  buildGoogleCalendarTemplateUrl,
  buildInterviewCalendarTitle,
  openGoogleCalendarEvent,
} from "../utils/googleCalendar";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  getScheduledStages,
  getStageSchedule,
  isSchedulableJobStatus,
  type CreateJobInput,
  type Job,
  type JobStatus,
  type JobsBoard,
  type UpdateJobInput,
} from "../types/jobs";
import type {
  JobAnalysis,
  MatchAnalysis,
  SkillMatchTier,
} from "../types/matching";
import type { ParsedResume } from "../types/parsedResume";

function emptyBoard(): JobsBoard {
  return {
    applied: [],
    hr: [],
    technical: [],
    assignment: [],
    manager: [],
    offer: [],
    not_relevant: [],
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function defaultTomorrowAt2pm(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(14, 0, 0, 0);
  return date;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function findColumnForJob(board: JobsBoard, jobId: string): JobStatus | null {
  for (const status of JOB_STATUSES) {
    if (board[status].some((job) => job.id === jobId)) {
      return status;
    }
  }
  return null;
}

function moveJobInBoard(
  board: JobsBoard,
  jobId: string,
  from: JobStatus,
  to: JobStatus
): JobsBoard {
  const job = board[from].find((item) => item.id === jobId);
  if (!job) {
    return board;
  }
  return {
    ...board,
    [from]: board[from].filter((item) => item.id !== jobId),
    [to]: [{ ...job, status: to }, ...board[to]],
  };
}

function replaceJobInBoard(board: JobsBoard, updated: Job): JobsBoard {
  const next = emptyBoard();
  for (const status of JOB_STATUSES) {
    next[status] = board[status].filter((job) => job.id !== updated.id);
  }
  next[updated.status] = [updated, ...next[updated.status]];
  return next;
}

function removeJobFromBoard(board: JobsBoard, jobId: string): JobsBoard {
  const next = { ...board };
  for (const status of JOB_STATUSES) {
    next[status] = board[status].filter((job) => job.id !== jobId);
  }
  return next;
}

function addJobToBoard(board: JobsBoard, job: Job): JobsBoard {
  return {
    ...board,
    [job.status]: [job, ...board[job.status]],
  };
}

function contactHref(contact: string): string | null {
  const trimmed = contact.trim();
  if (trimmed.includes("@")) {
    return `mailto:${trimmed}`;
  }
  if (/^[\d\s+\-().]+$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7) {
    return `tel:${trimmed.replace(/\s/g, "")}`;
  }
  return null;
}

function ApplicationCardContent({
  job,
  onEdit,
  onDelete,
  onSchedule,
  onReschedule,
  onUnschedule,
  onReview,
  isDragging,
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onReschedule?: () => void;
  onUnschedule?: () => void;
  onReview: () => void;
  isDragging?: boolean;
}) {
  const href = job.contact ? contactHref(job.contact) : null;
  const showScheduleActions = isSchedulableJobStatus(job.status);
  const currentStageSchedule = getStageSchedule(job, job.status);
  const scheduledStages = getScheduledStages(job);

  return (
    <article
      className={`rounded-xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-500/10 transition ${
        isDragging ? "opacity-60 shadow-lg" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900">{job.title}</h3>
          {job.company ? (
            <p className="mt-0.5 truncate text-sm text-slate-600">{job.company}</p>
          ) : null}
        </div>
        {job.matchAnalysis ? (
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            {job.matchAnalysis.finalScore}%
          </span>
        ) : null}
      </div>

      {job.notes ? (
        <p className="mt-3 line-clamp-3 text-sm text-slate-600">{job.notes}</p>
      ) : null}

      <dl className="mt-3 space-y-1 text-xs text-slate-500">
        {job.contact ? (
          <div>
            <dt className="sr-only">Contact</dt>
            <dd>
              {href ? (
                <a href={href} className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {job.contact}
                </a>
              ) : (
                job.contact
              )}
            </dd>
          </div>
        ) : null}
        {job.jobUrl ? (
          <div>
            <dt className="sr-only">Job posting</dt>
            <dd>
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View posting
              </a>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="sr-only">Applied</dt>
          <dd>Applied {formatDate(job.createdAt)}</dd>
        </div>
        {scheduledStages.map(({ status, schedule }) => (
          <div key={status}>
            <dt className="sr-only">{JOB_STATUS_LABELS[status]}</dt>
            <dd
              className={
                status === job.status
                  ? "font-medium text-indigo-700"
                  : "text-slate-500"
              }
            >
              {JOB_STATUS_LABELS[status]} · {formatDateTime(schedule.startAt)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReview();
          }}
          className="rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          {job.matchAnalysis ? "Review" : "Analyze"}
        </button>
        {showScheduleActions ? (
          currentStageSchedule ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReschedule?.();
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnschedule?.();
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                Unschedule
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSchedule?.();
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
            >
              Schedule
            </button>
          )
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function DraggableApplicationCard({
  job,
  onEdit,
  onDelete,
  onSchedule,
  onReschedule,
  onUnschedule,
  onReview,
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onReschedule?: () => void;
  onUnschedule?: () => void;
  onReview: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { job, status: job.status },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      <ApplicationCardContent
        job={job}
        onEdit={onEdit}
        onDelete={onDelete}
        onSchedule={onSchedule}
        onReschedule={onReschedule}
        onUnschedule={onUnschedule}
        onReview={onReview}
        isDragging={isDragging}
      />
    </div>
  );
}

function BoardColumn({
  status,
  jobs,
  onEdit,
  onDelete,
  onSchedule,
  onReschedule,
  onUnschedule,
  onReview,
}: {
  status: JobStatus;
  jobs: Job[];
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onSchedule: (job: Job) => void;
  onReschedule: (job: Job) => void;
  onUnschedule: (job: Job) => void;
  onReview: (job: Job) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-white/80 p-3 shadow-sm ring-1 transition ${
        isOver
          ? "border-indigo-300 ring-indigo-200"
          : "border-slate-200/80 ring-slate-200/60"
      }`}
    >
      <header className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-slate-800">{JOB_STATUS_LABELS[status]}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {jobs.length}
        </span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-3">
        {jobs.map((job) => (
          <DraggableApplicationCard
            key={job.id}
            job={job}
            onEdit={() => onEdit(job)}
            onDelete={() => onDelete(job)}
            onSchedule={() => onSchedule(job)}
            onReschedule={() => onReschedule(job)}
            onUnschedule={() => onUnschedule(job)}
            onReview={() => onReview(job)}
          />
        ))}
      </div>
    </section>
  );
}

function ScheduleModal({
  job,
  mode,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  job: Job;
  mode: "schedule" | "reschedule";
  onClose: () => void;
  onSubmit: (startAt: Date) => Promise<void>;
  submitting: boolean;
  error: string | null;
}) {
  const datetimeId = useId();
  const stageSchedule = getStageSchedule(job, job.status);
  const stageLabel = JOB_STATUS_LABELS[job.status];
  const initialDate =
    mode === "reschedule" && stageSchedule
      ? new Date(stageSchedule.startAt)
      : defaultTomorrowAt2pm();
  const [datetimeValue, setDatetimeValue] = useState(toDatetimeLocalValue(initialDate));
  const [localError, setLocalError] = useState<string | null>(null);

  const hint =
    mode === "reschedule"
      ? "If you already saved this interview in Google Calendar, delete the old event after adding the new one."
      : "You'll confirm the event in Google Calendar after clicking Save.";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const startAt = fromDatetimeLocalValue(datetimeValue);
    if (!startAt) {
      setLocalError("Please choose a valid date and time.");
      return;
    }
    if (startAt.getTime() <= Date.now()) {
      setLocalError("Please choose a future date and time.");
      return;
    }
    await onSubmit(startAt);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-indigo-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="schedule-form-title" className="text-lg font-semibold text-slate-900">
          {mode === "reschedule" ? `Reschedule ${stageLabel}` : `Schedule ${stageLabel}`}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{job.title}</p>

        <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit}>
          <div>
            <label htmlFor={datetimeId} className="mb-1 block text-sm font-medium text-slate-700">
              Date and time
            </label>
            <input
              id={datetimeId}
              type="datetime-local"
              value={datetimeValue}
              onChange={(e) => setDatetimeValue(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <p className="text-xs text-slate-500">{hint}</p>

          {localError || error ? (
            <p className="text-sm text-red-600">{localError ?? error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SkillChips({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "matched" | "missing" | "advantage";
}) {
  const palette =
    variant === "matched"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : variant === "missing"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-sky-200 bg-sky-50 text-sky-950";

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{label}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">None</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item} className={`rounded-full border px-3 py-1 text-sm ${palette}`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResumeReviewSection({ resume }: { resume: ParsedResume }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Resume analysis</h3>
          <p className="mt-1 text-sm text-slate-600">Candidate signals used for match scoring.</p>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
          Experience:{" "}
          <span className="font-semibold">
            {resume.parsed_metadata.years_of_experience_estimate ?? 0} years
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Professional summary</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {resume.professional_summary || "No professional summary was detected."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Technical skills
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {resume.skills.technical_skills.length > 0 ? (
                resume.skills.technical_skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-white px-2 py-1 text-xs text-slate-800">
                    {skill}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500">None</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tools
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {resume.skills.tools_and_software.length > 0 ? (
                resume.skills.tools_and_software.map((tool) => (
                  <span key={tool} className="rounded-full bg-white px-2 py-1 text-xs text-slate-800">
                    {tool}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500">None</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FitNote({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function EvidenceList({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Resume-aware detail the AI produces only when the user has a saved CV.
 * Renders nothing at all for older matches that have none of it.
 */
function ResumeFitDetails({ match }: { match: MatchAnalysis }) {
  const hasAny = Boolean(
    match.educationFit ||
      match.experienceFit ||
      match.projectFit ||
      match.languageFit ||
      match.resumeInsights?.length ||
      match.matchingEvidence?.length
  );
  if (!hasAny) return null;

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-indigo-100 bg-white/70 p-4">
      <p className="text-sm font-semibold text-indigo-950">How your CV lines up</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FitNote label="Experience" value={match.experienceFit} />
        <FitNote label="Education" value={match.educationFit} />
        <FitNote label="Projects" value={match.projectFit} />
        <FitNote label="Languages" value={match.languageFit} />
      </div>
      <EvidenceList label="Evidence from your CV" items={match.matchingEvidence} />
      <EvidenceList label="Suggestions" items={match.resumeInsights} />
    </div>
  );
}

function formatAttemptDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString();
}

/**
 * Prior interview attempts for this application, newest first, with the change
 * in score between consecutive attempts. The delta is computed here rather than
 * server-side — the list already carries everything it needs.
 */
function PracticeHistorySection({
  attempts,
  loading,
}: {
  attempts: PracticeSessionListItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Loading interview history...</p>
      </section>
    );
  }

  if (attempts.length === 0) return null;

  const scored = attempts.filter((attempt) => attempt.overallScore !== null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Interview attempts</h3>
      <ul className="mt-3 space-y-2">
        {attempts.map((attempt) => {
          const scoreIndex = scored.findIndex((item) => item.id === attempt.id);
          const previous = scoreIndex >= 0 ? scored[scoreIndex + 1] : undefined;
          const delta =
            attempt.overallScore !== null && previous?.overallScore != null
              ? attempt.overallScore - previous.overallScore
              : null;

          return (
            <li
              key={attempt.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium capitalize text-slate-800">
                  {attempt.interviewType}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">
                  {attempt.answeredCount}/{attempt.questionCount} answered
                </span>
                {attempt.status === "active" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    in progress
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-3">
                {attempt.overallScore !== null ? (
                  <span className="font-semibold tabular-nums text-slate-900">
                    {attempt.overallScore}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">no score yet</span>
                )}
                {delta !== null && delta !== 0 ? (
                  <span
                    className={
                      delta > 0
                        ? "text-xs font-semibold text-emerald-700"
                        : "text-xs font-semibold text-red-700"
                    }
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">
                  {formatAttemptDate(attempt.completedAt ?? attempt.createdAt)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TIER_STYLES: Record<SkillMatchTier, { label: string; className: string }> = {
  exact: {
    label: "exact",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  alias: {
    label: "alias",
    className: "border-teal-200 bg-teal-50 text-teal-800",
  },
  related: {
    label: "related",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  none: {
    label: "no match",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

const VISIBLE_DETAIL_ROWS = 8;

/**
 * Per-requirement breakdown of the deterministic score.
 *
 * Renders nothing for matches computed before graded scoring existed, so the
 * flat matched/missing lists remain the display for those.
 */
function MatchDetailsTable({ match }: { match: MatchAnalysis }) {
  const [showAll, setShowAll] = useState(false);
  const details = match.matchDetails ?? [];

  if (details.length === 0) return null;

  const visible = showAll ? details : details.slice(0, VISIBLE_DETAIL_ROWS);
  const skillCoverage =
    match.advantageBonus === undefined
      ? match.algorithmicScore
      : Math.max(0, match.algorithmicScore - match.advantageBonus);

  return (
    <div className="mt-6 rounded-xl border border-indigo-100 bg-white/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-indigo-950">
          How the skill score was reached
        </p>
        {match.scorableRequiredCount !== undefined ? (
          <p className="text-xs text-slate-500">
            {match.scorableRequiredCount} scored requirement
            {match.scorableRequiredCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Required</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">Your skill</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">Match</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Credit</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((detail) => {
              const tier = TIER_STYLES[detail.tier] ?? TIER_STYLES.none;
              return (
                <tr key={detail.required} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {detail.required}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {detail.matchedBy ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      title={detail.reason}
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tier.className}`}
                    >
                      {tier.label}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-700">
                    {detail.credit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {details.length > VISIBLE_DETAIL_ROWS ? (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-3 text-xs font-semibold text-indigo-700 hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${details.length} requirements`}
        </button>
      ) : null}

      <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <div className="flex justify-between gap-3">
          <dt>Skill coverage</dt>
          <dd className="tabular-nums">{skillCoverage}</dd>
        </div>
        {match.advantageBonus !== undefined ? (
          <div className="flex justify-between gap-3">
            <dt>Advantage bonus</dt>
            <dd className="tabular-nums">+{match.advantageBonus}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 font-semibold text-slate-800">
          <dt>Deterministic score</dt>
          <dd className="tabular-nums">{match.algorithmicScore}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Combined with the AI semantic score of {match.aiSemanticScore}</dt>
          <dd className="tabular-nums font-semibold text-slate-800">
            {match.finalScore}
          </dd>
        </div>
        {match.relatedShare !== undefined && match.relatedShare > 0 ? (
          <p className="pt-1 text-slate-500">
            {Math.round(match.relatedShare * 100)}% of the credit came from related
            skills rather than exact matches.
          </p>
        ) : null}
      </dl>
    </div>
  );
}

function MatchReviewSection({ match }: { match: MatchAnalysis }) {
  return (
    <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-700">Overall fit</p>
          <p className="text-4xl font-bold tracking-tight text-indigo-950">
            {match.finalScore}
            <span className="text-xl font-semibold text-indigo-300">/100</span>
          </p>
        </div>
        <p className="max-w-xl text-sm text-slate-600">{match.explanation}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Skill overlap
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{match.algorithmicScore}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            AI semantic score
          </p>
          <p className="mt-1 text-2xl font-semibold text-violet-900">{match.aiSemanticScore}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <SkillChips label="Matched required skills" items={match.matchedRequired} variant="matched" />
        <SkillChips label="Missing required skills" items={match.missingRequired} variant="missing" />
        <SkillChips label="Matched advantage skills" items={match.matchedAdvantage} variant="advantage" />
      </div>

      <MatchDetailsTable match={match} />
      <ResumeFitDetails match={match} />
    </section>
  );
}

function JobAnalysisReviewSection({ analysis }: { analysis: JobAnalysis }) {
  return (
    <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <h3 className="text-base font-semibold text-violet-950">Analyzed role</h3>
      <p className="mt-1 text-sm text-slate-600">{analysis.summary}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Title</dt>
          <dd className="text-slate-900">{analysis.roleTitle}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Seniority</dt>
          <dd className="capitalize text-slate-900">{analysis.seniorityLevel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Required skills</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {analysis.requiredSkills.map((skill) => (
              <span key={skill} className="rounded-md border border-indigo-100 bg-white px-2 py-0.5 text-indigo-950">
                {skill}
              </span>
            ))}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Advantage skills</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {analysis.advantageSkills.map((skill) => (
              <span key={skill} className="rounded-md border border-violet-100 bg-white px-2 py-0.5 text-violet-950">
                {skill}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function JobReviewModal({
  job,
  jobAnalysis,
  matchAnalysis,
  parsedResume,
  loading,
  error,
  onClose,
  onGoToProfile,
  onReanalyze,
  attempts,
  attemptsLoading,
}: {
  job: Job;
  jobAnalysis: JobAnalysis | null;
  matchAnalysis: MatchAnalysis | null;
  parsedResume: ParsedResume | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onGoToProfile: () => void;
  onReanalyze: () => void;
  attempts: PracticeSessionListItem[];
  attemptsLoading: boolean;
}) {
  const profileError = error?.toLowerCase().includes("profile") ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-indigo-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-review-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="job-review-title" className="text-xl font-semibold text-slate-900">
              Match review
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {job.title}
              {job.company ? ` at ${job.company}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button
              type="button"
              onClick={onReanalyze}
              disabled={loading}
              title="Discard the saved analysis and run it again"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Re-analyze"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-10">
            <StagedProgress
              active={loading}
              className="text-sm font-medium text-slate-700"
            />
            <div className="mt-4 rounded-full bg-slate-200 p-1">
              <div className="h-2 w-full animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-300" />
            </div>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            <p>{error}</p>
            {profileError ? (
              <button
                type="button"
                onClick={onGoToProfile}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Go to profile
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && jobAnalysis && matchAnalysis && parsedResume ? (
          <div className="mt-5 space-y-5">
            <ResumeReviewSection resume={parsedResume} />
            <MatchReviewSection match={matchAnalysis} />
            <JobAnalysisReviewSection analysis={jobAnalysis} />
            <PracticeHistorySection attempts={attempts} loading={attemptsLoading} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function JobFormModal({
  onClose,
  submitting,
  error,
  ...props
}: {
  onClose: () => void;
  submitting: boolean;
  error: string | null;
} & (
  | {
      mode: "create";
      initial?: undefined;
      onSubmit: (values: CreateJobInput) => Promise<void>;
    }
  | {
      mode: "edit";
      initial: Job;
      onSubmit: (values: UpdateJobInput) => Promise<void>;
    }
)) {
  const { mode, initial } = props;
  const titleId = useId();
  const companyId = useId();
  const descriptionId = useId();
  const notesId = useId();
  const contactId = useId();
  const jobUrlId = useId();
  const statusId = useId();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [jobUrl, setJobUrl] = useState(initial?.jobUrl ?? "");
  // Nudge only when the user clearly expected the URL to do the work: a link is
  // present but the description is barely more than an intro paragraph. Advisory
  // only — it never blocks submitting.
  const showShortDescriptionHint =
    jobUrl.trim() !== "" && description.trim().length > 0 && description.trim().length < 400;
  const [status, setStatus] = useState<JobStatus>(initial?.status ?? "applied");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setLocalError("Job description is required.");
      return;
    }

    if (mode === "create") {
      await props.onSubmit({
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        description: trimmedDescription,
        notes: notes.trim() || undefined,
        contact: contact.trim() || undefined,
        jobUrl: jobUrl.trim() || undefined,
        status,
      });
      return;
    }

    await props.onSubmit({
      title: title.trim() || undefined,
      company: company.trim(),
      description: trimmedDescription,
      notes: notes.trim(),
      contact: contact.trim(),
      jobUrl: jobUrl.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-indigo-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="job-form-title" className="text-lg font-semibold text-slate-900">
          {mode === "create" ? "Add application" : "Edit application"}
        </h2>

        <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit}>
          <div>
            <label htmlFor={titleId} className="mb-1 block text-sm font-medium text-slate-700">
              Job title
            </label>
            <input
              id={titleId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Frontend Engineer"
            />
          </div>

          <div>
            <label htmlFor={companyId} className="mb-1 block text-sm font-medium text-slate-700">
              Company
            </label>
            <input
              id={companyId}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label htmlFor={descriptionId} className="mb-1 block text-sm font-medium text-slate-700">
              Job description
            </label>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Paste the full job description — this is the only text the AI analyses."
            />
            {showShortDescriptionHint ? (
              <p className="mt-1 text-xs text-amber-700">
                This description is short. Match quality depends on pasting the full
                posting, not just the intro paragraph.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={notesId} className="mb-1 block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="Follow-up dates, interview feedback..."
            />
          </div>

          <div>
            <label htmlFor={contactId} className="mb-1 block text-sm font-medium text-slate-700">
              Contact
            </label>
            <input
              id={contactId}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="recruiter@company.com"
            />
          </div>

          <div>
            <label htmlFor={jobUrlId} className="mb-1 block text-sm font-medium text-slate-700">
              Job posting URL
            </label>
            <input
              id={jobUrlId}
              type="text"
              inputMode="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="https://..."
            />
            <p className="mt-1 text-xs text-slate-500">
              Stored as a reference link only. HiredMe does not read the job
              description from this URL — paste it above.
            </p>
          </div>

          {mode === "create" ? (
            <div>
              <label htmlFor={statusId} className="mb-1 block text-sm font-medium text-slate-700">
                Stage
              </label>
              <select
                id={statusId}
                value={status}
                onChange={(e) => setStatus(e.target.value as JobStatus)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {JOB_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {JOB_STATUS_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {localError || error ? (
            <p className="text-sm text-red-600">{localError ?? error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
            >
              {submitting ? "Saving..." : mode === "create" ? "Add application" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ApplicationsBoardPage() {
  const navigate = useNavigate();
  const session = getAuthSession();
  const authToken = session?.token ?? null;

  const [board, setBoard] = useState<JobsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [schedulingJob, setSchedulingJob] = useState<Job | null>(null);
  const [scheduleMode, setScheduleMode] = useState<"schedule" | "reschedule">("schedule");
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [reviewJob, setReviewJob] = useState<Job | null>(null);
  const [reviewJobAnalysis, setReviewJobAnalysis] = useState<JobAnalysis | null>(null);
  const [reviewMatchAnalysis, setReviewMatchAnalysis] = useState<MatchAnalysis | null>(null);
  const [reviewParsedResume, setReviewParsedResume] = useState<ParsedResume | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewAttempts, setReviewAttempts] = useState<PracticeSessionListItem[]>([]);
  const [reviewAttemptsLoading, setReviewAttemptsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJobsBoard();
      setBoard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    void loadBoard();
  }, [authToken, loadBoard]);

  function resolveDropStatus(overId: string | number): JobStatus | null {
    if (!board) {
      return null;
    }
    if (JOB_STATUSES.includes(overId as JobStatus)) {
      return overId as JobStatus;
    }
    return findColumnForJob(board, String(overId));
  }

  function onDragStart(event: DragStartEvent) {
    const job = event.active.data.current?.job as Job | undefined;
    if (job) {
      setActiveJob(job);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveJob(null);
    const { active, over } = event;
    if (!over || !board) {
      return;
    }

    const jobId = String(active.id);
    const fromStatus = findColumnForJob(board, jobId);
    const toStatus = resolveDropStatus(over.id);
    if (!fromStatus || !toStatus || fromStatus === toStatus) {
      return;
    }

    const previous = board;
    setBoard(moveJobInBoard(board, jobId, fromStatus, toStatus));
    setError(null);

    updateJobStatus(jobId, toStatus).catch(() => {
      setBoard(previous);
      setError("Failed to move application. Changes were reverted.");
    });
  }

  async function handleCreate(values: CreateJobInput) {
    setSubmitting(true);
    setFormError(null);
    try {
      const job = await createJob(values);
      setBoard((current) => addJobToBoard(current ?? emptyBoard(), job));
      setModal(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create application.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values: UpdateJobInput) {
    if (!editingJob) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await updateJob(editingJob.id, values);
      setBoard((current) => replaceJobInBoard(current ?? emptyBoard(), updated));
      setModal(null);
      setEditingJob(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update application.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(job: Job) {
    if (!window.confirm(`Delete "${job.title}"?`)) {
      return;
    }
    const previous = board;
    setBoard((current) => removeJobFromBoard(current ?? emptyBoard(), job.id));
    setError(null);
    try {
      await deleteJob(job.id);
    } catch (err) {
      setBoard(previous);
      setError(err instanceof Error ? err.message : "Failed to delete application.");
    }
  }

  function openScheduleModal(job: Job, mode: "schedule" | "reschedule") {
    setScheduleError(null);
    setSchedulingJob(job);
    setScheduleMode(mode);
  }

  async function handleScheduleSave(startAt: Date) {
    if (!schedulingJob) {
      return;
    }
    setSubmitting(true);
    setScheduleError(null);
    try {
      const updated = await scheduleJobApi(schedulingJob.id, startAt.toISOString());
      setBoard((current) => replaceJobInBoard(current ?? emptyBoard(), updated));
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const url = buildGoogleCalendarTemplateUrl({
        title: buildInterviewCalendarTitle({
          title: updated.title,
          company: updated.company,
          stageLabel: JOB_STATUS_LABELS[updated.status],
        }),
        startAt,
        endAt,
      });
      openGoogleCalendarEvent(url);
      setSchedulingJob(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to schedule interview.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnschedule(job: Job) {
    const confirmed = window.confirm(
      "Remove this interview schedule from HiredMe?\n\nThis removes the schedule from HiredMe only. Delete the event manually in Google Calendar if you added it there."
    );
    if (!confirmed) {
      return;
    }
    const previous = board;
    setBoard((current) =>
      replaceJobInBoard(current ?? emptyBoard(), {
        ...job,
        stageSchedules: {
          ...job.stageSchedules,
          [job.status]: null,
        },
      })
    );
    setError(null);
    try {
      const updated = await unscheduleJobApi(job.id);
      setBoard((current) => replaceJobInBoard(current ?? emptyBoard(), updated));
    } catch (err) {
      setBoard(previous);
      setError(err instanceof Error ? err.message : "Failed to unschedule interview.");
    }
  }

  /**
   * Runs the match for a job and shows the result.
   *
   * `force` bypasses the server-side analysis cache. Without it a job whose
   * description has not changed always returns the analysis it was given the
   * first time, so an application analyzed before a scoring change can never
   * pick the new one up.
   */
  async function handleReview(job: Job, options: { force?: boolean } = {}) {
    setReviewJob(job);
    setReviewJobAnalysis(job.jobAnalysis);
    setReviewMatchAnalysis(job.matchAnalysis);
    setReviewParsedResume(null);
    setReviewError(null);
    setReviewLoading(true);
    // Prior attempts are independent of the analysis, so a failure to load them
    // must not surface as a match error.
    setReviewAttemptsLoading(true);
    void listPracticeSessions({ jobId: job.id })
      .then((result) => setReviewAttempts(result.sessions))
      .catch(() => setReviewAttempts([]))
      .finally(() => setReviewAttemptsLoading(false));
    try {
      const result = await analyzeSavedJob(job.id, { force: options.force ?? false });
      setReviewJob(result.job);
      setReviewJobAnalysis(result.jobAnalysis);
      setReviewMatchAnalysis(result.matchAnalysis);
      setReviewParsedResume(result.parsedResume);
      setBoard((current) => replaceJobInBoard(current ?? emptyBoard(), result.job));
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to analyze application.");
    } finally {
      setReviewLoading(false);
    }
  }

  function closeReviewModal() {
    setReviewJob(null);
    setReviewAttempts([]);
    setReviewAttemptsLoading(false);
    setReviewJobAnalysis(null);
    setReviewMatchAnalysis(null);
    setReviewParsedResume(null);
    setReviewError(null);
    setReviewLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
      <div className="mx-auto max-w-[100vw] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Applications
              </span>
            </h1>
            <p className="mt-2 text-slate-600">
              Track every job you apply to across the hiring pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setModal("create");
            }}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:from-indigo-500 hover:to-violet-500"
          >
            Add application
          </button>
        </header>

        {error ? (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">Loading your applications...</p>
        ) : board ? (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {JOB_STATUSES.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  jobs={board[status]}
                  onEdit={(job) => {
                    setEditingJob(job);
                    setFormError(null);
                    setModal("edit");
                  }}
                  onDelete={handleDelete}
                  onSchedule={(job) => openScheduleModal(job, "schedule")}
                  onReschedule={(job) => openScheduleModal(job, "reschedule")}
                  onUnschedule={handleUnschedule}
                  onReview={(job) => void handleReview(job)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeJob ? (
                <div className="w-72 rotate-2 cursor-grabbing">
                  <ApplicationCardContent
                    job={activeJob}
                    onEdit={() => undefined}
                    onDelete={() => undefined}
                    onReview={() => undefined}
                    isDragging
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : null}

        {!loading && !board && !error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-600">No applications yet.</p>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setModal("create");
              }}
              className="mt-4 text-sm font-medium text-indigo-600 hover:underline"
            >
              Add your first application
            </button>
          </div>
        ) : null}
      </div>

      {modal === "create" ? (
        <JobFormModal
          mode="create"
          onClose={() => setModal(null)}
          onSubmit={handleCreate}
          submitting={submitting}
          error={formError}
        />
      ) : null}

      {modal === "edit" && editingJob ? (
        <JobFormModal
          key={editingJob.id}
          mode="edit"
          initial={editingJob}
          onClose={() => {
            setModal(null);
            setEditingJob(null);
          }}
          onSubmit={handleEdit}
          submitting={submitting}
          error={formError}
        />
      ) : null}

      {schedulingJob ? (
        <ScheduleModal
          key={`${schedulingJob.id}-${scheduleMode}`}
          job={schedulingJob}
          mode={scheduleMode}
          onClose={() => {
            setSchedulingJob(null);
            setScheduleError(null);
          }}
          onSubmit={handleScheduleSave}
          submitting={submitting}
          error={scheduleError}
        />
      ) : null}

      {reviewJob ? (
        <JobReviewModal
          job={reviewJob}
          jobAnalysis={reviewJobAnalysis}
          matchAnalysis={reviewMatchAnalysis}
          parsedResume={reviewParsedResume}
          loading={reviewLoading}
          error={reviewError}
          onClose={closeReviewModal}
          onGoToProfile={() => {
            closeReviewModal();
            navigate("/profile");
          }}
          onReanalyze={() => void handleReview(reviewJob, { force: true })}
          attempts={reviewAttempts}
          attemptsLoading={reviewAttemptsLoading}
        />
      ) : null}
    </div>
  );
}
