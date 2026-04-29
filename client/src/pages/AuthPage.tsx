import { type FormEvent, useId, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  login,
  register,
  saveAuthSession,
  type AuthInput,
} from "../services/auth";

type AuthMode = "login" | "register";

function getAuthMode(raw: string | undefined): AuthMode {
  return raw === "register" ? "register" : "login";
}

function validateAuth(input: AuthInput, mode: AuthMode): string | null {
  if (!input.email.trim()) {
    return "Enter your email.";
  }
  if (!input.email.includes("@")) {
    return "Enter a valid email address.";
  }
  if (input.password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (mode === "register" && input.password.trim() !== input.password) {
    return "Password cannot start or end with spaces.";
  }
  return null;
}

export function AuthPage() {
  const formId = useId();
  const navigate = useNavigate();
  const params = useParams();
  const mode = getAuthMode(params.mode);
  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const copy = useMemo(
    () =>
      mode === "register"
        ? {
            title: "Create account",
            description: "Start with a HiredMe account for saved analysis and practice.",
            button: "Create account",
            loading: "Creating account…",
            switchText: "Already have an account?",
            switchTo: "Log in",
            switchPath: "/auth/login",
          }
        : {
            title: "Log in",
            description: "Continue to your match analysis and interview practice.",
            button: "Log in",
            loading: "Logging in…",
            switchText: "Need an account?",
            switchTo: "Create one",
            switchPath: "/auth/register",
          },
    [mode]
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const input = {
      email: email.trim().toLowerCase(),
      password,
    };
    const validationError = validateAuth(input, mode);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const session =
        mode === "register" ? await register(input) : await login(input);
      saveAuthSession(session);
      navigate("/match", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_26rem] lg:px-8">
        <header className="flex flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600/90">
            HiredMe account
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              {copy.title}
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            {copy.description}
          </p>
        </header>

        <section className="rounded-2xl border border-indigo-100 bg-white/90 p-6 shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/10 backdrop-blur-sm">
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <Link
              to="/auth/login"
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Login
            </Link>
            <Link
              to="/auth/register"
              className={`rounded-lg px-3 py-2 text-center text-sm font-semibold transition ${
                mode === "register"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Register
            </Link>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <div className="space-y-5">
              <div>
                <label
                  htmlFor={emailId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Email
                </label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor={passwordId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Password
                </label>
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-50"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? copy.loading : copy.button}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {copy.switchText}{" "}
            <Link
              to={copy.switchPath}
              className="font-semibold text-indigo-700 hover:text-indigo-600"
            >
              {copy.switchTo}
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
