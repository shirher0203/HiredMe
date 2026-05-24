import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { analyzeFitPreview } from "../services/fitAnalysis";

export function FitPreviewPage() {
  const formId = useId();
  const jobId = `${formId}-job`;

  const navigate = useNavigate();
  const [jobDescription, setJobDescription] = useState("");
  const [jobError, setJobError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setJobError(null);

    const trimmed = jobDescription.trim();
    if (!trimmed) {
      setJobError("Enter a job description.");
      return;
    }

    setLoading(true);
    try {
      const data = await analyzeFitPreview({
        jobDescription: trimmed,
      });
      navigate("/match/result", { state: data });
    } catch (err) {
      setJobError(err instanceof Error ? err.message : "Failed to analyze resume.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Job fit analysis
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Paste a job description and compare it against your saved profile CV.
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
                Your saved profile is used automatically. Update it from the profile page before analyzing.
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
                {loading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          </div>
        </form>

        {jobError ? (
          <div className="mt-10 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
            {jobError}
            {jobError.toLowerCase().includes("profile") ? (
              <div className="mt-4">
                <Link
                  to="/profile"
                  className="inline-flex rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Go to profile
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
