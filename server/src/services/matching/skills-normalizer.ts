/**
 * Deterministic skill normalization for the Role 4 matching layer.
 *
 * Pure TypeScript. No AI calls, no DB, no external I/O.
 * Consumed by `matching.service.ts` and by any caller that needs to compare
 * skills coming from different sources (profile forms, job descriptions, AI).
 */

const ALIASES: Readonly<Record<string, string>> = {
  "react.js": "react",
  reactjs: "react",
  "node.js": "node",
  nodejs: "node",
  js: "javascript",
  ts: "typescript",
  mongo: "mongodb",
  "mongo db": "mongodb",
  postgres: "postgresql",
  "express.js": "express",
  expressjs: "express",
  "tailwind css": "tailwind",
};

/**
 * Normalize a single skill string to its canonical form.
 *
 * Behavior:
 * - Null/undefined-ish or whitespace-only inputs become "".
 * - Lowercased, trimmed, internal whitespace collapsed to single spaces.
 * - Trailing ".", ",", ";" stripped.
 * - Alias-mapped (e.g. "React.js" -> "react", "JS" -> "javascript").
 * - Otherwise returned as the cleaned lowercase form.
 */
export function normalizeSkill(skill: string): string {
  if (skill === null || skill === undefined) {
    return "";
  }
  let s = String(skill).toLowerCase().trim();
  if (s === "") {
    return "";
  }
  s = s.replace(/\s+/g, " ");
  s = s.replace(/[.,;]+$/g, "");
  s = s.trim();
  if (s === "") {
    return "";
  }
  const alias = ALIASES[s];
  return alias !== undefined ? alias : s;
}

/**
 * Normalize every entry, drop empties, and deduplicate preserving first-seen
 * order.
 */
export function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    const normalized = normalizeSkill(raw);
    if (normalized === "") {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Check whether a profile's skill list covers a required skill.
 * Alias-aware and case-insensitive via `normalizeSkill`.
 */
export function hasSkill(
  profileSkills: string[],
  requiredSkill: string
): boolean {
  const required = normalizeSkill(requiredSkill);
  if (required === "") {
    return false;
  }
  const normalizedProfile = normalizeSkills(profileSkills);
  return normalizedProfile.includes(required);
}
