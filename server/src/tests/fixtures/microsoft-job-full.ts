/**
 * Scenario B — full job description.
 *
 * A complete security-research posting for the same Identity Threat Detection
 * and Response role. This is the fixture that validates extraction recall: it
 * names concrete technologies across five groups (security research, identity
 * platform internals, programming and query languages, AI tooling, forensics)
 * and also carries the noise that must stay out of the skill arrays — years of
 * experience, a degree requirement and soft/leadership asks.
 *
 * Provenance: reconstructed from the technology inventory recorded while
 * reviewing the real posting, not copied from Microsoft's careers site. It is a
 * test input only and is never shown to users. See ./README.md.
 */

export const MICROSOFT_FULL_DESCRIPTION = `Senior Security Researcher — Identity Threat Detection and Response (ITDR)

Come build one of Microsoft's most exciting security products: Identity Threat Detection and Response (ITDR). As cyber-attacks grow more sophisticated, we help enterprises detect, investigate, and autonomously protect against advanced identity-based attacks and data breaches — from nation-state actors to large-scale ransomware operators. Our research team combines deep knowledge of the attacker landscape and tradecraft to deliver the innovations needed to uncover and stop even the most well-funded adversaries.

Responsibilities

- Perform security research and threat hunting across hybrid identity environments to uncover novel identity-based attacks.
- Own end-to-end investigation of suspected compromise, from initial signal to a documented attacker kill-chain mapped to MITRE ATT&CK.
- Drive detection engineering: author, tune and validate detections that catch attacker tradecraft rather than single indicators.
- Reverse engineer authentication and directory protocol abuse, including Kerberos, NTLM, LDAP, OAuth2 and SAML.
- Analyse large volumes of security telemetry with KQL, SQL and Cypher to separate real attacks from noise.
- Build research tooling and automation in Python, C# and C++.
- Apply generative AI to the research workflow — AI assisted investigation, AI assisted coding and AI assisted detection authoring — using GitHub Copilot, Security Copilot, ChatGPT and Claude, with careful prompt design and rigorous model output validation.
- Contribute Windows forensics and cloud forensics expertise to incident deep dives.
- Partner with product teams to turn research findings into identity protection features shipped to enterprise customers.
- Mentor junior researchers and represent the team's findings to senior stakeholders.

Required qualifications

- 5+ years of experience in cyber security, security research, threat detection or incident response.
- BSc in Computer Science, Software Engineering or equivalent practical experience.
- Deep understanding of Windows internals and of how identity and authentication work in hybrid identity deployments.
- Strong programming ability in Python and at least one of C# or C++.
- Hands-on experience investigating ransomware and other high-impact intrusions.
- Excellent written and verbal communication skills in English.
- Proven team player who thrives in a highly collaborative research environment.

Preferred qualifications

- Experience authoring detections at scale and measuring their precision and recall in production.
- Familiarity with graph query languages such as Cypher for modelling identity relationships.
- Prior work applying large language models to security investigation or detection authoring.
- Experience with cloud forensics across more than one cloud provider.
- Public security research output: conference talks, CVEs or published tooling.

Benefits

Microsoft offers competitive compensation, comprehensive healthcare, generous parental leave, an annual learning stipend and flexible hybrid working. Microsoft is an equal opportunity employer.`;

/**
 * Terms the full posting explicitly contains, grouped the way Scenario B's
 * recall assertions consume them. Kept next to the text so a change to the
 * posting that drops a technology fails loudly instead of silently weakening
 * the recall test.
 */
export const MICROSOFT_FULL_EXPECTED_TERMS = {
  securityResearch: [
    "cyber security",
    "identity-based attacks",
    "identity threat detection and response",
    "threat hunting",
    "investigation",
    "detection engineering",
    "detection authoring",
    "attacker tradecraft",
    "attacker kill-chain",
    "mitre att&ck",
    "ransomware",
    "identity protection",
    "security research",
  ],
  identityPlatform: [
    "windows internals",
    "kerberos",
    "ntlm",
    "ldap",
    "oauth2",
    "saml",
    "hybrid identity",
  ],
  programmingAndData: ["c#", "python", "c++", "kql", "sql", "cypher"],
  aiTooling: [
    "generative ai",
    "github copilot",
    "security copilot",
    "chatgpt",
    "claude",
    "prompt design",
    "model output validation",
    "ai assisted investigation",
    "ai assisted coding",
    "ai assisted detection authoring",
  ],
  forensics: ["windows forensics", "cloud forensics"],
} as const;

/**
 * Phrases that appear in the posting but are not skills. Extraction must keep
 * every one of these out of requiredSkills, advantageSkills and toolsMentioned.
 */
export const MICROSOFT_FULL_NON_SKILL_PHRASES = [
  "5+ years of experience",
  "bsc in computer science",
  "excellent written and verbal communication skills",
  "team player",
  "mentor junior researchers",
  "equal opportunity employer",
] as const;

/**
 * Raw `analyzeJob` output recorded against real Gemini for the full posting,
 * kept verbatim so the recall assertions run offline. Compare it with the
 * four-skill result the partial paragraph produced: the difference is what a
 * complete description buys, and it is an input difference, not a model defect.
 */
export const MICROSOFT_FULL_RECORDED_RAW_RESPONSE = `{
  "roleTitle": "Senior Security Researcher — Identity Threat Detection and Response",
  "requiredSkills": [
    "security-research",
    "threat-hunting",
    "detection-engineering",
    "reverse-engineering",
    "security-telemetry-analysis",
    "windows-internals",
    "identity-management",
    "python",
    "c-sharp",
    "c-plus-plus",
    "incident-response"
  ],
  "advantageSkills": [
    "cloud-forensics",
    "large-language-models",
    "graph-query-languages"
  ],
  "toolsMentioned": [
    "kerberos",
    "ntlm",
    "ldap",
    "oauth2",
    "saml",
    "kql",
    "sql",
    "cypher",
    "python",
    "c#",
    "c++",
    "github-copilot",
    "security-copilot",
    "chatgpt",
    "claude",
    "mitre-att&ck"
  ],
  "impliedSkills": [
    "authentication-protocols",
    "threat-analysis",
    "windows-forensics"
  ],
  "nonSkillRequirements": [
    "5+ years of experience in cyber security, security research, threat detection or incident response",
    "BSc in Computer Science, Software Engineering or equivalent practical experience",
    "Excellent written and verbal communication skills in English",
    "Proven team player who thrives in a highly collaborative research environment",
    "Mentor junior researchers and represent the team's findings to senior stakeholders"
  ],
  "skillRelations": {
    "security-research": [
      "threat-hunting",
      "vulnerability-research",
      "security-investigation",
      "malware-analysis"
    ],
    "threat-hunting": [
      "security-research",
      "threat-detection",
      "security-investigation"
    ],
    "detection-engineering": [
      "threat-detection",
      "rule-authoring",
      "security-monitoring"
    ],
    "reverse-engineering": [
      "malware-analysis",
      "binary-analysis",
      "protocol-analysis"
    ],
    "security-telemetry-analysis": [
      "log-analysis",
      "siem",
      "data-analysis"
    ],
    "windows-internals": [
      "windows-os",
      "operating-systems",
      "windows-forensics"
    ],
    "identity-management": [
      "active-directory",
      "authentication",
      "access-control"
    ],
    "python": [
      "scripting",
      "programming"
    ],
    "c-sharp": [
      "dotnet",
      "programming"
    ],
    "c-plus-plus": [
      "cpp",
      "programming"
    ],
    "incident-response": [
      "forensics",
      "threat-investigation",
      "crisis-management"
    ],
    "cloud-forensics": [
      "digital-forensics",
      "cloud-security",
      "incident-response"
    ],
    "large-language-models": [
      "generative-ai",
      "machine-learning",
      "ai"
    ],
    "graph-query-languages": [
      "cypher",
      "database-queries"
    ]
  },
  "seniorityLevel": "senior",
  "summary": "Microsoft is seeking a Senior Security Researcher to join the Identity Threat Detection and Response team to uncover advanced identity-based attacks, perform threat hunting, and develop detections and research tooling. The role involves reversing authentication protocols, analyzing security telemetry, applying generative AI to workflows, and collaborating with product teams to protect enterprise customers."
}`;
