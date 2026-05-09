// Deterministic adapter that turns a ParsedResume into enriched matching
// inputs. Pure function: same input → same output, no AI calls, no I/O.
//
// The goal is to strengthen the deterministic side of `calculateMatch`
// by widening the candidate's skill set with skills the resume reveals
// (technical_skills + tools_and_software + every project's
// technologies_used). Everything is normalized through the existing
// skill alias dictionary so "React.js", "reactjs", and "react" collapse
// to a single canonical entry.

import type { ParsedResume } from "../ai/parsed-resume.types";
import { normalizeSkills } from "./skills-normalizer";

export interface ResumeEnrichment {
  readonly enrichedSkills: string[];
  readonly projectTechnologies: string[];
  readonly experienceYears: number;
  readonly educationSummary: string;
  readonly topProjectsSummary: string;
  readonly workExperienceSummary: string;
  readonly languagesSummary: string;
}

function compactString(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function joinFiltered(parts: Array<string>, sep: string): string {
  return parts.filter((p) => p !== "").join(sep);
}

function summarizeEducation(resume: ParsedResume): string {
  const first = resume.education.slice(0, 2);
  const parts: string[] = [];
  for (const e of first) {
    const left = joinFiltered(
      [compactString(e.degree_type), compactString(e.field_of_study)],
      " "
    );
    const right = compactString(e.institution_name);
    const combined = joinFiltered([left, right], ", ");
    if (combined !== "") {
      parts.push(combined);
    }
  }
  return parts.join("; ");
}

function summarizeTopProjects(resume: ParsedResume): string {
  const first = resume.projects.slice(0, 3);
  const parts: string[] = [];
  for (const p of first) {
    const name = compactString(p.project_name) || "Untitled project";
    const tech = p.technologies_used.filter((t) => t !== "").join(", ");
    parts.push(tech === "" ? name : `${name} (${tech})`);
  }
  return parts.join("; ");
}

function summarizeWorkExperience(resume: ParsedResume): string {
  const first = resume.work_experience.slice(0, 5);
  const lines: string[] = [];
  for (const w of first) {
    const title = compactString(w.job_title) || "Role";
    const company = compactString(w.company_name) || "Unknown company";
    const start = compactString(w.start_date);
    const end = compactString(w.end_date);
    const period = start === "" && end === ""
      ? ""
      : `(${[start, end].filter((s) => s !== "").join(" - ")})`;
    lines.push(joinFiltered([`${title} @ ${company}`, period], " "));
  }
  return lines.join("; ");
}

function summarizeLanguages(resume: ParsedResume): string {
  const parts: string[] = [];
  for (const l of resume.languages) {
    const lang = compactString(l.language);
    if (lang === "") continue;
    const level = compactString(l.proficiency_level);
    parts.push(level === "" ? lang : `${lang} (${level})`);
  }
  return parts.join(", ");
}

/**
 * Produce enriched matching inputs from a ParsedResume.
 *
 * `enrichedSkills` merges technical_skills + tools_and_software + every
 * project's technologies_used, all run through `normalizeSkills` for
 * dedupe + aliasing. `experienceYears` is read from
 * `parsed_metadata.years_of_experience_estimate` and floored to 0 if
 * missing / negative. All summary strings are safe to embed in a prompt
 * body — they never contain newlines that could break JSON formatting.
 */
export function enrichFromResume(resume: ParsedResume): ResumeEnrichment {
  const raw: string[] = [];
  raw.push(...resume.skills.technical_skills);
  raw.push(...resume.skills.tools_and_software);
  for (const project of resume.projects) {
    raw.push(...project.technologies_used);
  }

  const enrichedSkills = normalizeSkills(raw);
  const projectTechnologies = normalizeSkills(
    resume.projects.flatMap((p) => p.technologies_used)
  );

  const rawYears = resume.parsed_metadata.years_of_experience_estimate;
  const experienceYears =
    Number.isFinite(rawYears) && rawYears > 0 ? Math.round(rawYears) : 0;

  return {
    enrichedSkills,
    projectTechnologies,
    experienceYears,
    educationSummary: summarizeEducation(resume),
    topProjectsSummary: summarizeTopProjects(resume),
    workExperienceSummary: summarizeWorkExperience(resume),
    languagesSummary: summarizeLanguages(resume),
  };
}

/**
 * Merge a caller's ProfileInput.skills with the skills extracted from a
 * ParsedResume. Order is preserved (profile-first), duplicates removed
 * after normalization. Either side can be omitted.
 */
export function mergeProfileSkillsWithResume(
  profileSkills: readonly string[] | undefined,
  enrichment: ResumeEnrichment | undefined
): string[] {
  const combined: string[] = [];
  if (profileSkills && profileSkills.length > 0) {
    combined.push(...profileSkills);
  }
  if (enrichment && enrichment.enrichedSkills.length > 0) {
    combined.push(...enrichment.enrichedSkills);
  }
  return normalizeSkills(combined);
}
