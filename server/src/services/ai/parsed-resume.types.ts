/**
 * Stable backend contract for structured resume data.
 *
 * Produced by `parseResume` (AI service). Intended to be persisted directly
 * by Role 3 (Backend) as the canonical structured representation of a
 * candidate's resume.
 *
 * Every top-level key is REQUIRED. Unknown text becomes `null`, unknown
 * lists become `[]`. Callers can rely on the shape without optional-chain
 * dances.
 */

export interface ParsedResumePersonalInfo {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_or_github_url: string | null;
}

export interface ParsedResumeWorkExperience {
  company_name: string | null;
  job_title: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  responsibilities: string[];
  achievements: string[];
}

export interface ParsedResumeEducation {
  institution_name: string | null;
  degree_type: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ParsedResumeSkills {
  technical_skills: string[];
  soft_skills: string[];
  tools_and_software: string[];
}

export interface ParsedResumeProject {
  project_name: string | null;
  description: string | null;
  technologies_used: string[];
  link: string | null;
}

export interface ParsedResumeLanguage {
  language: string | null;
  proficiency_level: string | null;
}

export interface ParsedResumeCertification {
  name: string | null;
  issuer: string | null;
  date: string | null;
}

export interface ParsedResumeAward {
  title: string | null;
  issuer: string | null;
  date: string | null;
}

export type ParsedResumeLanguageDetected = "en" | "he" | "mixed" | "other" | null;

export interface ParsedResumeMetadata {
  language_detected: ParsedResumeLanguageDetected;
  years_of_experience_estimate: number;
}

/**
 * Skill the candidate likely has based on the resume but did NOT list
 * explicitly. Returned alongside the parsed resume so the UI can offer
 * the user a "you might also know..." review step. Never auto-applied
 * to the user's confirmed skills, never used in matching until the user
 * approves it.
 */
export interface SuggestedSkill {
  skill: string;
  reason: string;
  confidence: number;
}

export interface ParsedResume {
  raw_text_hash: string;
  personal_info: ParsedResumePersonalInfo;
  professional_summary: string | null;
  work_experience: ParsedResumeWorkExperience[];
  education: ParsedResumeEducation[];
  skills: ParsedResumeSkills;
  projects: ParsedResumeProject[];
  languages: ParsedResumeLanguage[];
  certifications: ParsedResumeCertification[];
  awards: ParsedResumeAward[];
  parsed_metadata: ParsedResumeMetadata;
  suggested_skills: SuggestedSkill[];
}
