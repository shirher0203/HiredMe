# AI Service Contract

This document is the integration contract between Role 4 (AI & Logic) and
Role 3 (Backend). Role 4 exports pure service functions that take plain
TypeScript objects and return plain TypeScript objects. The Backend Lead
calls these from controllers and owns persistence, HTTP, and auth.

---

## 1. Overview

The `ai.service` module provides nine AI-powered services:

- **Profile analysis** — turn a user's profile into a structured summary.
- **Job analysis** — extract required/advantage skills and seniority from a
  free-text job description.
- **Match scoring** — compute how well a profile fits a job, as a
  deterministic score combined with an AI semantic sub-score.
- **Interview question generation** — produce a batch of questions tailored
  to the user and (optionally) the target job.
- **Answer evaluation** — score a single interview answer and return
  feedback.
- **Resume parsing** — convert free-text resume content into a strictly
  validated `ParsedResume` that the Backend may persist directly.
- **Interview attempt summary** — summarize a completed interview/practice
  attempt into summary, preserve points, improve points, topics, and a
  deterministic overall score.
- **Home assignment evaluation** — score an uploaded code submission and
  return structured strengths/improvements feedback.
- **GitHub repo analysis** — analyze repository metadata, README, and
  `package.json` into an architecture summary, code-quality score, and
  detected stack.

Two runtime modes are supported. **Real Gemini is the default.** Mock
mode is only a developer / test convenience and must be opted into
explicitly.

- **Real mode (Gemini) — default.** `ai.client.ts` calls the Gemini API.
  Responses are parsed by `safe-json.ts`, then validated and clamped
  inside `ai.service.ts`. Requires `GEMINI_API_KEY` to be set. If the key
  is missing, every AI call throws — the system does **not** fall back to
  mock data silently.
- **Mock mode — opt-in, only when `USE_MOCK_AI === "true"`.** No external
  calls. Deterministic mock responses are returned immediately.
  `calculateMatch` still runs the deterministic matching formula against
  the provided profile and job, so mock mode exercises the real scoring
  path end-to-end. Intended for automated tests and offline development.

All functions are async and return plain objects — no streaming, no
side effects, no DB writes.

---

## 2. Available functions

All functions are importable from `server/src/services/ai/ai.service.ts`.

### 2.1 `analyzeProfile`

```ts
analyzeProfile(profile: ProfileInput): Promise<ProfileAnalysis>
```

**Input — `ProfileInput`**

| Field             | Type                  | Notes                                       |
| ----------------- | --------------------- | ------------------------------------------- |
| `skills`          | `string[]`            | Skills the user claims (free-form casing).  |
| `experienceYears` | `number`              | Years of professional experience.           |
| `projects`        | `string[]`            | Short project descriptions.                 |
| `education`       | `string?` (optional)  | One-line education summary.                 |
| `goals`           | `string?` (optional)  | One-line career-goal summary.               |

**Output — `ProfileAnalysis`**

| Field               | Type                               | Meaning                                                                 |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `seniorityEstimate` | `"junior" \| "mid" \| "senior"`    | AI's read on the overall seniority signal from the profile.             |
| `strengths`         | `string[]`                         | Highlighted strong areas.                                               |
| `weaknesses`        | `string[]`                         | Gaps or weaker areas worth improving.                                   |
| `suggestedRoles`    | `string[]`                         | Role titles the candidate is a reasonable fit for today.                |
| `summary`           | `string`                           | One-to-two-sentence human-readable summary of the candidate.            |

**Example**

```json
{
  "seniorityEstimate": "junior",
  "strengths": ["react", "node", "typescript"],
  "weaknesses": ["system design", "large-scale architecture"],
  "suggestedRoles": [
    "Junior Full-Stack Developer",
    "Junior Frontend Developer"
  ],
  "summary": "A junior full-stack developer comfortable building React + Node features with TypeScript."
}
```

---

### 2.2 `analyzeJob`

```ts
analyzeJob(jobDescription: string): Promise<JobAnalysis>
```

**Input**

- `jobDescription: string` — the raw job ad, in English or Hebrew.

**Output — `JobAnalysis`**

| Field             | Type                              | Meaning                                                                  |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `roleTitle`       | `string`                          | Normalized role title extracted from the description.                    |
| `requiredSkills`  | `string[]`                        | Skills the role requires. Lower-cased, alias-normalizable downstream.    |
| `advantageSkills` | `string[]`                        | "Nice-to-have" skills.                                                   |
| `seniorityLevel`  | `"junior" \| "mid" \| "senior"`   | Seniority tier inferred from the description.                            |
| `summary`         | `string`                          | One-sentence summary of the role.                                        |

**Example**

```json
{
  "roleTitle": "Junior Full-Stack Developer",
  "requiredSkills": ["react", "node", "mongodb", "typescript"],
  "advantageSkills": ["docker", "aws"],
  "seniorityLevel": "junior",
  "summary": "Junior full-stack role building React and Node features on a MongoDB-backed TypeScript stack."
}
```

---

### 2.3 `calculateMatch`

```ts
calculateMatch(
  profile: ProfileInput,
  jobAnalysis: JobAnalysis,
  resume?: ParsedResume
): Promise<MatchAnalysis>
```

**Input**

- `profile: ProfileInput` — see 2.1.
- `jobAnalysis: JobAnalysis` — normally the output of `analyzeJob`.
- `resume?: ParsedResume` — optional. When provided, `calculateMatch`
  switches to the resume-aware path: skills are enriched from the
  resume, the AI receives richer context, and the returned
  `MatchAnalysis` gets the qualitative `...Fit` / `resumeInsights` /
  `matchingEvidence` fields. When omitted, behavior is identical to
  V1.

**Output — `MatchAnalysis`**

| Field               | Type        | Meaning                                                                                         |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `algorithmicScore`  | `number`    | 0-100. Deterministic skill-overlap score: `round(matchedRequired / requiredSkills * 100)`.      |
| `aiSemanticScore`   | `number`    | 0-100. AI's semantic-similarity sub-score, clamped and rounded.                                 |
| `finalScore`        | `number`    | 0-100. See formula below.                                                                       |
| `matchedRequired`   | `string[]`  | Required skills the profile has, in canonical (normalized) form.                                |
| `missingRequired`   | `string[]`  | Required skills the profile is missing, in canonical form.                                      |
| `matchedAdvantage`  | `string[]`  | Advantage skills the profile has, in canonical form.                                            |
| `explanation`       | `string`    | Short text from the AI explaining the semantic score.                                           |
| `educationFit?`     | `string`    | Resume-aware only. Short sentence on how the candidate's education fits the role.               |
| `experienceFit?`    | `string`    | Resume-aware only. Short sentence on how the candidate's experience fits the role.              |
| `projectFit?`       | `string`    | Resume-aware only. Short sentence on how the candidate's projects cover the required stack.     |
| `languageFit?`      | `string`    | Resume-aware only. Short sentence on spoken/written language fit.                               |
| `resumeInsights?`   | `string[]`  | Resume-aware only. 0-5 notable signals (strengths or gaps).                                     |
| `matchingEvidence?` | `string[]`  | Resume-aware only. 0-5 concrete resume items that justify the score.                            |

The six `...?` fields are **only present** when `calculateMatch` is
called with a `ParsedResume`. Callers that never pass a resume get the
exact V1 shape — no `undefined` keys added.

**Final score formula (authoritative)**

```
finalScore = round(0.7 * algorithmicScore + 0.3 * aiSemanticScore)
finalScore = clamp(finalScore, 0, 100)
```

- 70% of the result is deterministic skill overlap.
- 30% is the AI's semantic sub-score.
- The AI never produces `finalScore` directly — it only contributes
  `aiSemanticScore`. The combination happens in `matching.service.ts`.
- The resume-aware path does **not** change the weighting. The extra
  `...Fit` fields are qualitative context for the UI and the
  lecturer's explainability concerns; they never feed back into the
  numeric score. Future iterations may revisit the 70/30 split.

**Resume-aware enrichment (when `resume` is provided)**

- `profile.skills` is merged with a deterministic adapter output:
  - `resume.skills.technical_skills`
  - `resume.skills.tools_and_software`
  - every `resume.projects[].technologies_used`
- All merged skills pass through `normalizeSkills` for aliasing and
  dedupe. Profile-provided skills come first; resume-only skills are
  appended.
- The merged list is what both `calculateSkillOverlap` and the AI
  prompt see. This is why candidates with strong project portfolios
  get a higher `algorithmicScore` when their projects advertise the
  job's required technologies.
- `experienceYears` is read from
  `resume.parsed_metadata.years_of_experience_estimate` (floored to
  `>= 0`) and sent to the AI as context. There is no deterministic
  experience math — education, work history, and languages are
  evaluated qualitatively by the AI and surface as the optional
  `...Fit` / `resumeInsights` / `matchingEvidence` fields.

**Defensive defaults.** If `profile.skills`, `jobAnalysis.requiredSkills`,
or `jobAnalysis.advantageSkills` are missing at runtime, they are treated
as `[]` so `calculateMatch` never throws on slightly malformed inputs
from the database. Resume sections that are empty arrays or `null`
fields also never cause a throw — they just do not contribute to the
enrichment.

**Example — resume-aware input → output**

```json
// Input (abridged)
{
  "profile": { "skills": ["React.js", "typescript"], "experienceYears": 1, "projects": [] },
  "jobAnalysis": {
    "roleTitle": "Junior Full-Stack Developer",
    "requiredSkills": ["react", "node", "mongodb", "typescript"],
    "advantageSkills": ["docker", "aws"],
    "seniorityLevel": "junior",
    "summary": "Junior full-stack role."
  },
  "resume": {
    "skills": {
      "technical_skills": ["React.js", "Node", "typescript", "MongoDB"],
      "tools_and_software": ["Docker", "Git"],
      "soft_skills": ["communication"]
    },
    "projects": [
      {
        "project_name": "HiredMe",
        "technologies_used": ["reactjs", "node.js", "mongodb", "typescript"],
        "description": null, "link": null
      }
    ],
    "parsed_metadata": { "language_detected": "en", "years_of_experience_estimate": 1 }
  }
}
```

```json
// Output
{
  "finalScore": 92,
  "algorithmicScore": 100,
  "aiSemanticScore": 74,
  "matchedRequired": ["react", "node", "mongodb", "typescript"],
  "missingRequired": [],
  "matchedAdvantage": ["docker"],
  "explanation": "Solid overlap on the core stack; project work demonstrates the required technologies end-to-end.",
  "educationFit": "BSc in Computer Science from Tel Aviv University aligns with the junior requirement.",
  "experienceFit": "One year of hands-on full-stack work matches the 0-2 years target window.",
  "projectFit": "The HiredMe project exercises React, Node, MongoDB and TypeScript together — direct evidence for every required skill.",
  "languageFit": "English fluency covers the team's working language.",
  "resumeInsights": [
    "Project portfolio compensates for the short formal work history.",
    "No explicit Docker / AWS exposure despite them being advantage skills."
  ],
  "matchingEvidence": [
    "Acme Labs internal dashboard built with React + TypeScript.",
    "HiredMe project uses React, Node, MongoDB and TypeScript end-to-end."
  ]
}
```

Note how `matchedRequired` is a perfect 4/4 even though the
`ProfileInput.skills` only listed React and TypeScript: the resume's
technical skills + project technologies filled in Node and MongoDB
before the overlap was computed.

---

### 2.4 `generateInterviewQuestions`

```ts
generateInterviewQuestions(input: GenerateQuestionsInput): Promise<{ questions: InterviewQuestion[] }>
```

**Input — `GenerateQuestionsInput`**

| Field              | Type                        | Notes                                                          |
| ------------------ | --------------------------- | -------------------------------------------------------------- |
| `interviewType`    | `"hr" \| "technical"`       | Interview kind — drives tone and topic mix.                    |
| `profileSkills`    | `string[]`                  | Skills the candidate knows.                                    |
| `jobRequiredSkills`| `string[]?` (optional)      | Job-side skills when interviewing for a specific role.         |
| `count`            | `number`                    | Desired number of questions.                                   |
| `language`         | `"en" \| "he"?` (optional)  | Defaults to `"en"`.                                            |

**Output**

`{ questions: InterviewQuestion[] }`, where each `InterviewQuestion` has:

| Field           | Type     | Meaning                                                                    |
| --------------- | -------- | -------------------------------------------------------------------------- |
| `id`            | `string` | Stable id. If the model omits it, Role 4 fills `"q1"`, `"q2"`, ... in order.|
| `question`      | `string` | The question text shown to the user.                                       |
| `topic`         | `string` | Short topic tag (e.g. `"react"`, `"system-design"`, `"behavioral"`).       |
| `expectedFocus` | `string` | What a strong answer should address — used later by `evaluateAnswer`.      |

In mock mode the result is `mockInterviewQuestions.slice(0, count)` so the
array length never exceeds `count`.

---

### 2.5 `evaluateAnswer`

```ts
evaluateAnswer(input: EvaluateAnswerInput): Promise<AnswerEvaluation>
```

**Input — `EvaluateAnswerInput`**

| Field           | Type                  | Notes                                         |
| --------------- | --------------------- | --------------------------------------------- |
| `question`      | `string`              | The question asked (typically from 2.4).      |
| `expectedFocus` | `string`              | From the same `InterviewQuestion` object.     |
| `userAnswer`    | `string`              | The candidate's answer text.                  |
| `interviewType` | `"hr" \| "technical"` | Matches the interview session.                |

**Output — `AnswerEvaluation`**

| Field             | Type        | Meaning                                                                          |
| ----------------- | ----------- | -------------------------------------------------------------------------------- |
| `score`           | `number`    | 0-100. Overall weighted score.                                                   |
| `clarity`         | `number`    | 0-100. How clearly the answer is expressed.                                      |
| `correctness`     | `number`    | 0-100. Factual accuracy.                                                         |
| `depth`           | `number`    | 0-100. How thoroughly the expected focus is covered.                             |
| `feedback`        | `string`    | Short paragraph of feedback for the user.                                        |
| `improvementTips` | `string[]`  | 2-3 concrete suggestions.                                                        |

All numeric fields are clamped to 0-100 after validation.

---

### 2.6 `parseResume`

```ts
parseResume(resumeText: string): Promise<ParsedResume>
```

Converts a plain-text resume (already extracted from PDF/DOC by the
Backend or a separate service) into a stable structured object suitable
for persistence in the database.

**Input**

| Field        | Type     | Notes                                                           |
| ------------ | -------- | --------------------------------------------------------------- |
| `resumeText` | `string` | Plain text. Must be non-empty. Truncated internally at 20k chars. |

**Output — `ParsedResume`**

Every top-level key is REQUIRED. Unknown text becomes `null`, unknown
lists become `[]`. The Backend can rely on the shape without optional
chaining.

| Field                   | Type                                    | Meaning                                                                          |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `raw_text_hash`         | `string`                                | SHA-256 of the original resume text, hex-encoded. Computed deterministically by Role 4. Use it as a cache key to avoid re-parsing unchanged resumes. |
| `personal_info`         | `ParsedResumePersonalInfo`              | Contact details. Each field is `string \| null`.                                |
| `professional_summary`  | `string \| null`                        | Short summary paragraph, or `null` if not present.                               |
| `work_experience`       | `ParsedResumeWorkExperience[]`          | Always an array. Empty if the resume has no work history.                        |
| `education`             | `ParsedResumeEducation[]`               | Always an array.                                                                 |
| `skills.technical_skills` | `string[]`                            | **Normalized** via `normalizeSkills` (e.g. `"React.js"` → `"react"`).           |
| `skills.soft_skills`    | `string[]`                              | Trimmed and deduped. Not run through the skill aliaser.                          |
| `skills.tools_and_software` | `string[]`                          | **Normalized** via `normalizeSkills`.                                            |
| `projects`              | `ParsedResumeProject[]`                 | Each project's `technologies_used` is normalized via `normalizeSkills`.         |
| `languages`             | `ParsedResumeLanguage[]`                | Spoken/written languages and proficiency.                                        |
| `certifications`        | `ParsedResumeCertification[]`           | Always an array.                                                                 |
| `awards`                | `ParsedResumeAward[]`                   | Always an array.                                                                 |
| `parsed_metadata`       | `ParsedResumeMetadata`                  | See below.                                                                       |
| `suggested_skills`      | `SuggestedSkill[]`                      | Prioritized list of skills the candidate likely knows but did NOT list. **Descriptive only — never auto-applied.** See "Suggested skills" below. |

**`ParsedResumeMetadata`**

| Field                           | Type                                                  | Meaning                                                                                   |
| ------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `language_detected`             | `"en" \| "he" \| "mixed" \| "other" \| null`          | Detected primary language of the resume. Any value outside the enum becomes `null`.       |
| `years_of_experience_estimate`  | `number`                                              | Non-negative integer. AI-provided; clamped to `>= 0` and rounded.                         |

**Dates.** `start_date` and `end_date` are free-form strings the prompt
asks the AI to format as `"YYYY-MM"` when month is known, `"YYYY"` when
only year is known, or `"present"` for ongoing roles. Unknown dates are
`null`. Role 4 does not validate the date format — the prompt enforces
it and downstream code should tolerate variants gracefully.

**Validation.**

- Runs in production, not only in tests. If the AI returns an object
  with a missing or extra top-level key, the wrong type for a required
  array or object, or a non-string inside a string array, the response
  is rejected and `parseResume` retries once with a stricter prompt.
- If the retry also fails, `parseResume` throws a descriptive error
  named after the offending field (e.g. `"parseResume: field
  'work_experience[0].responsibilities[1]' is not a string"`).
- `ai.service` never silently repairs structurally invalid responses.
  Backend persistence can rely on the returned shape.

**Normalization (deterministic).**

- `skills.technical_skills`, `skills.tools_and_software`, and each
  project's `technologies_used` are run through `normalizeSkills`.
- Every `string | null` field is trimmed. Empty strings are coerced to
  `null`.
- `language_detected` is lowercased and compared against the enum.
- `raw_text_hash` is always computed by Role 4 after validation —
  never trusted from the AI.

**Retry.**

- One retry on parse/validation failure. No retry on
  `GEMINI_API_KEY` missing, SDK errors, or empty-input callers.
- Same single-retry helper all other `ai.service` functions use.

**Mock mode.**

- Returns `mockParsedResume` with `raw_text_hash` recomputed from the
  actual input. `callAi` is never invoked.

**Suggested skills.**

- Each entry is `{ skill: string, reason: string, confidence: number }`.
- `skill` is normalized via `normalizeSkills` (e.g. `"React.js"` → `"react"`).
- `confidence` is clamped to the inclusive range `0-100` and rounded to an integer.
- Entries that duplicate any value already present in
  `skills.technical_skills`, `skills.tools_and_software`, or
  `projects[].technologies_used` are dropped. Comparison is on the
  normalized form.
- The list is deduped by normalized skill and sorted by
  `confidence` descending, with alphabetical tie-break on `skill`.
- **Recall over precision.** The prompt asks the AI for 50+ entries
  whenever the resume has enough signal, and 75-100 for typical
  software-engineering resumes. Lower-confidence entries (e.g. 30-60)
  are intentionally included near the bottom of the list rather than
  trimmed — they exist to populate a user-review screen where the
  user manually approves each suggestion. In practice a thin resume
  can yield fewer; an empty array is a legal response.
- **This field is descriptive only.** The Backend MUST treat it as a
  "you might also know..." suggestion list to surface to the user.
  Do NOT merge `suggested_skills` into the user's profile, do NOT pass
  it into `calculateMatch`, and do NOT use it in any deterministic
  scoring. The user must approve each suggestion manually.

**Example — realistic `ParsedResume`**

```json
{
  "raw_text_hash": "0c8f…e7a2",
  "personal_info": {
    "full_name": "Dana Levi",
    "email": "dana.levi@example.com",
    "phone": "+972-50-123-4567",
    "location": "Tel Aviv, Israel",
    "linkedin_url": "https://www.linkedin.com/in/dana-levi",
    "portfolio_or_github_url": "https://github.com/dana-levi"
  },
  "professional_summary": "Junior full-stack developer with one year of hands-on experience building React and Node services on a MongoDB-backed stack.",
  "work_experience": [
    {
      "company_name": "Acme Labs",
      "job_title": "Junior Full-Stack Developer",
      "start_date": "2024-07",
      "end_date": "present",
      "location": "Tel Aviv, Israel",
      "responsibilities": [
        "Built React components with TypeScript for the internal admin dashboard.",
        "Implemented REST endpoints in Node and Express backed by MongoDB."
      ],
      "achievements": [
        "Reduced dashboard load time by 40% by memoizing heavy list views."
      ]
    }
  ],
  "education": [
    {
      "institution_name": "Tel Aviv University",
      "degree_type": "BSc",
      "field_of_study": "Computer Science",
      "start_date": "2021-10",
      "end_date": "2024-07"
    }
  ],
  "skills": {
    "technical_skills": ["react", "node", "typescript", "mongodb"],
    "soft_skills": ["communication", "ownership"],
    "tools_and_software": ["git", "docker", "vscode"]
  },
  "projects": [
    {
      "project_name": "HiredMe",
      "description": "Final project: an AI-powered platform that matches profiles to jobs and simulates interviews.",
      "technologies_used": ["react", "node", "mongodb", "typescript"],
      "link": "https://github.com/shirher0203/HiredMe"
    }
  ],
  "languages": [
    { "language": "Hebrew", "proficiency_level": "native" },
    { "language": "English", "proficiency_level": "fluent" }
  ],
  "certifications": [],
  "awards": [],
  "parsed_metadata": {
    "language_detected": "en",
    "years_of_experience_estimate": 1
  },
  "suggested_skills": [
    { "skill": "redux", "reason": "common state management for React applications.", "confidence": 92 },
    { "skill": "express", "reason": "default Node web framework given Node + REST experience.", "confidence": 88 },
    { "skill": "jest", "reason": "standard JavaScript / TypeScript unit testing tool.", "confidence": 86 },
    { "skill": "tailwind", "reason": "popular utility-first CSS framework alongside React.", "confidence": 78 }
  ]
}
```

**Integration notes for the Backend.**

- Persist the returned `ParsedResume` as-is. The shape is stable and
  every top-level key is always present.
- Use `raw_text_hash` as the cache key. If the hash matches an earlier
  persisted resume, skip re-calling `parseResume`.
- OCR / PDF extraction is NOT Role 4's concern. Pass in plain text only.
- Resume upload endpoints, file storage, and auth belong to Role 3.

---

### 2.7 `summarizeInterviewAttempt`

```ts
summarizeInterviewAttempt(input: SummarizeAttemptInput): Promise<InterviewAttemptSummary>
```

Produces a short structured summary of a completed interview attempt
(questions + the candidate's answers + per-answer evaluations). The
Backend persists the result as-is on the user's interview history.

**Input — `SummarizeAttemptInput`**

| Field           | Type                    | Notes                                                                 |
| --------------- | ----------------------- | --------------------------------------------------------------------- |
| `interviewType` | `"hr" \| "technical"`   | Must match the interview session.                                     |
| `answers`       | `AttemptAnswerInput[]`  | Non-empty. Each entry contains the question, the user's answer, and the `AnswerEvaluation` returned by `evaluateAnswer`. |
| `overallScore`  | `number` *(optional)*   | If provided, this value (clamped to 0-100) is returned verbatim, overriding both the AI's value and the computed average. |
| `jobTitle`      | `string` *(optional)*   | Target role label for prompt context.                                 |
| `profileSkills` | `string[]` *(optional)* | Candidate's known skills, for prompt context.                         |

**`AttemptAnswerInput`**

| Field        | Type               | Notes                                                                 |
| ------------ | ------------------ | --------------------------------------------------------------------- |
| `questionId` | `string`           | Stable id (e.g. `"q1"`).                                              |
| `question`   | `string`           | The question text shown to the candidate.                             |
| `userAnswer` | `string`           | Candidate's answer. Truncated to 2000 chars inside the prompt builder. |
| `evaluation` | `AnswerEvaluation` | The full evaluation returned by `evaluateAnswer` for this answer.     |

**Output — `InterviewAttemptSummary`**

| Field              | Type       | Meaning                                                                                |
| ------------------ | ---------- | -------------------------------------------------------------------------------------- |
| `summary`          | `string`   | 50-800 char paragraph synthesizing the candidate's overall performance.                |
| `overallScore`     | `number`   | 0-100 integer. See "Score reconciliation" below.                                       |
| `preserve_points`  | `string[]` | 1-2 short strings (10-200 chars each) — concrete things to keep doing.                 |
| `improve_points`   | `string[]` | 1-2 short strings (10-200 chars each) — concrete things to work on.                    |
| `topics_covered`   | `string[]` | 0-15 lowercase, deduped topic tags (≤ 60 chars each).                                  |
| `overall_feedback` | `string`   | 20-300 char closing note addressed to the candidate.                                   |

**Score reconciliation.**

`overallScore` follows this precedence:

1. `input.overallScore` if provided (clamped to 0-100, rounded).
2. Otherwise the rounded mean of `input.answers[].evaluation.score`.
3. The AI's value is used only inside the prompt as a sanity-check signal — it never reaches the returned object.

This keeps the persisted score deterministic and auditable against the per-answer evaluations.

**Validation.**

- Synchronous, before any AI call: `interviewType` enum, non-empty `answers`, every answer must have non-empty `questionId` / `question` / `userAnswer` and a finite-number evaluation. A bad input throws and does NOT consume Gemini quota.
- AI response: all 6 top-level keys required; string length bounds enforced on `summary` (50-800) and `overall_feedback` (20-300). `preserve_points` / `improve_points` must contain at least one valid entry (10-200 chars), trimmed to 2. `topics_covered` is lowercased + deduped + capped at 15.
- One retry on parse/validation failure using the existing `withOneRetry` helper.

**Mock mode.**

- Returns `mockInterviewAttemptSummary` with `overallScore` overridden by `input.overallScore` (if provided) or the computed average. `callAi` is never invoked.

**Example — `InterviewAttemptSummary`**

```json
{
  "summary": "Across the technical session the candidate showed solid grounding in React and Node fundamentals and was able to walk through reconciliation, async error handling, and TypeScript narrowing with concrete examples. Depth was the weakest dimension — answers were correct but rarely went into trade-offs, alternative designs, or failure modes. Pacing and clarity were consistent throughout.",
  "overallScore": 76,
  "preserve_points": [
    "Continue using small, concrete code examples to ground each explanation.",
    "Keep the calm pacing and structured framing — it makes the answers easy to follow."
  ],
  "improve_points": [
    "Push answers one layer deeper: name a trade-off, failure mode, or alternative design after the main explanation.",
    "Tie each answer back to the question's expected focus in the closing sentence."
  ],
  "topics_covered": ["react", "node", "typescript", "mongodb", "error-handling", "behavioral"],
  "overall_feedback": "A well-rounded junior-level performance. Closing the depth gap by routinely calling out a trade-off or edge case would meaningfully raise the score."
}
```

**Integration notes for the Backend.**

- Call this AFTER all answers in the attempt have been evaluated via `evaluateAnswer`. The summary is a one-shot, end-of-attempt operation — not a per-question one.
- Persist the returned object as-is on the user's interview history record. The shape is stable.
- The function is stateless; it does NOT read from or write to the database.

---

## 3. Behavior notes

- **Validation.** Every AI response is run through `parseJsonFromAi` (tolerates
  fences and surrounding prose) and then strictly validated: required
  string fields must be non-empty strings, array fields must be arrays of
  strings, and score fields must be numbers or numeric strings (e.g. `"85"`
  is accepted; `"85%"`, `"high"`, booleans, objects, and `null` are rejected
  with a descriptive error that names the function and the offending field).
- **One retry on bad AI output.** If parsing or validation fails, `ai.service`
  retries the AI call exactly once with a stricter follow-up prompt. No
  exponential backoff, no loops, no background jobs.
- **No retry on local errors.** Missing API keys, invalid caller inputs, and
  transport errors the SDK has already retried are not retried.
- **Score clamping.** Every numeric score returned by `ai.service`
  (`aiSemanticScore`, `score`, `clarity`, `correctness`, `depth`) is clamped
  to the inclusive range 0-100 and rounded.
- **Deterministic final scoring.** The final match score is always computed
  by `buildDeterministicMatch` using the 70/30 formula in section 2.3.
  The AI never decides a final score.
- **Stateless.** Role 4 holds no session state. The Backend owns interview
  sessions, persistence, and request-level caching.

---

## 4. Runtime modes

**Real Gemini is the default.** Do not enable mock mode in production
environments. Mock mode exists only for automated tests and offline
development.

Mock mode activates **only** when `process.env.USE_MOCK_AI === "true"`.
Any other value — including unset, empty, `"false"`, `"1"`, or
`"TRUE"` — runs the real Gemini path. In real mode, a missing
`GEMINI_API_KEY` causes every AI call to throw — the system never
silently falls back to mock responses.

Automated tests must set `USE_MOCK_AI=true` in `beforeAll` and delete
it in `afterAll` so cross-suite runs do not leak the setting.

When mock mode is active:

- No external API calls are made.
- `callAi` is never invoked — attempting to invoke it in mock mode throws.
- Responses are identical on every call, so tests are reproducible.
- `calculateMatch` still runs the deterministic matching formula against
  the caller's profile and job, using `mockSemanticMatch.aiSemanticScore`
  as the 30% AI sub-score. So the full scoring path is exercised with
  zero latency and zero cost.

Use cases:

- Automated tests (no network I/O in CI).
- Local development without a Gemini key.

---

## 5. Example usage

```ts
import {
  analyzeProfile,
  analyzeJob,
  calculateMatch,
  generateInterviewQuestions,
  evaluateAnswer,
} from "../services/ai/ai.service";

// 1. Analyze a user's profile.
const profileAnalysis = await analyzeProfile(profile);

// 2. Analyze a job description.
const job = await analyzeJob(jobDescription);

// 3. Compute the match — 70% deterministic / 30% AI.
const match = await calculateMatch(profile, job);

// 4. Generate interview questions for that job.
const { questions } = await generateInterviewQuestions({
  interviewType: "technical",
  profileSkills: profile.skills,
  jobRequiredSkills: job.requiredSkills,
  count: 5,
});

// 5. When the user answers a question, score the answer.
const evaluation = await evaluateAnswer({
  question: questions[0].question,
  expectedFocus: questions[0].expectedFocus,
  userAnswer: "The virtual DOM is an in-memory copy...",
  interviewType: "technical",
});
```

---

## 6. Notes for the Backend developer

- **Only call `ai.service`.** Do not import `ai.client` from controllers or
  any other backend code — it is a thin transport wrapper around the
  Gemini SDK and is allowed to change without notice. `ai.service` is the
  stable public surface.
- **Use the declared input types.** Everything expects plain `ProfileInput`,
  `JobAnalysis`, `GenerateQuestionsInput`, and `EvaluateAnswerInput`
  objects. Don't pass Mongoose documents directly — convert to plain
  objects (`toObject()` or a mapping layer) first.
- **Persist outputs, don't recompute them.** Cache `ProfileAnalysis`,
  `JobAnalysis`, and `MatchAnalysis` in the database. Re-run the
  corresponding service function only when the upstream input actually
  changes (e.g. profile edited, job description changed). Use a hash of
  the input to detect changes cheaply.
- **AI is not called on every page load.** The Backend is responsible for
  caching. `ai.service` functions assume each call reflects a real change
  in input.
- **Interview session state is yours.** Role 4 does not manage sessions,
  turns, or completion status. Store those in Mongo and feed individual
  answers through `evaluateAnswer` one at a time.
- **Handle thrown errors.** Validation and retry failures throw
  descriptive `Error`s whose messages name the function and the offending
  field (e.g. `"evaluateAnswer: field 'score' is not numeric (received \"high\")"`).
  Map them to appropriate HTTP responses.
- **Default is real Gemini.** A working `server/.env` must include
  `GEMINI_API_KEY`. `USE_MOCK_AI=true` is an opt-in for automated tests
  and offline development only.

### Environment setup

Copy `server/.env.example` to `server/.env` and fill in `GEMINI_API_KEY`.
The minimum required keys are:

```
PORT=5000
GEMINI_API_KEY=<your_api_key>
GEMINI_MODEL=gemini-flash-lite-latest
USE_MOCK_AI=false
AI_TIMEOUT_MS=20000
DEBUG_AI=false
```

The variable name must be exactly `USE_MOCK_AI`, and any value other
than the string `"true"` runs the real Gemini path.
