// Deterministic matching. AI only contributes the semantic sub-score in
// calculateFinalMatchScore — the final number is always computed here so it
// stays auditable.
//
// Coverage is graded rather than binary. A required skill can be satisfied
// exactly, by an alias, or partially by an explicitly related skill, and every
// point of the result is traceable to one entry in `matchDetails`.

import {
  RELATED_CREDIT,
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
 * KEPT AT 0.7/0.3, re-measured after the deterministic score became
 * component-based rather than coverage-only.
 *
 * The previous measurement was taken while the deterministic score was nothing
 * but required-skill string coverage, which was the weaker premise. Re-run
 * against the real job shapes real Gemini emits, with experience, tools and
 * education represented (deterministic score, then final at each ratio):
 *
 *   case                                     det   ai   0.7/0.3  0.6/0.4  0.5/0.5
 *   A  exact-match security expert, full job  100   90       97       96       95
 *   B  same-domain practitioner, full job      59   65       61       61       62
 *   C  network engineer vs security role        0   45       14       18       23
 *   D  frontend, 5 years + CS, full job         0   20        6        8       10
 *   B' same-domain practitioner, thin job       65   85       71       73       75
 *
 * Three readings, all pointing the same way:
 *
 * 1. The case for shifting weight to the AI was that a narrow deterministic
 *    score collapsed Overall Fit for candidates the AI could plainly see were
 *    suitable. Representing the evidence removes that premise rather than
 *    reweighting around it: B' went from 0/26 to 65/71 with the weights
 *    untouched. There is nothing left for a heavier AI weight to rescue.
 * 2. Shifting weight flatters bad matches. D — five years and a CS degree with
 *    zero overlap — rises from 6 to 8 or 10, and C from 14 to 23. Both move the
 *    wrong way: the zero-overlap ceiling is a feature, and it equals the AI
 *    weight by construction.
 * 3. It compresses the signal that matters most. A-minus-B narrows as the AI
 *    weight grows, because both converge on their AI scores. Holding the
 *    deterministic weight high is what keeps "has the requirements" clearly
 *    ahead of "works in this field".
 *
 * The AI's qualitative output is not discarded by this: educationFit,
 * experienceFit, projectFit, resumeInsights and matchingEvidence are now
 * persisted and shown, so seniority and evidence reasoning reaches the user
 * directly instead of only through a weighted number.
 */
export const MATCH_WEIGHTS = { deterministic: 0.7, ai: 0.3 } as const;

/** Most a fully matched advantage list can add to the deterministic score. */
export const MAX_ADVANTAGE_BONUS = 10;

/**
 * Bounded contributions beyond required-skill coverage.
 *
 * Required-skill coverage remains the dominant term — these are the difference
 * between "has none of the hard requirements" and "works in this field, has the
 * tools, and is missing some of the hard requirements". Together they cap at 35,
 * so coverage alone still decides whether a match is strong.
 */
export const MAX_TOOLS_BONUS = 8;
export const MAX_DOMAIN_EXPERIENCE_BONUS = 12;
export const MAX_EDUCATION_BONUS = 5;

/** Each demonstrated tool overlap is worth this much, up to the cap. */
export const TOOLS_BONUS_PER_MATCH = 2;

/**
 * Matched signals needed before domain relevance is considered established.
 *
 * This is the gate that stops generic seniority from flattering an unrelated
 * candidate: with no matched requirement, advantage or tool, relevance is 0 and
 * the experience and education bonuses are both 0 however long the career or
 * impressive the degree. Saturating at a small count rather than scaling by
 * matched *fraction* is deliberate — a security professional missing six of ten
 * senior requirements is still plainly in the field.
 */
export const DOMAIN_RELEVANCE_SATURATION = 3;

/** Years at which the experience contribution is fully earned. */
export const EXPERIENCE_SATURATION_YEARS = 5;

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
  skillRelations: Record<string, string[]> = {},
  evidenceSkills: string[] = []
): SkillCoverage {
  const profileAtoms: string[] = [];
  // Remembers the wording each atom came from, so an exact canonical match that
  // was written differently on the two sides is still reported as an alias
  // rather than losing that detail to atomization.
  const atomOrigins = new Map<string, string>();
  const atomSource = new Map<string, "skills" | "experience">();
  for (const raw of profileSkills) {
    const cleaned = cleanSkillText(raw);
    for (const atom of atomizeSkill(raw)) {
      if (!atomOrigins.has(atom)) {
        atomOrigins.set(atom, cleaned);
        atomSource.set(atom, "skills");
        profileAtoms.push(atom);
      }
    }
  }
  // Skills the candidate demonstrably has but did not list in a skills array.
  // Appended after the listed ones so a listed skill always wins the origin.
  for (const raw of evidenceSkills) {
    const cleaned = cleanSkillText(raw);
    for (const atom of atomizeSkill(raw)) {
      if (!atomOrigins.has(atom)) {
        atomOrigins.set(atom, cleaned);
        atomSource.set(atom, "experience");
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
    let credit = best.credit;
    if (tier === "exact" && best.matchedBy !== null) {
      const origin = atomOrigins.get(best.matchedBy);
      const requiredText = cleanSkillText(rawRequired);
      if (origin !== undefined && origin !== requiredText) {
        tier = "alias";
        reason = `${origin} is the same skill as ${requiredText}.`;
      }
    }

    const source =
      best.matchedBy === null ? undefined : atomSource.get(best.matchedBy);

    // A skill the candidate listed is a claim of proficiency. The same word
    // occurring in a sentence about their work is weaker evidence — real, but
    // not equivalent — so prose-only matches are capped at related credit. This
    // is what keeps a passing mention from scoring like a declared skill.
    if (source === "experience" && credit > RELATED_CREDIT) {
      credit = RELATED_CREDIT;
      tier = "related";
      reason = `${best.matchedBy} appears in the candidate's experience rather than their skills list.`;
    }

    details.push({
      required,
      matchedBy: best.matchedBy,
      tier,
      credit,
      reason,
      ...(best.family === undefined ? {} : { family: best.family }),
      ...(source === undefined ? {} : { source }),
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

/**
 * Job tools/technologies the candidate demonstrably overlaps with.
 *
 * `alreadyCredited` holds the canonical skills that already earned credit as a
 * requirement or an advantage, so the same evidence is never paid for twice.
 */
export function findToolMatches(
  profileSkills: string[],
  toolsMentioned: string[],
  alreadyCredited: ReadonlySet<string>,
  skillRelations: Record<string, string[]> = {}
): string[] {
  const profileAtoms = atomizeSkills(profileSkills);
  const matches: string[] = [];

  for (const tool of normalizeSkills(toolsMentioned)) {
    if (alreadyCredited.has(tool)) continue;
    const relatedTerms = skillRelations[tool] ?? [];
    const hit = profileAtoms.some((atom) => {
      const result = classifySkillMatch(atom, tool, relatedTerms);
      // Tools need a real overlap, not a neighbour: a related tool is not the
      // same as having used it.
      return result.tier === "exact" || result.tier === "alias";
    });
    if (hit) matches.push(tool);
  }
  return matches;
}

/**
 * Bounded credit for tool overlap. Saturates on the count of distinct tools
 * matched rather than the fraction of the job's list, so a job that names twenty
 * technologies does not dilute genuine overlap into nothing.
 */
export function calculateToolsBonus(matchedToolCount: number): number {
  if (matchedToolCount <= 0) return 0;
  return Math.min(MAX_TOOLS_BONUS, matchedToolCount * TOOLS_BONUS_PER_MATCH);
}

/**
 * 0..1 — whether the candidate is demonstrably in this job's domain at all.
 *
 * Derived only from matched evidence: requirements, advantage skills and tools.
 * Nothing about titles, seniority or years enters here, which is what keeps this
 * a relevance gate rather than a second experience score.
 */
export function calculateDomainRelevance(relevanceSignals: number): number {
  if (relevanceSignals <= 0) return 0;
  return roundCredit(
    Math.min(1, relevanceSignals / DOMAIN_RELEVANCE_SATURATION)
  );
}

/**
 * Credit for relevant professional experience.
 *
 * Multiplied by domain relevance, so years only count when there is established
 * overlap with this job. A long career in an unrelated field scores exactly zero
 * here — which is the property that stops experience from becoming a general
 * seniority bonus.
 */
export function calculateDomainExperienceBonus(
  experienceYears: number,
  domainRelevance: number
): number {
  if (!Number.isFinite(experienceYears) || experienceYears <= 0) return 0;
  if (domainRelevance <= 0) return 0;
  const experienceFactor = Math.min(
    1,
    experienceYears / EXPERIENCE_SATURATION_YEARS
  );
  return roundCredit(
    MAX_DOMAIN_EXPERIENCE_BONUS * experienceFactor * domainRelevance
  );
}

/** Whether the job's non-skill requirements ask for a formal qualification. */
export function jobRequiresEducation(nonSkillRequirements: string[]): boolean {
  return nonSkillRequirements.some((requirement) =>
    DEGREE_PATTERN.test(requirement)
  );
}

/**
 * Credit for a formal qualification, and only when the job asked for one.
 *
 * Also gated on domain relevance: a degree is corroboration for a candidate who
 * is already plausible, never a rescue for one who is not.
 */
export function calculateEducationBonus(
  hasDegree: boolean,
  educationRequested: boolean,
  domainRelevance: number
): number {
  if (!hasDegree || !educationRequested || domainRelevance <= 0) return 0;
  return roundCredit(MAX_EDUCATION_BONUS * domainRelevance);
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
  /** Tools/technologies the job names. Scored as a bounded bonus, never as a requirement. */
  toolsMentioned?: string[];
  /** Job requirements that are not skills, used to detect an education ask. */
  nonSkillRequirements?: string[];
  /** Canonical skills harvested verbatim from CV prose. */
  evidenceSkills?: string[];
  /** Years of experience from the CV. Only counts with domain relevance. */
  experienceYears?: number;
  /** Whether the CV names a formal qualification. */
  hasDegree?: boolean;
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
  const evidenceSkills = options.evidenceSkills ?? [];
  const toolsMentioned = options.toolsMentioned ?? [];
  const nonSkillRequirements = options.nonSkillRequirements ?? [];
  // Evidence skills participate in matching alongside the listed ones; the
  // matched atoms are tracked so tool credit cannot repay the same evidence.
  const matchableSkills = [...profileSkills, ...evidenceSkills];

  const coverage = computeSkillCoverage(
    profileSkills,
    requiredSkills,
    skillRelations,
    evidenceSkills
  );
  const matchedAdvantage = findAdvantageMatches(
    matchableSkills,
    advantageSkills,
    skillRelations
  );

  // Anything already paid for as a requirement or an advantage.
  const alreadyCredited = new Set<string>(matchedAdvantage);
  for (const detail of coverage.matchDetails) {
    if (detail.tier !== "none") {
      alreadyCredited.add(detail.required);
      if (detail.matchedBy !== null) alreadyCredited.add(detail.matchedBy);
    }
  }

  const matchedTools = findToolMatches(
    matchableSkills,
    toolsMentioned,
    alreadyCredited,
    skillRelations
  );

  const coverageScore = roundCredit(coverage.coverage * 100);
  const advantageBonus = calculateAdvantageBonus(
    matchedAdvantage.length,
    normalizeSkills(advantageSkills).length
  );
  const toolsBonus = calculateToolsBonus(matchedTools.length);

  const relevanceSignals =
    coverage.matched.length + matchedAdvantage.length + matchedTools.length;
  const domainRelevance = calculateDomainRelevance(relevanceSignals);
  const domainExperienceBonus = calculateDomainExperienceBonus(
    options.experienceYears ?? 0,
    domainRelevance
  );
  const educationBonus = calculateEducationBonus(
    options.hasDegree ?? false,
    jobRequiresEducation(nonSkillRequirements),
    domainRelevance
  );

  const algorithmicScore = clamp0to100(
    Math.round(
      coverageScore +
        advantageBonus +
        toolsBonus +
        domainExperienceBonus +
        educationBonus
    )
  );

  const scoreComponents = {
    coverageScore,
    advantageBonus,
    toolsBonus,
    domainExperienceBonus,
    educationBonus,
    domainRelevance,
    relevanceSignals,
    matchedToolsCount: matchedTools.length,
    toolsConsidered: normalizeSkills(toolsMentioned).length,
  };

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
    matchedTools,
    scoreComponents,
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
