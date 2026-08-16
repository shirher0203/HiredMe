// Deterministic matching. AI only contributes the semantic sub-score in
// calculateFinalMatchScore — the final number is always computed here so it
// stays auditable.
//
// Coverage is graded rather than binary. A required skill can be satisfied
// exactly, by an alias, or partially by an explicitly related skill, and every
// point of the result is traceable to one entry in `matchDetails`.

import {
  atomizeSkill,
  atomizeSkills,
  classifySkillMatch,
  cleanSkillText,
  normalizeSkill,
  normalizeSkills,
} from "./skills-normalizer";
import type {
  MatchAnalysis,
  MatchAnalysisExtras,
  SkillMatchDetail,
  SkillMatchTier,
} from "./matching.types";

/**
 * Weighting between the deterministic score and the AI's semantic score.
 *
 * Deliberately a single named constant: retuning the balance is a one-line
 * change with one place to look, and the weighting test reads these values
 * rather than hard-coding them.
 *
 * Held at the original 0.7/0.3 while graded coverage landed, so that the only
 * variable in the regression fixtures was match quality.
 */
export const MATCH_WEIGHTS = { deterministic: 0.7, ai: 0.3 } as const;

/** Most a fully matched advantage list can add to the deterministic score. */
export const MAX_ADVANTAGE_BONUS = 10;

/**
 * Related matches may account for at most half of the maximum achievable
 * coverage. A candidate whose every match is a weak link therefore tops out at
 * half the skill score, and can never present as a full match.
 */
export const RELATED_CREDIT_CAP_RATIO = 0.5;

function clamp0to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/** Rounds to 4dp so accumulated credit stays comparable across runs. */
function roundCredit(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const YEARS_PATTERN = /\d+\s*\+?\s*years?/i;
const DEGREE_PATTERN =
  /\b(bsc|b\.sc|msc|m\.sc|b\.?a\.?|m\.?a\.?|phd|bachelor|master|doctorate|degree|diploma)\b/i;

/**
 * Soft and non-technical requirements. These are real asks and stay visible to
 * the candidate, but scoring a CV skill list against them is meaningless, and
 * leaving them in the denominator silently deflated every score.
 */
const SOFT_REQUIREMENT_TERMS = [
  "team player",
  "teamwork",
  "communication",
  "communicator",
  "interpersonal",
  "motivated",
  "self-starter",
  "fast learner",
  "quick learner",
  "attention to detail",
  "detail oriented",
  "detail-oriented",
  "problem solving",
  "problem-solving",
  "critical thinking",
  "time management",
  "leadership",
  "mentoring",
  "mentorship",
  "passion",
  "passionate",
  "proactive",
  "collaborative",
  "collaboration",
  "work ethic",
  "willingness to learn",
  "can-do",
  "hard working",
  "independently",
] as const;

/**
 * Whether a required-skill entry is something a skill list can be scored
 * against. Years of experience, degrees and soft requirements are not.
 */
export function isScorableSkill(requiredSkill: string): boolean {
  const skill = normalizeSkill(requiredSkill);
  if (skill === "") return false;
  if (YEARS_PATTERN.test(skill)) return false;
  if (DEGREE_PATTERN.test(skill)) return false;

  const spaced = skill.replace(/[-_]+/g, " ");
  return !SOFT_REQUIREMENT_TERMS.some(
    (term) => spaced === term || spaced.includes(term)
  );
}

export interface SkillCoverage {
  /** One entry per scorable requirement, in the order the job listed them. */
  matchDetails: SkillMatchDetail[];
  matched: string[];
  missing: string[];
  scorableRequiredCount: number;
  /** 0..1 — share of the scorable requirements the profile covers. */
  coverage: number;
  /** 0..1 — how much of the earned credit came from related matches. */
  relatedShare: number;
}

/**
 * Grades a profile against a job's required skills.
 *
 * Both sides are atomized here as well as at ingestion, because profiles saved
 * before atomization existed still hold multi-concept blobs and must not be
 * penalised for it.
 */
export function computeSkillCoverage(
  profileSkills: string[],
  requiredSkills: string[],
  skillRelations: Record<string, string[]> = {}
): SkillCoverage {
  const profileAtoms: string[] = [];
  // Remembers the wording each atom came from, so an exact canonical match that
  // was written differently on the two sides is still reported as an alias
  // rather than losing that detail to atomization.
  const atomOrigins = new Map<string, string>();
  for (const raw of profileSkills) {
    const cleaned = cleanSkillText(raw);
    for (const atom of atomizeSkill(raw)) {
      if (!atomOrigins.has(atom)) {
        atomOrigins.set(atom, cleaned);
        profileAtoms.push(atom);
      }
    }
  }

  const seenRequired = new Set<string>();

  const details: SkillMatchDetail[] = [];
  const missing: string[] = [];

  for (const rawRequired of requiredSkills) {
    const required = normalizeSkill(rawRequired);
    if (required === "" || seenRequired.has(required)) continue;
    seenRequired.add(required);

    if (!isScorableSkill(required)) {
      // Still shown to the candidate, just not part of the denominator.
      missing.push(required);
      continue;
    }

    const relatedTerms = skillRelations[required] ?? [];
    let best = classifySkillMatch("", required, relatedTerms);

    for (const atom of profileAtoms) {
      const candidate = classifySkillMatch(atom, required, relatedTerms);
      if (candidate.credit > best.credit) {
        best = candidate;
        if (best.credit >= 1) break;
      }
    }

    let tier = best.tier;
    let reason = best.reason;
    if (tier === "exact" && best.matchedBy !== null) {
      const origin = atomOrigins.get(best.matchedBy);
      const requiredText = cleanSkillText(rawRequired);
      if (origin !== undefined && origin !== requiredText) {
        tier = "alias";
        reason = `${origin} is the same skill as ${requiredText}.`;
      }
    }

    details.push({
      required,
      matchedBy: best.matchedBy,
      tier,
      credit: best.credit,
      reason,
      ...(best.family === undefined ? {} : { family: best.family }),
    });
  }

  const scorableRequiredCount = details.length;

  const strongCredit = details
    .filter((detail) => detail.tier === "exact" || detail.tier === "alias")
    .reduce((sum, detail) => sum + detail.credit, 0);
  const rawRelatedCredit = details
    .filter((detail) => detail.tier === "related")
    .reduce((sum, detail) => sum + detail.credit, 0);

  const relatedCap = RELATED_CREDIT_CAP_RATIO * scorableRequiredCount;
  const allowedRelatedCredit = Math.min(rawRelatedCredit, relatedCap);

  // Scale the related entries when the cap bites, so matchDetails always adds
  // up to the coverage that was actually awarded.
  if (allowedRelatedCredit < rawRelatedCredit && rawRelatedCredit > 0) {
    const scale = allowedRelatedCredit / rawRelatedCredit;
    for (const detail of details) {
      if (detail.tier === "related") {
        detail.credit = roundCredit(detail.credit * scale);
      }
    }
  }

  const totalCredit = roundCredit(strongCredit + allowedRelatedCredit);
  const coverage =
    scorableRequiredCount === 0 ? 0 : totalCredit / scorableRequiredCount;
  const relatedShare =
    totalCredit === 0 ? 0 : roundCredit(allowedRelatedCredit / totalCredit);

  const matched: string[] = [];
  for (const detail of details) {
    if (detail.tier === "none") missing.push(detail.required);
    else matched.push(detail.required);
  }

  return {
    matchDetails: details,
    matched,
    missing,
    scorableRequiredCount,
    coverage: roundCredit(coverage),
    relatedShare,
  };
}

/**
 * Overlap between a profile and a job's required skills.
 * Returns skills in canonical (normalized) form.
 * Empty `requiredSkills` -> score 0, both arrays empty (avoids divide-by-zero).
 *
 * Retained as the exact-and-alias-only view of coverage; graded scoring goes
 * through `computeSkillCoverage`.
 */
export function calculateSkillOverlap(
  profileSkills: string[],
  requiredSkills: string[]
): { matched: string[]; missing: string[]; algorithmicScore: number } {
  const normalizedRequired = normalizeSkills(requiredSkills);

  if (normalizedRequired.length === 0) {
    return { matched: [], missing: [], algorithmicScore: 0 };
  }

  const profileSet = new Set(normalizeSkills(profileSkills));

  const matched: string[] = [];
  const missing: string[] = [];
  for (const req of normalizedRequired) {
    if (profileSet.has(req)) {
      matched.push(req);
    } else {
      missing.push(req);
    }
  }

  const rawScore = (matched.length / normalizedRequired.length) * 100;
  const algorithmicScore = clamp0to100(Math.round(rawScore));

  return { matched, missing, algorithmicScore };
}

/**
 * Advantage skills the profile happens to have. Alias-aware, and now also
 * credits an explicitly related skill.
 */
export function findAdvantageMatches(
  profileSkills: string[],
  advantageSkills: string[],
  skillRelations: Record<string, string[]> = {}
): string[] {
  const profileAtoms = atomizeSkills(profileSkills);
  const matches: string[] = [];

  for (const advantage of normalizeSkills(advantageSkills)) {
    const relatedTerms = skillRelations[advantage] ?? [];
    const hit = profileAtoms.some(
      (atom) => classifySkillMatch(atom, advantage, relatedTerms).credit > 0
    );
    if (hit) matches.push(advantage);
  }
  return matches;
}

/**
 * Bonus for advantage skills the candidate already has. Capped, because a
 * preferred skill is not a requirement and must not dominate the score.
 */
export function calculateAdvantageBonus(
  matchedAdvantageCount: number,
  advantageCount: number
): number {
  if (advantageCount <= 0 || matchedAdvantageCount <= 0) return 0;
  const ratio = Math.min(1, matchedAdvantageCount / advantageCount);
  return roundCredit(MAX_ADVANTAGE_BONUS * ratio);
}

export function calculateFinalMatchScore(
  algorithmicScore: number,
  aiScore: number
): number {
  const clampedAlgorithmic = clamp0to100(algorithmicScore);
  const clampedAi = clamp0to100(aiScore);
  const weighted =
    MATCH_WEIGHTS.deterministic * clampedAlgorithmic + MATCH_WEIGHTS.ai * clampedAi;
  return clamp0to100(Math.round(weighted));
}

export interface DeterministicMatchOptions {
  /** Canonical skill -> related terms, as asserted by the job analysis. */
  skillRelations?: Record<string, string[]>;
}

/**
 * One-shot: graded coverage + advantage bonus + final score, packaged as a
 * MatchAnalysis. The AI's `aiSemanticScore` is an input, never the verdict.
 *
 * Optional `extras` thread resume-aware qualitative signals onto the
 * returned object. Omitted extras are not added to the output — callers
 * that never pass `extras` get the exact V1 shape.
 */
export function buildDeterministicMatch(
  profileSkills: string[],
  requiredSkills: string[],
  advantageSkills: string[],
  aiSemanticScore: number,
  aiExplanation: string,
  extras?: MatchAnalysisExtras,
  options: DeterministicMatchOptions = {}
): MatchAnalysis {
  const skillRelations = options.skillRelations ?? {};
  const coverage = computeSkillCoverage(
    profileSkills,
    requiredSkills,
    skillRelations
  );
  const matchedAdvantage = findAdvantageMatches(
    profileSkills,
    advantageSkills,
    skillRelations
  );

  const skillScore = coverage.coverage * 100;
  const advantageBonus = calculateAdvantageBonus(
    matchedAdvantage.length,
    normalizeSkills(advantageSkills).length
  );
  const algorithmicScore = clamp0to100(Math.round(skillScore + advantageBonus));

  const clampedAiSemanticScore = clamp0to100(Math.round(aiSemanticScore));
  const finalScore = calculateFinalMatchScore(
    algorithmicScore,
    clampedAiSemanticScore
  );

  const trimmedExplanation = aiExplanation.trim();
  const explanation =
    trimmedExplanation === ""
      ? "No AI explanation provided."
      : trimmedExplanation;

  const result: MatchAnalysis = {
    finalScore,
    algorithmicScore,
    aiSemanticScore: clampedAiSemanticScore,
    matchedRequired: coverage.matched,
    missingRequired: coverage.missing,
    matchedAdvantage,
    explanation,
    matchDetails: coverage.matchDetails,
    relatedShare: coverage.relatedShare,
    scorableRequiredCount: coverage.scorableRequiredCount,
    advantageBonus,
  };

  if (extras) {
    if (extras.educationFit !== undefined) result.educationFit = extras.educationFit;
    if (extras.experienceFit !== undefined) result.experienceFit = extras.experienceFit;
    if (extras.projectFit !== undefined) result.projectFit = extras.projectFit;
    if (extras.languageFit !== undefined) result.languageFit = extras.languageFit;
    if (extras.resumeInsights !== undefined) result.resumeInsights = extras.resumeInsights;
    if (extras.matchingEvidence !== undefined) result.matchingEvidence = extras.matchingEvidence;
  }

  return result;
}

export type { SkillMatchTier };
