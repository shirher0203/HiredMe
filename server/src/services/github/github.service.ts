import { HttpError } from "../../utils/http-error";
import { TtlCache } from "../../utils/ttl-cache";

export interface GithubRepoMetadata {
  fullName: string;
  description: string | null;
  primaryLanguage: string | null;
  languages: string[];
  stars: number;
  readme: string | null;
  packageJson: string | null;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

// TODO: can be swapped for Redis (member 5) later.
const repoCache = new TtlCache<GithubRepoMetadata>(TEN_MINUTES_MS);

/** Reset the in-memory cache. Exported for tests. */
export function __clearRepoCache(): void {
  repoCache.clear();
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  if (typeof url !== "string" || url.trim() === "") {
    throw new HttpError(400, "VALIDATION_ERROR", "GitHub URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid GitHub URL");
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "URL must be a github.com repository"
    );
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Invalid GitHub repository URL"
    );
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, "");
  if (!owner || !repo) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Invalid GitHub repository URL"
    );
  }

  return { owner, repo };
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "HiredMe-Server",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function ghFetch(url: string): Promise<Response> {
  return fetch(url, { headers: githubHeaders() });
}

function assertNotRateLimited(status: number): void {
  if (status === 403 || status === 429) {
    throw new HttpError(429, "RATE_LIMITED", "GitHub API rate limit exceeded");
  }
}

function decodeBase64(content: string): string {
  return Buffer.from(content, "base64").toString("utf8");
}

export async function fetchRepoMetadata(
  owner: string,
  repo: string
): Promise<GithubRepoMetadata> {
  const cacheKey = `${owner}/${repo}`.toLowerCase();
  const cached = repoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const repoRes = await ghFetch(base);
  if (repoRes.status === 404) {
    throw new HttpError(404, "NOT_FOUND", "GitHub repository not found");
  }
  assertNotRateLimited(repoRes.status);
  if (!repoRes.ok) {
    throw new HttpError(
      502,
      "GITHUB_ERROR",
      "Failed to fetch repository metadata"
    );
  }
  const repoData = (await repoRes.json()) as {
    full_name?: unknown;
    description?: unknown;
    language?: unknown;
    stargazers_count?: unknown;
  };

  let languages: string[] = [];
  const langRes = await ghFetch(`${base}/languages`);
  assertNotRateLimited(langRes.status);
  if (langRes.ok) {
    const langData = (await langRes.json()) as Record<string, unknown>;
    languages = Object.keys(langData);
  }

  let readme: string | null = null;
  const readmeRes = await ghFetch(`${base}/readme`);
  assertNotRateLimited(readmeRes.status);
  if (readmeRes.ok) {
    const readmeData = (await readmeRes.json()) as { content?: unknown };
    if (typeof readmeData.content === "string") {
      readme = decodeBase64(readmeData.content);
    }
  }

  let packageJson: string | null = null;
  const pkgRes = await ghFetch(`${base}/contents/package.json`);
  assertNotRateLimited(pkgRes.status);
  if (pkgRes.ok) {
    const pkgData = (await pkgRes.json()) as { content?: unknown };
    if (typeof pkgData.content === "string") {
      packageJson = decodeBase64(pkgData.content);
    }
  }

  const metadata: GithubRepoMetadata = {
    fullName:
      typeof repoData.full_name === "string"
        ? repoData.full_name
        : `${owner}/${repo}`,
    description:
      typeof repoData.description === "string" ? repoData.description : null,
    primaryLanguage:
      typeof repoData.language === "string" ? repoData.language : null,
    languages,
    stars:
      typeof repoData.stargazers_count === "number"
        ? repoData.stargazers_count
        : 0,
    readme,
    packageJson,
  };

  repoCache.set(cacheKey, metadata);
  return metadata;
}
