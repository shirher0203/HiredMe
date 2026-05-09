const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_STORAGE_KEY = "hiredme.auth";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface AuthInput {
  email: string;
  password: string;
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
}

export function login(input: AuthInput): Promise<AuthSession> {
  return submitAuth("/api/auth/login", input);
}

export function register(input: AuthInput): Promise<AuthSession> {
  return submitAuth("/api/auth/register", input);
}
