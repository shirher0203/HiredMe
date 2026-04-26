// Deterministic matching. AI only contributes the semantic sub-score in
// calculateFinalMatchScore — the final number is always computed here so it
// stays auditable.

import { normalizeSkills } from "./skills-normalizer";
import type { MatchAnalysis } from "./matching.types";

function clamp0to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Overlap between a profile and a job's required skills.
 * Returns skills in canonical (normalized) form.
 * Empty `requiredSkills` -> score 0, both arrays empty (avoids divide-by-zero).
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

/** Advantage skills the profile happens to have. Alias-aware. */
export function findAdvantageMatches(
  profileSkills: string[],
  advantageSkills: string[]
): string[] {
  const normalizedAdvantage = normalizeSkills(advantageSkills);
  const profileSet = new Set(normalizeSkills(profileSkills));

  const matches: string[] = [];
  for (const adv of normalizedAdvantage) {
    if (profileSet.has(adv)) {
      matches.push(adv);
    }
  }
  return matches;
}

// 70/30 split: algorithmic dominates, AI nudges. Keep this weighting in
// sync with PROJECT_PLAN_ROLE4.md section 3.
export function calculateFinalMatchScore(
  algorithmicScore: number,
  aiScore: number
): number {
  const clampedAlgorithmic = clamp0to100(algorithmicScore);
  const clampedAi = clamp0to100(aiScore);
  const weighted = 0.7 * clampedAlgorithmic + 0.3 * clampedAi;
  return clamp0to100(Math.round(weighted));
}

/**
 * One-shot: overlap + advantage matches + final score, packaged as a
 * MatchAnalysis. The AI's `aiSemanticScore` is an input, never the verdict.
 */
export function buildDeterministicMatch(
  profileSkills: string[],
  requiredSkills: string[],
  advantageSkills: string[],
  aiSemanticScore: number,
  aiExplanation: string
): MatchAnalysis {
  const { matched, missing, algorithmicScore } = calculateSkillOverlap(
    profileSkills,
    requiredSkills
  );
  const matchedAdvantage = findAdvantageMatches(profileSkills, advantageSkills);
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

  return {
    finalScore,
    algorithmicScore,
    aiSemanticScore: clampedAiSemanticScore,
    matchedRequired: matched,
    missingRequired: missing,
    matchedAdvantage,
    explanation,
  };
}
