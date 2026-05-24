import type { ParsedResume, ParsedResumePersonalInfo } from "../services/ai/parsed-resume.types";

export interface AccountPersonalInfoSource {
  email: string;
  personalInfo?: {
    fullName?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedinUrl?: string | null;
    portfolioOrGithubUrl?: string | null;
  } | null;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function personalInfoFromAccount(
  user: AccountPersonalInfoSource
): ParsedResumePersonalInfo {
  const info = user.personalInfo ?? {};
  return {
    full_name: nullableString(info.fullName),
    email: nullableString(user.email),
    phone: nullableString(info.phone),
    location: nullableString(info.location),
    linkedin_url: nullableString(info.linkedinUrl),
    portfolio_or_github_url: nullableString(info.portfolioOrGithubUrl),
  };
}

export function withAccountPersonalInfo<T extends ParsedResume>(
  resume: T,
  user: AccountPersonalInfoSource
): T {
  return {
    ...resume,
    personal_info: personalInfoFromAccount(user),
  };
}
export function buildEmptyProfileWithPersonalInfo(
  user: AccountPersonalInfoSource
): ParsedResume {
  return {
    raw_text_hash: "",
    personal_info: personalInfoFromAccount(user),
    professional_summary: null,
    work_experience: [],
    education: [],
    skills: {
      technical_skills: [],
      soft_skills: [],
      tools_and_software: [],
    },
    projects: [],
    languages: [],
    certifications: [],
    awards: [],
    parsed_metadata: {
      language_detected: null,
      years_of_experience_estimate: 0,
    },
  };
}