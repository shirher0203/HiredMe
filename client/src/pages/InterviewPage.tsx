import { type FormEvent, useId, useState } from "react";
import {
  evaluateAnswerStatic,
  staticInterviewQuestions,
} from "../mocks/interview";
import type { AnswerEvaluation } from "../types/interview";

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

export function InterviewPage() {
  const formId = useId();
  const questions = staticInterviewQuestions;
  const total = questions.length;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const current = questions[step];
  const progressLabel = `Question ${step + 1} of ${total}`;
  const answerFieldId = `${formId}-answer`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || loading) return;

    setLoading(true);
    setEvaluation(null);
    try {
      const result = await evaluateAnswerStatic(current.id, text);
      setSubmittedAnswer(text);
      setEvaluation(result);
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (step >= total - 1) return;
    setStep((s) => s + 1);
    setDraft("");
    setSubmittedAnswer(null);
    setEvaluation(null);
  }

  const isComplete = step >= total - 1 && evaluation !== null;
  const canSubmit =
    draft.trim().length > 0 && !loading && evaluation === null;

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/40">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Interview practice
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Answer each question in your own words. After you submit, you will
            see feedback shaped like the live AI evaluation (static demo—no
            backend yet).
          </p>
        </header>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-600">{progressLabel}</span>
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

        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 p-6 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/10 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800">
              {current.topic}
            </span>
          </div>
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
            <p className="mt-8 text-center text-sm font-medium text-emerald-800">
              You have finished this practice set. Refresh the page to start
              over.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
