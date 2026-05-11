import { Link, useLocation } from "react-router-dom";
import type { JobAnalysis, MatchAnalysis } from "../types/matching";
import type { ParsedResume } from "../types/parsedResume";

interface MatchResultState {
  job: JobAnalysis;
  match: MatchAnalysis;
  parsedResume: ParsedResume;
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
            {job.requiredSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-indigo-950"
              >
                {skill}
              </span>
            ))}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Advantage skills</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {job.advantageSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-violet-100 bg-violet-50/80 px-2 py-0.5 text-violet-950"
              >
                {skill}
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
          Final score blends <strong className="font-semibold text-emerald-800">70%</strong> skill overlap and <strong className="font-semibold text-violet-800">30%</strong> AI semantic match.
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700/80">Skill overlap</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-900">{match.algorithmicScore}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/80">AI semantic score</p>
          <p className="mt-1 text-3xl font-semibold text-violet-900">{match.aiSemanticScore}</p>
        </div>
      </div>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <SkillChips label="Matched required skills" items={match.matchedRequired} variant="matched" />
        <SkillChips label="Missing required skills" items={match.missingRequired} variant="missing" />
        <SkillChips label="Matched advantage skills" items={match.matchedAdvantage} variant="advantage" />
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
          <p className="mt-1 text-sm text-slate-600">Parsed resume details and the candidate signals used for match scoring.</p>
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

export function MatchResultPage() {
  const location = useLocation();
  const state = location.state as MatchResultState | null;

  if (!state || !state.job || !state.match || !state.parsedResume) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-8 shadow-sm shadow-slate-300/10 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">No analysis data available</h1>
            <p className="mt-3 text-sm text-slate-600">
              The result page was opened without analysis results. Please return to the match page and try again.
            </p>
            <Link
              to="/match"
              className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Back to match
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-slate-900">
            Resume match results
          </h1>
          <p className="mt-2 text-slate-600">
            This page shows the reviewed resume, the AI match score, and the job analysis.
          </p>
        </header>

        <div className="space-y-8">
          <ResumeSection resume={state.parsedResume} />
          <MatchSection match={state.match} />
          <JobCard job={state.job} />
        </div>

        <div className="mt-8">
          <Link
            to="/match"
            className="inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Analyze another resume
          </Link>
        </div>
      </div>
    </div>
  );
}
