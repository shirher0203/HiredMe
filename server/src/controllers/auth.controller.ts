import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { UserModel } from "../models/user.model";
import { UserProfileModel } from "../models/user-profile.model";
import { comparePassword, hashPassword, signAuthToken } from "../utils/auth";
import { HttpError } from "../utils/http-error";
import { buildEmptyProfileWithPersonalInfo } from "../utils/personal-info";

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "Email is required");
  }
  return raw.trim().toLowerCase();
}

function requirePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 6) {
    throw new HttpError(400, "VALIDATION_ERROR", "Password must be at least 6 characters");
  }
  return raw;
}

function optionalString(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readRegistrationPersonalInfo(body: unknown) {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const personalInfo =
    input.personalInfo && typeof input.personalInfo === "object"
      ? (input.personalInfo as Record<string, unknown>)
      : {};

  return {
    fullName: optionalString(input.fullName) ?? optionalString(personalInfo.fullName),
    phone: optionalString(input.phone) ?? optionalString(personalInfo.phone),
    location: optionalString(input.location) ?? optionalString(personalInfo.location),
    linkedinUrl: optionalString(input.linkedinUrl) ?? optionalString(personalInfo.linkedinUrl),
    portfolioOrGithubUrl:
      optionalString(input.portfolioOrGithubUrl) ?? optionalString(personalInfo.portfolioOrGithubUrl),
  };
}

function authUser(user: {
  _id: unknown;
  email: string;
  googleId?: string | null;
  personalInfo?: {
    fullName?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    portfolioOrGithubUrl?: string | null;
  } | null;
}) {
  return {
    id: String(user._id),
    email: user.email,
    providers: {
      google: Boolean(user.googleId),
    },
    personalInfo: user.personalInfo ?? {},
  };
}

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(
      500,
      "GOOGLE_AUTH_NOT_CONFIGURED",
      "Google authentication is not configured"
    );
  }

  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    `${process.env.SERVER_PUBLIC_URL?.trim() || `http://localhost:${process.env.PORT ?? 5000}`}/api/auth/google/callback`;

  return { clientId, clientSecret, redirectUri };
}

function getClientOrigin(): string {
  const clientPublicOrigin = process.env.CLIENT_PUBLIC_URL?.trim();
  if (clientPublicOrigin) {
    return clientPublicOrigin;
  }

  const serverPublicUrl = process.env.SERVER_PUBLIC_URL?.trim();
  if (serverPublicUrl) {
    return serverPublicUrl;
  }

  return process.env.CLIENT_ORIGIN?.trim() || "http://localhost:5173";
}

function getStateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET");
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signStatePayload(payload: string): string {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

function createOAuthState(redirectPath: string): string {
  const payload = base64UrlEncode(
    JSON.stringify({
      redirectPath: sanitizeRedirectPath(redirectPath),
      nonce: crypto.randomBytes(16).toString("hex"),
      exp: Date.now() + 10 * 60 * 1000,
    })
  );
  return `${payload}.${signStatePayload(payload)}`;
}

function parseOAuthState(raw: unknown): { redirectPath: string } {
  if (typeof raw !== "string" || !raw.includes(".")) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid OAuth state");
  }
  const [payload, signature] = raw.split(".");
  const expected = signStatePayload(payload);
  if (
    !signature ||
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid OAuth state");
  }

  const parsed = JSON.parse(base64UrlDecode(payload)) as {
    redirectPath?: unknown;
    exp?: unknown;
  };
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Expired OAuth state");
  }
  return {
    redirectPath:
      typeof parsed.redirectPath === "string"
        ? sanitizeRedirectPath(parsed.redirectPath)
        : "/profile",
  };
}

function sanitizeRedirectPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    return "/profile";
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/profile";
  }
  return trimmed;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new HttpError(
      401,
      "GOOGLE_AUTH_FAILED",
      data.error_description || data.error || "Google authentication failed"
    );
  }
  return data.access_token;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<Required<Pick<GoogleUserInfo, "sub" | "email">> & GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as GoogleUserInfo;
  if (!response.ok || !data.sub || !data.email || data.email_verified !== true) {
    throw new HttpError(401, "GOOGLE_AUTH_FAILED", "Google account email could not be verified");
  }
  return data as Required<Pick<GoogleUserInfo, "sub" | "email">> & GoogleUserInfo;
}

async function findOrCreateGoogleUser(profile: Required<Pick<GoogleUserInfo, "sub" | "email">> & GoogleUserInfo) {
  const email = profile.email.trim().toLowerCase();
  const existingByGoogleId = await UserModel.findOne({ googleId: profile.sub });
  if (existingByGoogleId) {
    return existingByGoogleId;
  }

  const existingByEmail = await UserModel.findOne({ email });
  if (existingByEmail) {
    existingByEmail.googleId = profile.sub;
    if (!existingByEmail.personalInfo?.fullName && profile.name) {
      existingByEmail.personalInfo = {
        ...(existingByEmail.personalInfo ?? {}),
        fullName: profile.name,
      };
    }
    await existingByEmail.save();
    return existingByEmail;
  }

  const user = await UserModel.create({
    email,
    googleId: profile.sub,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
    personalInfo: {
      fullName: optionalString(profile.name),
    },
    profile: {
      skills: [],
      experienceYears: 0,
      projects: [],
    },
  });
  await UserProfileModel.create({
    userId: user._id,
    profile: buildEmptyProfileWithPersonalInfo(user),
  });
  return user;
}

function redirectWithGoogleError(res: Response, message: string) {
  const target = new URL("/auth/google/callback", getClientOrigin());
  target.searchParams.set("error", message);
  return res.redirect(target.toString());
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = requirePassword(req.body?.password);
    const personalInfo = readRegistrationPersonalInfo(req.body);

    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new HttpError(400, "VALIDATION_ERROR", "Email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({
      email,
      passwordHash,
      personalInfo,
      profile: {
        skills: [],
        experienceYears: 0,
        projects: [],
      },
    });

    await UserProfileModel.create({
      userId: user._id,
      profile: buildEmptyProfileWithPersonalInfo(user),
    });

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(201).json({
      token,
      user: authUser(user),
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = requirePassword(req.body?.password);

    const user = await UserModel.findOne({ email });
    if (!user) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "UNAUTHORIZED", "Invalid credentials");
    }

    await UserProfileModel.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: { profile: buildEmptyProfileWithPersonalInfo(user) } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const token = signAuthToken({ userId: String(user._id), email: user.email });
    res.status(200).json({
      token,
      user: authUser(user),
    });
  } catch (err) {
    next(err);
  }
}

export async function startGoogleAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const { clientId, redirectUri } = requireGoogleConfig();
    const redirectPath = sanitizeRedirectPath(req.query.redirect);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", createOAuthState(redirectPath));
    authUrl.searchParams.set("prompt", "select_account");
    return res.redirect(authUrl.toString());
  } catch (err) {
    return next(err);
  }
}

export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    if (typeof req.query.error === "string") {
      return redirectWithGoogleError(res, req.query.error);
    }
    if (typeof req.query.code !== "string") {
      throw new HttpError(400, "VALIDATION_ERROR", "Missing Google authorization code");
    }

    const { redirectPath } = parseOAuthState(req.query.state);
    const accessToken = await exchangeGoogleCode(req.query.code);
    const googleProfile = await fetchGoogleUserInfo(accessToken);
    const user = await findOrCreateGoogleUser(googleProfile);

    await UserProfileModel.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: { profile: buildEmptyProfileWithPersonalInfo(user) } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const session = {
      token: signAuthToken({ userId: String(user._id), email: user.email }),
      user: authUser(user),
    };
    const target = new URL("/auth/google/callback", getClientOrigin());
    target.hash = new URLSearchParams({
      session: Buffer.from(JSON.stringify(session), "utf8").toString("base64url"),
      redirect: redirectPath,
    }).toString();
    return res.redirect(target.toString());
  } catch (err) {
    if (err instanceof Error) {
      return redirectWithGoogleError(res, err.message);
    }
    return next(err);
  }
}
