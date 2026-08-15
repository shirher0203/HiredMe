/**
 * Scenario A — partial job description.
 *
 * This is the exact text a user pasted into the job form in production: a
 * single introductory paragraph, not a full posting. It exists to validate the
 * *matching* layer, and must not be used to assert extraction recall — the
 * input genuinely does not mention Python, SQL, Windows internals or any of the
 * other technologies the full posting lists.
 *
 * `RECORDED_JOB_ANALYSIS` is what `analyzeJob` actually returned for this input
 * in production, kept verbatim so the deterministic matcher can be exercised
 * against real model output without a network call. Extracting these four
 * security concepts from one paragraph is reasonable behaviour; the defect this
 * scenario pins is that they scored zero against a security candidate.
 */

import type { JobAnalysis } from "../../services/matching/matching.types";

export const MICROSOFT_PARTIAL_DESCRIPTION = `Come build one of Microsoft's most exciting security products: Identity Threat Detection and Response (ITDR). As cyber-attacks grow more sophisticated, we help enterprises detect, investigate, and autonomously protect against advanced identity-based attacks and data breaches — from nation-state actors to large-scale ransomware operators. Our research team combines deep knowledge of the attacker landscape and tradecraft to deliver the innovations needed to uncover and stop even the most well-funded adversaries.`;

export const MICROSOFT_PARTIAL_RECORDED_JOB_ANALYSIS: JobAnalysis = {
  roleTitle: "Security Researcher",
  requiredSkills: [
    "Identity Threat Detection and Response",
    "Cybersecurity",
    "Threat Detection",
    "Security Investigation",
  ],
  advantageSkills: [
    "Attacker Landscape Knowledge",
    "Adversary Tradecraft",
    "Ransomware Mitigation",
    "Enterprise Security",
  ],
  seniorityLevel: "senior",
  summary:
    "Security research role on Microsoft's Identity Threat Detection and Response product, focused on detecting, investigating and stopping advanced identity-based attacks.",
};
