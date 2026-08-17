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

/**
 * Raw `analyzeJob` output recorded against real Gemini for the same paragraph
 * after the extraction prompt was rewritten. Kept verbatim so the restraint
 * assertion runs offline: the model must not invent the technologies the full
 * posting names, because this input does not contain them.
 */
export const MICROSOFT_PARTIAL_RECORDED_RAW_RESPONSE = `{
  "roleTitle": "Security Researcher",
  "requiredSkills": [
    "threat-detection",
    "threat-investigation",
    "security-protection",
    "attacker-tradecraft-analysis"
  ],
  "advantageSkills": [],
  "toolsMentioned": [],
  "impliedSkills": [
    "cybersecurity",
    "incident-response"
  ],
  "nonSkillRequirements": [],
  "skillRelations": {
    "threat-detection": [
      "information-security",
      "threat-hunting",
      "security-monitoring"
    ],
    "threat-investigation": [
      "security-investigation",
      "incident-analysis",
      "forensics"
    ],
    "security-protection": [
      "cybersecurity",
      "defense-in-depth",
      "security-hardening"
    ],
    "attacker-tradecraft-analysis": [
      "adversary-simulation",
      "threat-intelligence",
      "malware-analysis"
    ]
  },
  "seniorityLevel": "mid",
  "summary": "Join a research team at Microsoft building Identity Threat Detection and Response (ITDR) products. You will analyze attacker tradecraft and leverage deep security knowledge to protect enterprises from advanced identity-based attacks and ransomware."
}`;

/**
 * The job analysis production actually stored for this input, before any of the
 * extraction or matching changes. Carries no `skillRelations`, which makes it
 * the natural fixture for the legacy-document path as well.
 */
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
