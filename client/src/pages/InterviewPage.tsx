import { type FormEvent, useId, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type {
  AnswerEvaluation,
  InterviewQuestion,
  InterviewAttemptSummary,
  InterviewType,
} from "../types/interview";
import { fetchJobsBoard } from "../services/jobs";
import {
  createPracticeSession,
  sendPracticeMessage,
  getPracticeSummary,
  regeneratePracticeQuestions,
} from "../services/practice";
import { getUserProfile } from "../services/profile";
import type { Job } from "../types/jobs";
import type { ParsedResume } from "../types/parsedResume";

function ScoreBar({
  label,
  value,
  valueClassName,
  barClassName,
}: {
  label: string;
  value: number;
  valueClassName: string;
  barClassName: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className={`tabular-nums font-semibold ${valueClassName}`}>
          {clamped}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200/90"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} score`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barClassName}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function ReviewPanel({
  evaluation,
  expectedFocus,
}: {
  evaluation: AnswerEvaluation;
  expectedFocus: string;
}) {
  return (
    <div className="mt-6 space-y-6 border-t border-indigo-100 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600/90">
            Interview review
          </p>
          <p className="text-5xl font-bold tracking-tight text-indigo-900">
            {evaluation.score}
            <span className="text-2xl font-semibold text-indigo-300">/100</span>
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ScoreBar
          label="Clarity"
          value={evaluation.clarity}
          valueClassName="text-emerald-800"
          barClassName="bg-emerald-500"
        />
        <ScoreBar
          label="Correctness"
          value={evaluation.correctness}
          valueClassName="text-violet-800"
          barClassName="bg-violet-500"
        />
        <ScoreBar
          label="Depth"
          value={evaluation.depth}
          valueClassName="text-amber-800"
          barClassName="bg-amber-500"
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-indigo-900">Feedback</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {evaluation.feedback}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-indigo-900">
          Improvement tips
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {evaluation.improvementTips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What strong answers address
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {expectedFocus}
        </p>
      </div>
    </div>
  );
}

function SummaryPanel({
  summary,
  loading,
}: {
  summary: InterviewAttemptSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-8 rounded-2xl border border-indigo-100 bg-white p-6 text-center">
        <p className="text-sm text-slate-600">Generating your summary...</p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-8 space-y-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-6 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/10">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 px-4 py-2">
            <p className="text-2xl font-bold text-emerald-800">
              {summary.overallScore}
              <span className="text-lg font-semibold text-emerald-600">/100</span>
            </p>
          </div>
          <h2 className="text-2xl font-bold text-emerald-900">Your Results</h2>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Overall Summary</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {summary.summary}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-emerald-900">Strengths - Keep It Up!</h3>
          <ul className="mt-3 space-y-2">
            {summary.preserve_points.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-emerald-600">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-amber-900">Areas to Improve</h3>
          <ul className="mt-3 space-y-2">
            {summary.improve_points.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-amber-600">→</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Topics Covered</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {summary.topics_covered.map((topic, i) => (
            <span
              key={i}
              className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Additional Feedback</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {summary.overall_feedback}
        </p>
      </div>
    </div>
  );
}

export function InterviewPage() {
  const formId = useId();

    const [jobs, setJobs] = useState<Job[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [interviewType, setInterviewType] = useState<InterviewType>("technical");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startingPractice, setStartingPractice] = useState(false);
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<ParsedResume | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<InterviewAttemptSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const summaryFetchedRef = useRef(false);
  // Ids the user has already answered this session, so regeneration can land on
  // the first genuinely new question.
  const answeredIdsRef = useRef<Set<string>>(new Set());

  const total = questions.length;
  const progressLabel = `Question ${step + 1} of ${total}`;
  const answerFieldId = `${formId}-answer`;
  const selectedJob = selectedJobId
    ? jobs?.find((job) => job.id === selectedJobId) ?? null
    : null;
  const current = questions[step];

  /**
   * Asks the server for a different set of unanswered questions. Answered
   * questions stay where they are, so the step index is moved to the first
   * replacement rather than reset.
   */
  async function onRegenerate() {
    if (!practiceSessionId || regenerating || loading) return;

    setRegenerating(true);
    setRegenerateError(null);
    try {
      const result = await regeneratePracticeQuestions(practiceSessionId);
      setQuestions(result.questions);
      setDraft("");
      setSubmittedAnswer(null);
      setEvaluation(null);
      const firstReplacement = result.questions.findIndex(
        (question) => !answeredIdsRef.current.has(question.id)
      );
      setStep(firstReplacement === -1 ? 0 : firstReplacement);
    } catch (err) {
      setRegenerateError(
        err instanceof Error ? err.message : "Failed to regenerate questions."
      );
    } finally {
      setRegenerating(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading || !practiceSessionId || !current) return;

    setLoading(true);
    setEvaluation(null);
    try {
      const result = await sendPracticeMessage(
        practiceSessionId,
        current.id,
        text
      );
      setSubmittedAnswer(text);
      setEvaluation(result.evaluation);
      answeredIdsRef.current.add(current.id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setJobsLoading(true);
      setJobsError(null);
      try {
        const board = await fetchJobsBoard();
        if (!mounted) return;
        const list = Object.values(board).flat();
        setJobs(list);
      } catch (err) {
        if (!mounted) return;
        setJobsError(err instanceof Error ? err.message : String(err));
        setJobs([]);
      } finally {
        if (!mounted) return;
        setJobsLoading(false);
      }
    }

    load();

    async function loadProfile() {
      try {
        const profile = await getUserProfile();
        if (!mounted) return;
        setUserProfile(profile.profile);
      } catch {
        // Keep going without profile, backend can still use jobId.
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  function goNext() {
    if (step >= total - 1) return;
    setStep((s) => s + 1);
    setDraft("");
    setSubmittedAnswer(null);
    setEvaluation(null);
  }

  function restartFromBeginning() {
    if (loading) return;
    setStep(0);
    setDraft("");
    setSubmittedAnswer(null);
    setEvaluation(null);
    setLoading(false);
    setSummary(null);
    setSummaryError(null);
    summaryFetchedRef.current = false;
  }

  async function startPractice() {
    if (startingPractice) return;
    // An HR interview is about the candidate, so it can run without a job.
    // A technical interview still needs one to scope the questions.
    const jobIdToUse = pendingJobId ?? undefined;
    if (interviewType === "technical" && !jobIdToUse) return;

    setSessionError(null);
    setStartingPractice(true);
    try {
      const profileSkills = userProfile
        ? Array.from(
            new Set([
              ...(userProfile.skills.technical_skills ?? []),
              ...(userProfile.skills.soft_skills ?? []),
              ...(userProfile.skills.tools_and_software ?? []),
            ])
          )
        : undefined;
      const language = userProfile?.parsed_metadata.language_detected === "he" ? "he" : "en";

      const session = await createPracticeSession({
        interviewType,
        ...(jobIdToUse ? { jobId: jobIdToUse } : {}),
        count: 5,
        profileSkills,
        language,
      });
      setQuestions(session.questions);
      setPracticeSessionId(session._id);
      setSelectedJobId(jobIdToUse ?? null);
      setStep(0);
      setDraft("");
      setSubmittedAnswer(null);
      setEvaluation(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Failed to create practice session.");
    } finally {
      setStartingPractice(false);
    }
  }

  const isComplete = step >= total - 1 && evaluation !== null;
  const canSubmit =
    draft.trim().length > 0 && !loading && evaluation === null;

  useEffect(() => {
    if (isComplete && !summaryFetchedRef.current && practiceSessionId) {
      summaryFetchedRef.current = true;
      setSummaryLoading(true);
      getPracticeSummary(practiceSessionId)
        .then(setSummary)
        .catch((err) => {
          console.error("Failed to load summary:", err);
          setSummaryError(err instanceof Error ? err.message : "Failed to load summary");
        })
        .finally(() => setSummaryLoading(false));
    }
  }, [isComplete, practiceSessionId]);

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/40">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Application selector: require user to pick an application before practicing */}
        {!practiceSessionId && (
          <section className="mb-8 rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Start a practice interview</h3>
            <p className="mt-2 text-sm text-slate-600">
              {interviewType === "technical"
                ? "Choose one of your saved applications so the questions can be tailored to that role."
                : "HR questions are based on your saved CV. Pick an application if you want, or start without one."}
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Interview type">
              {(
                [
                  ["technical", "Technical"],
                  ["hr", "HR"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setInterviewType(value);
                    setSessionError(null);
                  }}
                  aria-pressed={interviewType === value}
                  className={
                    interviewType === value
                      ? "rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {jobsLoading ? (
                <p className="text-sm text-slate-500">Loading your applications...</p>
              ) : jobsError ? (
                <p className="text-sm text-red-600">{jobsError}</p>
              ) : jobs && jobs.length > 0 ? (
                <>
                  <div className="flex items-center gap-3">
                    <select
                    value={pendingJobId ?? ""}
                    onChange={(e) => setPendingJobId(e.target.value || null)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">
                      {interviewType === "hr"
                        ? "-- no application (CV only) --"
                        : "-- pick an application --"}
                    </option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.company ? `${j.company} — ${j.title}` : j.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={startPractice}
                    disabled={
                      startingPractice || (interviewType === "technical" && !pendingJobId)
                    }
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {startingPractice ? "Starting…" : "Start practice"}
                  </button>
                </div>
                  {sessionError ? (
                    <p className="mt-3 text-sm text-red-600">{sessionError}</p>
                  ) : null}
                </>
              ) : (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-slate-600">No applications found.</p>
                    <Link to="/applications" className="text-sm font-semibold text-indigo-700">Go to Applications</Link>
                  </div>
                  {/* An HR interview only needs a CV, so it stays available here. */}
                  {interviewType === "hr" ? (
                    <>
                      <button
                        type="button"
                        onClick={startPractice}
                        disabled={startingPractice}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {startingPractice ? "Starting…" : "Start HR practice"}
                      </button>
                      {sessionError ? (
                        <p className="text-sm text-red-600">{sessionError}</p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        )}
        {practiceSessionId && (
          <>
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                    Interview practice
                  </span>
                </h1>
                <p className="mt-3 max-w-2xl text-lg text-slate-600">
                  Answer each question in your own words. After you submit, you will
                  see feedback evaluated by AI based on your answer.
                </p>
              </div>
              <button
                type="button"
                onClick={restartFromBeginning}
                disabled={loading}
                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finish test
              </button>
            </header>

            <div className="mb-6">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-medium text-slate-600">{progressLabel}</span>
                  {selectedJob ? (
                    <p className="text-sm text-slate-500">Practicing for {selectedJob.company ? `${selectedJob.company} — ` : ""}{selectedJob.title}</p>
                  ) : null}
                </div>
                <span className="text-slate-500">
                  {Math.round(((step + 1) / total) * 100)}%
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-200/90"
                role="progressbar"
                aria-valuenow={step + 1}
                aria-valuemin={1}
                aria-valuemax={total}
                aria-label={progressLabel}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300"
                  style={{
                    width: `${((step + 1) / total) * 100}%`,
                  }}
                />
              </div>
            </div>

            {current ? (
            <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-6 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/10 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800">
              {current.topic}
            </span>
            <button
              type="button"
              onClick={() => void onRegenerate()}
              disabled={regenerating || loading}
              title="Replace the questions you have not answered yet"
              className="rounded-xl border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerating ? "Regenerating…" : "New questions"}
            </button>
          </div>
          {regenerateError ? (
            <p className="mt-3 text-sm text-red-600">{regenerateError}</p>
          ) : null}
          <h2 className="mt-4 text-lg font-semibold leading-snug text-slate-900">
            {current.question}
          </h2>

          <form className="mt-6" onSubmit={onSubmit}>
            <label
              htmlFor={answerFieldId}
              className="sr-only"
            >
              Your answer for: {current.question}
            </label>
            <textarea
              id={answerFieldId}
              name="answer"
              rows={8}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={evaluation !== null}
              placeholder="Type your answer here…"
              className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-inner shadow-slate-900/5 outline-none ring-indigo-300/50 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-600"
            />

            {submittedAnswer !== null && evaluation !== null && (
              <p className="mt-3 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Your answer</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="line-clamp-3">{submittedAnswer}</span>
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Reviewing…" : "Submit answer"}
              </button>
              {evaluation !== null && step < total - 1 && (
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50"
                >
                  Next question
                </button>
              )}
            </div>
          </form>

          {evaluation !== null && (
            <ReviewPanel
              evaluation={evaluation}
              expectedFocus={current.expectedFocus}
            />
          )}

          {isComplete && (
            <>
              <SummaryPanel summary={summary} loading={summaryLoading} />
              {summaryError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">
                    <span className="font-semibold">Error loading summary:</span> {summaryError}
                  </p>
                </div>
              )}
              <p className="mt-8 text-center text-sm font-medium text-emerald-800">
                Use{" "}
                <span className="font-semibold">Finish test</span> above to start
                again from question 1.
              </p>
            </>
          )}
            </section>
            ) : (
              <div className="rounded-2xl border border-indigo-100 bg-white p-6 text-center">
                <p className="text-sm text-slate-600">Loading questions...</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
