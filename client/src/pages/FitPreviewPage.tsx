import { type FormEvent, useId, useState } from "react";
import {
  analyzeFitPreview,
  type AnalyzeFitPreviewResult,
} from "../services/fitAnalysis";
import type { JobAnalysis, MatchAnalysis } from "../types/matching";

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXT_OK = /\.(pdf|docx?)$/i;

function validateResumeFile(file: File | null): string | null {
  if (!file || file.size === 0) {
    return "Upload a resume file (PDF or Word).";
  }
  if (!EXT_OK.test(file.name)) {
    return "Use a PDF, .doc, or .docx file.";
  }
  return null;
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
          {items.map((s) => (
            <li
              key={s}
              className={`rounded-full border px-3 py-1 text-sm ${palette}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobAnalysis }) {
  return (
    <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/40 p-6 shadow-md shadow-violet-500/5 ring-1 ring-violet-500/10">
      <h2 className="text-lg font-semibold text-violet-950">Analyzed role</h2>
      <p className="mt-1 text-sm text-slate-600">{job.summary}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Title</dt>
          <dd className="text-slate-900">{job.roleTitle}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Seniority</dt>
          <dd className="capitalize text-slate-900">{job.seniorityLevel}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Required skills</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {job.requiredSkills.map((s) => (
              <span
                key={s}
                className="rounded-md border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-indigo-950"
              >
                {s}
              </span>
            ))}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Advantage skills</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {job.advantageSkills.map((s) => (
              <span
                key={s}
                className="rounded-md border border-violet-100 bg-violet-50/80 px-2 py-0.5 text-violet-950"
              >
                {s}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MatchSection({ match }: { match: MatchAnalysis }) {
  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50 p-6 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600/90">Overall fit</p>
          <p className="text-5xl font-bold tracking-tight text-indigo-900">
            {match.finalScore}
            <span className="text-2xl font-semibold text-indigo-300">/100</span>
          </p>
        </div>
        <p className="max-w-xl text-sm text-slate-600">
          Final score blends{" "}
          <strong className="font-semibold text-emerald-800">70%</strong> skill
          overlap and{" "}
          <strong className="font-semibold text-violet-800">30%</strong> AI
          semantic match.
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700/80">
            Skill overlap
          </p>
          <p className="mt-1 text-3xl font-semibold text-emerald-900">
            {match.algorithmicScore}
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/80">
            AI semantic score
          </p>
          <p className="mt-1 text-3xl font-semibold text-violet-900">
            {match.aiSemanticScore}
          </p>
        </div>
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <SkillChips
          label="Matched required skills"
          items={match.matchedRequired}
          variant="matched"
        />
        <SkillChips
          label="Missing required skills"
          items={match.missingRequired}
          variant="missing"
        />
        <SkillChips
          label="Matched advantage skills"
          items={match.matchedAdvantage}
          variant="advantage"
        />
      </div>
      <div className="mt-8 border-t border-indigo-100 pt-6">
        <h3 className="text-sm font-semibold text-indigo-900">Explanation</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          {match.explanation}
        </p>
      </div>
    </section>
  );
}

export function FitPreviewPage() {
  const formId = useId();
  const jobId = `${formId}-job`;
  const fileId = `${formId}-file`;

  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeFitPreviewResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setJobError(null);
    setFileError(null);

    const trimmed = jobDescription.trim();
    if (!trimmed) {
      setJobError("Enter a job description.");
      return;
    }

    const ferr = validateResumeFile(resumeFile);
    if (ferr) {
      setFileError(ferr);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await analyzeFitPreview({
        jobDescription: trimmed,
        resumeFile: resumeFile as File,
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function onFileChange(list: FileList | null) {
    setFileError(null);
    const file = list?.[0] ?? null;
    setResumeFile(file);
    if (file) {
      const ferr = validateResumeFile(file);
      if (ferr) setFileError(ferr);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Resume &{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              job fit
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Upload your resume and paste the role you are targeting.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/10 backdrop-blur-sm"
          noValidate
        >
          <div className="space-y-6">
            <div>
              <label
                htmlFor={jobId}
                className="block text-sm font-semibold text-slate-800"
              >
                Job description
              </label>
              <p className="mt-1 text-sm text-slate-500">
                Paste the job post or your target role summary.
              </p>
              <textarea
                id={jobId}
                name="jobDescription"
                rows={8}
                value={jobDescription}
                onChange={(e) => {
                  setJobDescription(e.target.value);
                  setJobError(null);
                }}
                className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="e.g. Junior full-stack developer, React, Node, MongoDB..."
                disabled={loading}
              />
              {jobError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {jobError}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor={fileId}
                className="block text-sm font-semibold text-slate-800"
              >
                Resume
              </label>
              <p className="mt-1 text-sm text-slate-500">
                PDF or Word (.doc, .docx).
              </p>
              <input
                id={fileId}
                name="resume"
                type="file"
                accept={ACCEPT}
                onChange={(e) => onFileChange(e.target.files)}
                disabled={loading}
                className="mt-3 block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-500 disabled:opacity-50"
              />
              {resumeFile ? (
                <p className="mt-2 text-sm text-slate-600">
                  Selected:{" "}
                  <span className="font-medium">{resumeFile.name}</span>
                </p>
              ) : null}
              {fileError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {fileError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-w-[9rem] items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Analyzing…" : "Analyze fit"}
            </button>
          </div>
        </form>

        {result ? (
          <div className="mt-10 space-y-8">
            <MatchSection match={result.match} />
            <JobCard job={result.job} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
