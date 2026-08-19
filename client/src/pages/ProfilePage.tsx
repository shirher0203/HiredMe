import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { MultilineListField } from "../components/MultilineListField";
import { getAuthSession } from "../services/auth";
import { getUserProfile, parseCv, saveUserProfile } from "../services/profile";
import { sanitizeList } from "../utils/listText";
import type {
  ParsedResume,
  ParsedResumeEducation,
  ParsedResumePersonalInfo,
  ParsedResumeProject,
  ParsedResumeWorkExperience,
} from "../types/parsedResume";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const emptyProfile: ParsedResume = {
  raw_text_hash: "",
  personal_info: {
    full_name: null,
    email: null,
    phone: null,
    location: null,
    linkedin_url: null,
    portfolio_or_github_url: null,
  },
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

const emptyWork: ParsedResumeWorkExperience = {
  company_name: null,
  job_title: null,
  start_date: null,
  end_date: null,
  location: null,
  responsibilities: [],
  achievements: [],
};

const emptyEducation: ParsedResumeEducation = {
  institution_name: null,
  degree_type: null,
  field_of_study: null,
  start_date: null,
  end_date: null,
};

const emptyProject: ParsedResumeProject = {
  project_name: null,
  description: null,
  technologies_used: [],
  link: null,
};

function text(value: string | null): string {
  return value ?? "";
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Trims and drops empty entries in every list the profile form can edit.
 * Applied on save so the payload sent to the server never carries the blank
 * lines a user leaves behind while typing.
 */
function sanitizeProfileLists(profile: ParsedResume): ParsedResume {
  return {
    ...profile,
    work_experience: profile.work_experience.map((entry) => ({
      ...entry,
      responsibilities: sanitizeList(entry.responsibilities),
      achievements: sanitizeList(entry.achievements),
    })),
    skills: {
      technical_skills: sanitizeList(profile.skills.technical_skills),
      soft_skills: sanitizeList(profile.skills.soft_skills),
      tools_and_software: sanitizeList(profile.skills.tools_and_software),
    },
    projects: profile.projects.map((entry) => ({
      ...entry,
      technologies_used: sanitizeList(entry.technologies_used),
    })),
  };
}


function normalizePersonalInfo(
  personalInfo: Partial<ParsedResumePersonalInfo> | null | undefined
): ParsedResumePersonalInfo {
  return {
    full_name: personalInfo?.full_name ?? null,
    email: personalInfo?.email ?? null,
    phone: personalInfo?.phone ?? null,
    location: personalInfo?.location ?? null,
    linkedin_url: personalInfo?.linkedin_url ?? null,
    portfolio_or_github_url: personalInfo?.portfolio_or_github_url ?? null,
  };
}

function applyPersonalInfo(
  profile: ParsedResume,
  personalInfo?: Partial<ParsedResumePersonalInfo> | null
): ParsedResume {
  return {
    ...profile,
    personal_info: normalizePersonalInfo(personalInfo ?? profile.personal_info),
  };
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <div className="flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
        {value ?? "Not provided"}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <input
        value={text(value)}
        onChange={(event) => onChange(nullable(event.target.value))}
        placeholder={placeholder}
        className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  rows?: number;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <textarea
        value={text(value)}
        onChange={(event) => onChange(nullable(event.target.value))}
        rows={rows}
        className="resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function ChipList({ values }: { values: string[] }) {
  if (values.length === 0) return <p className="text-sm text-slate-500">No items yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<ParsedResume | null>(null);
  const [accountPersonalInfo, setAccountPersonalInfo] =
    useState<ParsedResumePersonalInfo>(normalizePersonalInfo(emptyProfile.personal_info));
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useMemo(() => getAuthSession(), []);

  const parseStatus = useMemo(() => {
    if (!isParsing) return "";
    return "Extracting text... Structuring profile... Almost done...";
  }, [isParsing]);

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      if (!session) {
        setIsLoading(false);
        return;
      }

      try {
        const saved = await getUserProfile();
        if (!alive) return;
        const personalInfo = normalizePersonalInfo(saved.personalInfo);
        setAccountPersonalInfo(personalInfo);
        setProfile(saved.profile ? applyPersonalInfo(saved.profile, personalInfo) : null);
        setIsEditing(!saved.profile);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    void loadProfile();

    return () => {
      alive = false;
    };
  }, [session]);

  function updateProfile(next: (current: ParsedResume) => ParsedResume) {
    setProfile((current) => next(current ?? emptyProfile));
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("PDF file must be 5MB or smaller.");
      return;
    }

    setIsParsing(true);
    try {
      const parsed = await parseCv(file);
      const personalInfo = normalizePersonalInfo(parsed.personal_info);
      setAccountPersonalInfo(personalInfo);
      setProfile(applyPersonalInfo(parsed, personalInfo));
      setIsEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CV.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setError(null);
    setIsSaving(true);
    try {
      const saved = await saveUserProfile(sanitizeProfileLists(current));
      setProfile(saved);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      </section>
    );
  }

  const current = applyPersonalInfo(profile ?? emptyProfile, accountPersonalInfo);

  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Upload a PDF CV, review the extracted details, and save the verified profile.
          </p>
        </div>
        {profile && !isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Edit
          </button>
        ) : null}
      </div>

      <div className="mb-6 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/60 p-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-center">
          <span className="text-sm font-semibold text-indigo-900">
            {isParsing ? parseStatus : "Upload CV (PDF)"}
          </span>
          <span className="text-xs text-indigo-700">PDF only, up to 5MB</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFileChange}
            disabled={isParsing}
            className="sr-only"
          />
          <span className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
            {isParsing ? "Processing..." : "Choose file"}
          </span>
        </label>
      </div>

      {error ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isEditing ? (
        <form onSubmit={handleSave} className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Personal Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="Full name" value={current.personal_info.full_name} />
              <ReadOnlyField label="Email" value={current.personal_info.email} />
              <ReadOnlyField label="Phone" value={current.personal_info.phone} />
              <ReadOnlyField label="Location" value={current.personal_info.location} />
              <ReadOnlyField label="LinkedIn URL" value={current.personal_info.linkedin_url} />
              <ReadOnlyField
                label="Portfolio/GitHub URL"
                value={current.personal_info.portfolio_or_github_url}
              />
            </div>
          </section>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Professional Summary</h2>
            <TextArea
              label="Summary"
              value={current.professional_summary}
              onChange={(value) =>
                updateProfile((p) => ({ ...p, professional_summary: value }))
              }
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">Work Experience</h2>
              <button
                type="button"
                onClick={() =>
                  updateProfile((p) => ({
                    ...p,
                    work_experience: [...p.work_experience, emptyWork],
                  }))
                }
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Add Experience
              </button>
            </div>
            {current.work_experience.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {([
                    ["Company", "company_name"],
                    ["Job title", "job_title"],
                    ["Start date", "start_date"],
                    ["End date", "end_date"],
                    ["Location", "location"],
                  ] as const).map(([label, key]) => (
                    <Field
                      key={key}
                      label={label}
                      value={item[key]}
                      onChange={(value) =>
                        updateProfile((p) => ({
                          ...p,
                          work_experience: p.work_experience.map((entry, i) =>
                            i === index ? { ...entry, [key]: value } : entry
                          ),
                        }))
                      }
                    />
                  ))}
                </div>
                <MultilineListField
                  label="Responsibilities"
                  values={item.responsibilities}
                  onChange={(values) =>
                    updateProfile((p) => ({
                      ...p,
                      work_experience: p.work_experience.map((entry, i) =>
                        i === index ? { ...entry, responsibilities: values } : entry
                      ),
                    }))
                  }
                />
                <MultilineListField
                  label="Achievements"
                  values={item.achievements}
                  onChange={(values) =>
                    updateProfile((p) => ({
                      ...p,
                      work_experience: p.work_experience.map((entry, i) =>
                        i === index ? { ...entry, achievements: values } : entry
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    updateProfile((p) => ({
                      ...p,
                      work_experience: p.work_experience.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-sm font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">Education</h2>
              <button
                type="button"
                onClick={() =>
                  updateProfile((p) => ({ ...p, education: [...p.education, emptyEducation] }))
                }
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Add Education
              </button>
            </div>
            {current.education.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {([
                    ["Institution", "institution_name"],
                    ["Degree type", "degree_type"],
                    ["Field of study", "field_of_study"],
                    ["Start date", "start_date"],
                    ["End date", "end_date"],
                  ] as const).map(([label, key]) => (
                    <Field
                      key={key}
                      label={label}
                      value={item[key]}
                      onChange={(value) =>
                        updateProfile((p) => ({
                          ...p,
                          education: p.education.map((entry, i) =>
                            i === index ? { ...entry, [key]: value } : entry
                          ),
                        }))
                      }
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateProfile((p) => ({
                      ...p,
                      education: p.education.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-sm font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Skills & Technologies</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["Technical skills", "technical_skills"],
                ["Soft skills", "soft_skills"],
                ["Tools/software", "tools_and_software"],
              ] as const).map(([label, key]) => (
                <MultilineListField
                  key={key}
                  label={label}
                  rows={6}
                  values={current.skills[key]}
                  onChange={(values) =>
                    updateProfile((p) => ({
                      ...p,
                      skills: { ...p.skills, [key]: values },
                    }))
                  }
                  hint="One skill per line."
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">Projects</h2>
              <button
                type="button"
                onClick={() =>
                  updateProfile((p) => ({ ...p, projects: [...p.projects, emptyProject] }))
                }
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Add Project
              </button>
            </div>
            {current.projects.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Project name"
                    value={item.project_name}
                    onChange={(value) =>
                      updateProfile((p) => ({
                        ...p,
                        projects: p.projects.map((entry, i) =>
                          i === index ? { ...entry, project_name: value } : entry
                        ),
                      }))
                    }
                  />
                  <Field
                    label="Link"
                    value={item.link}
                    onChange={(value) =>
                      updateProfile((p) => ({
                        ...p,
                        projects: p.projects.map((entry, i) =>
                          i === index ? { ...entry, link: value } : entry
                        ),
                      }))
                    }
                  />
                </div>
                <TextArea
                  label="Description"
                  value={item.description}
                  onChange={(value) =>
                    updateProfile((p) => ({
                      ...p,
                      projects: p.projects.map((entry, i) =>
                        i === index ? { ...entry, description: value } : entry
                      ),
                    }))
                  }
                />
                <MultilineListField
                  label="Technologies used"
                  values={item.technologies_used}
                  onChange={(values) =>
                    updateProfile((p) => ({
                      ...p,
                      projects: p.projects.map((entry, i) =>
                        i === index ? { ...entry, technologies_used: values } : entry
                      ),
                    }))
                  }
                  hint="One technology per line."
                />
                <button
                  type="button"
                  onClick={() =>
                    updateProfile((p) => ({
                      ...p,
                      projects: p.projects.filter((_, i) => i !== index),
                    }))
                  }
                  className="text-sm font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white/90 py-4 backdrop-blur">
            {profile ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isSaving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-950">Personal Information</h2>
            <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <p><strong>Name:</strong> {current.personal_info.full_name ?? "Not provided"}</p>
              <p><strong>Email:</strong> {current.personal_info.email ?? "Not provided"}</p>
              <p><strong>Phone:</strong> {current.personal_info.phone ?? "Not provided"}</p>
              <p><strong>Location:</strong> {current.personal_info.location ?? "Not provided"}</p>
              <p><strong>LinkedIn:</strong> {current.personal_info.linkedin_url ?? "Not provided"}</p>
              <p><strong>Portfolio/GitHub:</strong> {current.personal_info.portfolio_or_github_url ?? "Not provided"}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-950">Professional Summary</h2>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
              {current.professional_summary ?? "No summary yet."}
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Work Experience</h2>
            {current.work_experience.length === 0 ? (
              <p className="text-sm text-slate-500">No work experience yet.</p>
            ) : (
              current.work_experience.map((item, index) => (
                <article key={index} className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">
                    {item.job_title ?? "Role"} at {item.company_name ?? "Company"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {[item.start_date, item.end_date, item.location].filter(Boolean).join(" | ")}
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {[...item.responsibilities, ...item.achievements].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
              ))
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Education</h2>
            {current.education.length === 0 ? (
              <p className="text-sm text-slate-500">No education yet.</p>
            ) : (
              current.education.map((item, index) => (
                <article key={index} className="rounded-lg border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">
                    {item.degree_type ?? "Degree"} in {item.field_of_study ?? "Field"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">{item.institution_name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {[item.start_date, item.end_date].filter(Boolean).join(" - ")}
                  </p>
                </article>
              ))
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-950">Skills & Technologies</h2>
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Technical</h3>
                <ChipList values={current.skills.technical_skills} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Soft Skills</h3>
                <ChipList values={current.skills.soft_skills} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Tools</h3>
                <ChipList values={current.skills.tools_and_software} />
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
