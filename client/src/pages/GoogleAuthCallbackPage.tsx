import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { decodeGoogleSession, saveAuthSession } from "../services/auth";

function sanitizeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/profile";
  }
  return raw;
}

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const encodedSession = hashParams.get("session");
    const redirect = sanitizeRedirect(hashParams.get("redirect"));
    const authError = queryParams.get("error") ?? hashParams.get("error");

    if (authError) {
      setError(authError);
      return;
    }
    if (!encodedSession) {
      setError("Google authentication did not return a session.");
      return;
    }

    try {
      saveAuthSession(decodeGoogleSession(encodedSession));
      navigate(redirect, { replace: true });
    } catch {
      setError("Google authentication returned an invalid session.");
    }
  }, [navigate]);

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-100 bg-white/90 p-6 text-center shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/10">
        <h1 className="text-xl font-semibold text-slate-900">Google sign-in</h1>
        {error ? (
          <>
            <p className="mt-3 text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/auth/login", { replace: true })}
              className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Back to login
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Finishing sign-in...</p>
        )}
      </div>
    </div>
  );
}
