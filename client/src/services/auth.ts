const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_STORAGE_KEY = "hiredme.auth";

export interface AuthUser {
  id: string;
  email: string;
  providers?: {
    google?: boolean;
  };
  personalInfo?: RegistrationPersonalInfo;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface RegistrationPersonalInfo {
  fullName?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioOrGithubUrl?: string;
}

export interface AuthInput {
  email: string;
  password: string;
  personalInfo?: RegistrationPersonalInfo;
}

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? "Authentication failed.";
  } catch {
    return "Authentication failed.";
  }
}

async function submitAuth(
  path: "/api/auth/login" | "/api/auth/register",
  input: AuthInput
): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json() as Promise<AuthSession>;
}

export function saveAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  try {
    window.dispatchEvent(new Event("authchange"));
  } catch {}
}

export function getAuthSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  try {
    window.dispatchEvent(new Event("authchange"));
  } catch {}
}

export function login(input: AuthInput): Promise<AuthSession> {
  return submitAuth("/api/auth/login", input);
}

export function register(input: AuthInput): Promise<AuthSession> {
  return submitAuth("/api/auth/register", input);
}

export function buildGoogleAuthUrl(redirectPath = "/profile"): string {
  const params = new URLSearchParams({ redirect: redirectPath });
  return `${API_BASE_URL}/api/auth/google/start?${params.toString()}`;
}

export function decodeGoogleSession(encoded: string): AuthSession {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return JSON.parse(window.atob(padded)) as AuthSession;
}
