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
import { getAuthSession } from "../services/auth";
import {
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
  type CreateJobInput,
  type Job,
  type JobStatus,
  type JobsBoard,
  type UpdateJobInput,
} from "../types/jobs";

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
  isDragging,
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onReschedule?: () => void;
  onUnschedule?: () => void;
  isDragging?: boolean;
}) {
  const href = job.contact ? contactHref(job.contact) : null;
  const showScheduleActions = job.status === "technical";

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
        {job.scheduledInterview ? (
          <div>
            <dt className="sr-only">Scheduled interview</dt>
            <dd className="font-medium text-indigo-700">
              Scheduled {formatDateTime(job.scheduledInterview.startAt)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {showScheduleActions ? (
          job.scheduledInterview ? (
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
}: {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
  onSchedule?: () => void;
  onReschedule?: () => void;
  onUnschedule?: () => void;
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
}: {
  status: JobStatus;
  jobs: Job[];
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onSchedule: (job: Job) => void;
  onReschedule: (job: Job) => void;
  onUnschedule: (job: Job) => void;
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
  const initialDate =
    mode === "reschedule" && job.scheduledInterview
      ? new Date(job.scheduledInterview.startAt)
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
          {mode === "reschedule" ? "Reschedule interview" : "Schedule interview"}
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
              placeholder="Paste the job description..."
            />
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
        title: buildInterviewCalendarTitle(updated),
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
      replaceJobInBoard(current ?? emptyBoard(), { ...job, scheduledInterview: null })
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
              onClick={() => navigate("/match")}
              className="mt-4 text-sm font-medium text-indigo-600 hover:underline"
            >
              Analyze a job on Match first
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
    </div>
  );
}
