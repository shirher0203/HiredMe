import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  analyzeFitPreview,
  type AnalyzeFitPreviewResult,
} from "../services/fitAnalysis";
import type { JobAnalysis, MatchAnalysis } from "../types/matching";
import type { ParsedResume } from "../types/parsedResume";

const ACCEPT = ".pdf,application/pdf";
const EXT_OK = /\.pdf$/i;

function validateResumeFile(file: File | null): string | null {
  if (!file || file.size === 0) {
    return "Upload a resume file (PDF).";
  }
  if (!EXT_OK.test(file.name)) {
    return "Use a PDF file.";
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
    </section>
  );
}

function ResumeSection({ resume }: { resume: ParsedResume }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm shadow-slate-300/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Resume analysis</h2>
          <p className="mt-1 text-sm text-slate-600">
            Parsed resume details and the candidate signals used for match scoring.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Experience estimate: <span className="font-semibold">{resume.parsed_metadata.years_of_experience_estimate ?? 0} years</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Professional summary</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {resume.professional_summary || "No professional summary was detected."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technical skills</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resume.skills.technical_skills.length > 0 ? (
                  resume.skills.technical_skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-800">
                      {skill}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">None</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tools & software</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {resume.skills.tools_and_software.length > 0 ? (
                  resume.skills.tools_and_software.map((tool) => (
                    <span key={tool} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-800">
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

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Education</p>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              {resume.education.length > 0 ? (
                resume.education.slice(0, 3).map((item, index) => (
                  <div key={`${item.institution_name}-${index}`}>
                    <p className="font-semibold text-slate-900">
                      {item.degree_type || item.field_of_study || "Education"}
                    </p>
                    <p>{item.institution_name || "Unknown institution"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No education details were detected.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top projects</p>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              {resume.projects.length > 0 ? (
                resume.projects.slice(0, 3).map((project, index) => (
                  <div key={`${project.project_name}-${index}`}>
                    <p className="font-semibold text-slate-900">{project.project_name || "Project"}</p>
                    <p>{project.technologies_used.join(", ") || "No technologies listed."}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No project details were detected.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FitPreviewPage() {
  const formId = useId();
  const jobId = `${formId}-job`;
  const fileId = `${formId}-file`;

  const navigate = useNavigate();
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    try {
      const data = await analyzeFitPreview({
        jobDescription: trimmed,
        resumeFile: resumeFile as File,
      });
      navigate("/match/result", { state: data });
    } catch (err) {
      setJobError(err instanceof Error ? err.message : "Failed to analyze resume.");
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
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Resume & job fit
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
                PDF file only.
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

          <div className="mt-8 flex flex-col gap-3">
            {loading ? (
              <div className="rounded-full bg-slate-200 p-1">
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-300 animate-pulse" />
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-w-[9rem] items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Analyzing…" : "Analyze fit"}
              </button>
            </div>
          </div>
        </form>

        {jobError ? (
          <div className="mt-10 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
            {jobError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
