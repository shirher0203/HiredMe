/**
 * Profile fixture shared by Scenario A and Scenario B.
 *
 * Modelled on a real security-track candidate's saved profile, but carries no
 * personal data of any kind: no name, email, phone, employer, institution or
 * URL. Skills are already in canonical form (lowercase, one concept per entry)
 * so tests exercise matching rather than re-testing the parser.
 */

import type { ProfileInput } from "../../services/matching/matching.types";

export const SECURITY_CANDIDATE_SKILLS = [
  "python",
  "sql",
  "pandas",
  "javascript",
  "html",
  "css",
  "bash",
  "tcp-ip",
  "networking",
  "cyber-attack",
  "wireshark",
  "censys",
  "aws",
  "mysql",
  "oracle",
  "git",
  "claude-code",
] as const;

export const SECURITY_CANDIDATE_PROFILE: ProfileInput = {
  skills: [...SECURITY_CANDIDATE_SKILLS],
  experienceYears: 1,
  projects: [
    "network traffic analysis tool",
    "log anomaly detection notebook",
  ],
  education: "BSc Computer Science student",
  goals: "Move into a security research or detection engineering role",
};

/**
 * The pre-canonicalization form of the same skills, as the CV parser used to
 * emit them: multi-concept blobs that atomization has to split. Used by the
 * normalizer tests, not by the match fixtures.
 */
export const SECURITY_CANDIDATE_RAW_SKILLS = [
  "python",
  "sql",
  "pandas",
  "javascript",
  "html/css",
  "bash",
  "tcp/ip networking and protocols",
  "cyber attack knowledge",
  "wireshark",
  "censys",
  "aws cloud environments",
  "mysql",
  "oracle",
  "git",
  "claude code",
] as const;

/**
 * A strong exact-match profile for the same security role, used as the control
 * that related-only matches must score below.
 */
export const SECURITY_EXPERT_SKILLS = [
  "cybersecurity",
  "threat-detection",
  "security-investigation",
  "identity-threat-detection-and-response",
  "python",
  "kql",
] as const;

/**
 * A profile with no plausible relationship to a security role, used as the
 * negative control that must stay at zero.
 */
export const FRONTEND_CANDIDATE_SKILLS = [
  "javascript",
  "react",
  "css",
  "figma",
  "webpack",
] as const;
