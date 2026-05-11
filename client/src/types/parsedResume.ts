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
}
