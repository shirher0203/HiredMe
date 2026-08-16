/**
 * Deterministic skill normalization for the Role 4 matching layer.
 *
 * Pure TypeScript. No AI calls, no DB, no external I/O.
 * Consumed by `matching.service.ts` and by any caller that needs to compare
 * skills coming from different sources (profile forms, job descriptions, AI).
 *
 * Three layers, in order of increasing tolerance:
 *   1. `normalizeSkill`  — clean and alias-map one string. Whole-string only.
 *   2. `atomizeSkill`    — split a multi-concept blob into canonical atoms.
 *   3. `classifySkillMatch` — grade one profile skill against one requirement.
 *
 * This is the only skill normalizer in the system. Anything that needs to
 * compare skills extends this file rather than adding a parallel one.
 */

import {
  SKILL_ALIASES,
  SLASH_COMPOUNDS,
} from "./skill-aliases.data";
import {
  getCuratedRelations,
  getSkillFamily,
  isNeverRelated,
} from "./skill-families.data";
import type { SkillMatchResult, SkillMatchTier } from "./matching.types";

/**
 * Cleaning without alias mapping: lowercase, trim, collapse internal
 * whitespace, strip trailing `.`/`,`/`;`. Exported so callers can tell an
 * identical string from an aliased one.
 */
export function cleanSkillText(skill: string): string {
  if (skill === null || skill === undefined) {
    return "";
  }
  let s = String(skill).toLowerCase().trim();
  if (s === "") {
    return "";
  }
  s = s.replace(/\s+/g, " ");
  s = s.replace(/[.,;]+$/g, "");
  return s.trim();
}

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
  const s = cleanSkillText(skill);
  if (s === "") {
    return "";
  }
  const alias = SKILL_ALIASES[s];
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

// ---------------------------------------------------------------------------
// Atomization
// ---------------------------------------------------------------------------

/**
 * Separators that reliably join two independent skills.
 * Kept short on purpose — every addition is a false-split risk.
 */
// An ampersand only separates when it is spaced: "docker & kubernetes" is two
// skills, "mitre-att&ck" and "r&d" are one.
const COMPOUND_SEPARATORS = /\s+and\s+|\s+&\s+|\s*,\s*|\s*\/\s*|\s*\|\s*/;

/**
 * Filler that describes a skill without being one. Stripped as whole words from
 * the edges of a candidate atom, longest first so "cloud environments" is
 * removed before "environments".
 */
const STOP_PHRASES = [
  "cloud environments",
  "cloud environment",
  "and protocols",
  "hands on experience",
  "hands-on experience",
  "working knowledge",
  "deep knowledge",
  "strong knowledge",
  "basic knowledge",
  "familiarity with",
  "experience with",
  "experience in",
  "proficiency in",
  "knowledge of",
  "environments",
  "environment",
  // "protocols" on its own is not a skill; "network protocols" is aliased to
  // networking before atomization ever splits the string.
  "protocols",
  "protocol",
  "fundamentals",
  "proficiency",
  "familiarity",
  "experience",
  "knowledge",
  "expertise",
  "advanced",
  "basics",
  "skills",
  "skill",
  "tools",
  "using",
  "good",
  "solid",
  "strong",
  "deep",
  // Bare prepositions, so stripping "strong knowledge" out of
  // "strong knowledge of networking" cannot leave "of networking" behind.
  "of",
  "with",
  "in",
] as const;

/** Canonical forms the dictionary knows, used to guard whitespace splitting. */
const KNOWN_CANONICAL: ReadonlySet<string> = new Set<string>([
  ...Object.keys(SKILL_ALIASES),
  ...Object.values(SKILL_ALIASES),
]);

function applySlashCompounds(text: string): string {
  let out = text;
  for (const [fragment, replacement] of Object.entries(SLASH_COMPOUNDS)) {
    if (out.includes(fragment)) {
      out = out.split(fragment).join(replacement);
    }
  }
  return out;
}

function stripStopPhrases(text: string): string {
  let out = text.trim();
  let changed = true;

  // Repeat so "strong knowledge of networking" loses both leading phrases.
  while (changed) {
    changed = false;
    for (const phrase of STOP_PHRASES) {
      if (out === phrase) return "";
      if (out.startsWith(`${phrase} `)) {
        out = out.slice(phrase.length + 1).trim();
        changed = true;
      }
      if (out.endsWith(` ${phrase}`)) {
        out = out.slice(0, out.length - phrase.length - 1).trim();
        changed = true;
      }
    }
  }
  return out;
}

/**
 * Splits on whitespace only when every resulting token is a skill the
 * dictionary already knows. That guard is what keeps "windows internals" and
 * "active directory" intact while "tcp-ip networking" separates correctly.
 */
function splitKnownAdjacentSkills(text: string): string[] {
  if (!text.includes(" ")) return [text];

  const tokens = text.split(" ").filter((token) => token !== "");
  if (tokens.length < 2) return [text];

  const canonical: string[] = [];
  for (const token of tokens) {
    if (!KNOWN_CANONICAL.has(token)) return [text];
    canonical.push(normalizeSkill(token));
  }
  return canonical;
}

/**
 * Break a multi-concept skill string into canonical atoms.
 *
 * `html/css` -> [html, css]
 * `tcp/ip networking and protocols` -> [tcp-ip, networking]
 * `aws cloud environments` -> [aws]
 * `cyber attack knowledge` -> [cyber-attack]
 *
 * Idempotent: atomizing an already-atomized skill returns it unchanged.
 */
export function atomizeSkill(skill: string): string[] {
  const cleaned = cleanSkillText(skill);
  if (cleaned === "") return [];

  // A string the dictionary maps as a whole is already one concept.
  const wholeAlias = SKILL_ALIASES[cleaned];
  if (wholeAlias !== undefined) return [wholeAlias];

  const protectedText = applySlashCompounds(cleaned);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string): void => {
    const normalized = normalizeSkill(candidate);
    if (normalized === "" || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  for (const rawPart of protectedText.split(COMPOUND_SEPARATORS)) {
    const stripped = stripStopPhrases(rawPart);
    if (stripped === "") continue;

    const wholePart = SKILL_ALIASES[stripped];
    if (wholePart !== undefined) {
      push(wholePart);
      continue;
    }

    for (const atom of splitKnownAdjacentSkills(stripped)) {
      push(atom);
    }
  }

  return out;
}

/** Atomize every entry, flatten, and deduplicate preserving first-seen order. */
export function atomizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    for (const atom of atomizeSkill(raw)) {
      if (seen.has(atom)) continue;
      seen.add(atom);
      out.push(atom);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Graded classification
// ---------------------------------------------------------------------------

/** Credit a related match earns. Half, because related is not equivalent. */
export const RELATED_CREDIT = 0.5;

function result(
  tier: SkillMatchTier,
  credit: number,
  matchedBy: string | null,
  reason: string,
  family?: string
): SkillMatchResult {
  return family === undefined
    ? { tier, credit, matchedBy, reason }
    : { tier, credit, matchedBy, reason, family };
}

/**
 * Grade one profile skill against one required skill.
 *
 * `relatedTerms` are the relations asserted for this specific requirement by
 * the job analysis. Relatedness requires an explicit assertion from either that
 * list or the curated map: sharing a family is never sufficient, which is what
 * stops "both are languages" from making javascript look like c.
 */
export function classifySkillMatch(
  profileSkill: string,
  requiredSkill: string,
  relatedTerms: readonly string[] = []
): SkillMatchResult {
  const rawProfile = cleanSkillText(profileSkill);
  const rawRequired = cleanSkillText(requiredSkill);
  const profile = normalizeSkill(profileSkill);
  const required = normalizeSkill(requiredSkill);
  const family = getSkillFamily(required);

  if (profile === "" || required === "") {
    return result("none", 0, null, "No skill to compare.", family);
  }

  if (profile === required) {
    if (rawProfile === rawRequired) {
      return result("exact", 1, profile, `Exact match on ${required}.`, family);
    }
    return result(
      "alias",
      1,
      profile,
      `${rawProfile} is the same skill as ${rawRequired}.`,
      family
    );
  }

  if (isNeverRelated(profile, required)) {
    return result(
      "none",
      0,
      null,
      `${profile} and ${required} are commonly confused but unrelated.`,
      family
    );
  }

  const asserted = new Set(relatedTerms.map((term) => normalizeSkill(term)));
  if (asserted.has(profile)) {
    return result(
      "related",
      RELATED_CREDIT,
      profile,
      `${profile} is related to ${required} for this role.`,
      family
    );
  }

  if (getCuratedRelations(required).includes(profile)) {
    return result(
      "related",
      RELATED_CREDIT,
      profile,
      `${profile} is a recognised neighbour of ${required}.`,
      family
    );
  }

  return result("none", 0, null, `No relationship to ${required}.`, family);
}
