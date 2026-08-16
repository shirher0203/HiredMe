// Skill taxonomy: families and explicit relations.
//
// Two separate ideas live here, and keeping them separate is the point.
//
// SKILL_FAMILIES groups canonical skills by domain. It is derived from the
// category maps that skill-aliases.data.ts already maintains — that grouping
// used to be thrown away by the SKILL_ALIASES spread. It is descriptive only:
// family membership NEVER earns match credit, because "both are languages" is
// exactly the reasoning that would make javascript look like c.
//
// SKILL_RELATIONS is the curated adjacency that does earn partial credit. Every
// edge is asserted deliberately and is symmetric. It is the deterministic floor
// under the AI-asserted relations a job analysis carries, so mock mode, unit
// tests and jobs analysed before relations existed still behave sensibly.

import {
  AI_ML_ALIASES,
  BACKEND_ALIASES,
  CLOUD_ALIASES,
  CONCEPT_ALIASES,
  DATABASE_ALIASES,
  DEVOPS_ALIASES,
  FRONTEND_ALIASES,
  LANGUAGE_ALIASES,
  MOBILE_ALIASES,
  NETWORKING_ALIASES,
  SECURITY_ALIASES,
  TESTING_ALIASES,
  TOOLING_ALIASES,
} from "./skill-aliases.data";

const FAMILY_SOURCES: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> = [
  ["language", LANGUAGE_ALIASES],
  ["frontend", FRONTEND_ALIASES],
  ["backend", BACKEND_ALIASES],
  ["database", DATABASE_ALIASES],
  ["cloud", CLOUD_ALIASES],
  ["devops", DEVOPS_ALIASES],
  ["tooling", TOOLING_ALIASES],
  ["testing", TESTING_ALIASES],
  ["ai-ml", AI_ML_ALIASES],
  ["mobile", MOBILE_ALIASES],
  ["concept", CONCEPT_ALIASES],
  ["security", SECURITY_ALIASES],
  ["networking", NETWORKING_ALIASES],
];

/**
 * Canonical skills that no alias points at, so they would otherwise have no
 * family. Listed explicitly rather than inferred.
 */
const EXTRA_FAMILY_MEMBERS: Readonly<Record<string, string>> = {
  python: "language",
  javascript: "language",
  typescript: "language",
  java: "language",
  go: "language",
  rust: "language",
  ruby: "language",
  swift: "language",
  kotlin: "language",
  "c++": "language",
  "c#": "language",
  c: "language",
  bash: "language",
  html: "frontend",
  css: "frontend",
  sql: "database",
  kql: "database",
  cypher: "database",
  mysql: "database",
  oracle: "database",
  sqlite: "database",
  pandas: "ai-ml",
  numpy: "ai-ml",
  git: "tooling",
  wireshark: "networking",
  censys: "security",
  kerberos: "security",
  ntlm: "security",
  ldap: "security",
  saml: "security",
  siem: "security",
  ransomware: "security",
  forensics: "security",
  networking: "networking",
  firewall: "networking",
  dns: "networking",
};

function buildFamilies(): Readonly<Record<string, string>> {
  const families: Record<string, string> = {};
  for (const [family, map] of FAMILY_SOURCES) {
    for (const canonical of Object.values(map)) {
      // First family wins, so the ordering above is the precedence order.
      if (families[canonical] === undefined) families[canonical] = family;
    }
  }
  for (const [canonical, family] of Object.entries(EXTRA_FAMILY_MEMBERS)) {
    if (families[canonical] === undefined) families[canonical] = family;
  }
  return families;
}

export const SKILL_FAMILIES: Readonly<Record<string, string>> = buildFamilies();

export function getSkillFamily(canonicalSkill: string): string | undefined {
  return SKILL_FAMILIES[canonicalSkill];
}

/**
 * Curated relations, written one direction and mirrored below. Each edge means
 * "someone who knows A has genuinely transferable ground for B", not "A and B
 * are the same" — hence the reduced credit a related match earns.
 */
const RELATION_SEEDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // Security core
  [
    "cybersecurity",
    [
      "information-security",
      "network-security",
      "application-security",
      "cloud-security",
      "cyber-attack",
      "threat-detection",
      "security-investigation",
      "security-research",
      "soc",
      "siem",
      "vulnerability-assessment",
      "penetration-testing",
      "incident-response",
    ],
  ],
  [
    "cyber-attack",
    [
      "threat-detection",
      "security-investigation",
      "adversary-tradecraft",
      "malware-analysis",
      "kill-chain",
      "identity-based-attacks",
      "ransomware",
      "incident-response",
      "penetration-testing",
      "mitre-attack",
    ],
  ],
  [
    "threat-detection",
    [
      "threat-hunting",
      "detection-engineering",
      "security-investigation",
      "siem",
      "soc",
      "mitre-attack",
      "threat-intelligence",
      "endpoint-detection-and-response",
      "identity-threat-detection-and-response",
    ],
  ],
  [
    "security-investigation",
    [
      "incident-response",
      "forensics",
      "threat-hunting",
      "malware-analysis",
      "windows-forensics",
      "cloud-forensics",
      "soc",
    ],
  ],
  [
    "identity-threat-detection-and-response",
    [
      "identity-protection",
      "identity-based-attacks",
      "active-directory",
      "hybrid-identity",
      "endpoint-detection-and-response",
      "cybersecurity",
    ],
  ],
  ["identity-based-attacks", ["active-directory", "kerberos", "ntlm", "identity-protection"]],
  ["adversary-tradecraft", ["mitre-attack", "kill-chain", "malware-analysis", "threat-intelligence"]],
  ["detection-engineering", ["siem", "kql", "threat-hunting"]],
  ["forensics", ["windows-forensics", "cloud-forensics", "malware-analysis"]],
  ["enterprise-security", ["cybersecurity", "information-security", "zero-trust", "active-directory"]],
  ["active-directory", ["kerberos", "ntlm", "ldap", "windows-internals"]],
  ["kerberos", ["ntlm", "ldap"]],
  ["saml", ["oauth2", "single-sign-on"]],
  ["oauth2", ["single-sign-on", "jwt"]],

  // Networking
  ["networking", ["tcp-ip", "network-security", "packet-analysis", "osi-model", "dns", "firewall"]],
  ["tcp-ip", ["packet-analysis", "network-traffic-analysis", "osi-model", "dns"]],
  ["wireshark", ["packet-analysis", "network-traffic-analysis", "networking", "tcp-ip"]],
  ["network-security", ["firewall", "packet-analysis", "information-security"]],

  // Data and query languages
  ["sql", ["mysql", "postgresql", "mssql", "oracle", "sqlite", "kql", "cypher"]],
  ["kql", ["siem"]],
  ["pandas", ["python", "numpy", "data-analysis"]],

  // Web and platform, kept deliberately sparse
  ["react", ["react-native", "next", "jsx"]],
  ["node", ["express", "nest", "javascript"]],
  ["typescript", ["javascript"]],
  ["docker", ["kubernetes", "containers"]],
  ["kubernetes", ["docker", "helm"]],
  ["aws", ["cloud-security", "cloud-forensics"]],

  // AI tooling
  ["llm", ["prompt-engineering", "generative-ai", "rag"]],
  ["generative-ai", ["llm", "prompt-engineering"]],
  ["claude-code", ["llm", "generative-ai", "ai-assisted-coding"]],
  ["github-copilot", ["ai-assisted-coding", "generative-ai"]],
];

function buildRelations(): Readonly<Record<string, readonly string[]>> {
  const relations = new Map<string, Set<string>>();

  const link = (a: string, b: string): void => {
    if (a === b) return;
    const existing = relations.get(a);
    if (existing) existing.add(b);
    else relations.set(a, new Set([b]));
  };

  for (const [skill, related] of RELATION_SEEDS) {
    for (const other of related) {
      link(skill, other);
      // Mirrored so classification does not depend on which side was written.
      link(other, skill);
    }
  }

  const out: Record<string, readonly string[]> = {};
  for (const [skill, set] of relations) {
    out[skill] = [...set].sort();
  }
  return out;
}

export const SKILL_RELATIONS: Readonly<Record<string, readonly string[]>> =
  buildRelations();

/**
 * Pairs that must never be treated as related however they are asserted.
 *
 * These are the classic look-alikes: similar names, unrelated skills. The guard
 * applies to AI-asserted relations too, so a model claiming java relates to
 * javascript cannot manufacture credit.
 */
const NEVER_RELATED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["java", "javascript"],
  ["javascript", "c"],
  ["javascript", "c#"],
  ["java", "c"],
  ["mysql", "mongodb"],
  ["postgresql", "mongodb"],
  ["sql", "mongodb"],
  ["git", "github-actions"],
  ["c", "c#"],
  ["css", "c#"],
];

const NEVER_RELATED = new Set(
  NEVER_RELATED_PAIRS.map(([a, b]) => [a, b].sort().join("|"))
);

export function isNeverRelated(a: string, b: string): boolean {
  return NEVER_RELATED.has([a, b].sort().join("|"));
}

/** Canonical skills the curated map asserts a relation to. */
export function getCuratedRelations(canonicalSkill: string): readonly string[] {
  return SKILL_RELATIONS[canonicalSkill] ?? [];
}
