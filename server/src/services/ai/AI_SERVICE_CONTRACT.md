# AI Service Contract (Role 4 → Role 3)

This document is the integration contract between Role 4 (AI & Logic) and
Role 3 (Backend). Role 4 exports pure service functions that take plain
TypeScript objects and return plain TypeScript objects. The Backend Lead
calls these from controllers and owns persistence, HTTP, and auth.

---

## 1. Overview

The `ai.service` module provides five AI-powered services:

- **Profile analysis** — turn a user's profile into a structured summary.
- **Job analysis** — extract required/advantage skills and seniority from a
  free-text job description.
- **Match scoring** — compute how well a profile fits a job, as a
  deterministic score combined with an AI semantic sub-score.
- **Interview question generation** — produce a batch of questions tailored
  to the user and (optionally) the target job.
- **Answer evaluation** — score a single interview answer and return
  feedback.

Two runtime modes are supported:

- **Real mode (Gemini).** `ai.client.ts` calls the Gemini API. Responses
  are parsed by `safe-json.ts`, then validated and clamped inside
  `ai.service.ts`.
- **Mock mode (`USE_MOCK_AI=true`).** No external calls. Deterministic
  mock responses are returned immediately. `calculateMatch` still runs
  the deterministic matching formula against the provided profile and
  job, so mock mode exercises the real scoring path end-to-end.

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
calculateMatch(profile: ProfileInput, jobAnalysis: JobAnalysis): Promise<MatchAnalysis>
```

**Input**

- `profile: ProfileInput` — see 2.1.
- `jobAnalysis: JobAnalysis` — normally the output of `analyzeJob`.

**Output — `MatchAnalysis`**

| Field              | Type        | Meaning                                                                                         |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| `algorithmicScore` | `number`    | 0-100. Deterministic skill-overlap score: `round(matchedRequired / requiredSkills * 100)`.      |
| `aiSemanticScore`  | `number`    | 0-100. AI's semantic-similarity sub-score, clamped and rounded.                                 |
| `finalScore`       | `number`    | 0-100. See formula below.                                                                       |
| `matchedRequired`  | `string[]`  | Required skills the profile has, in canonical (normalized) form.                                |
| `missingRequired`  | `string[]`  | Required skills the profile is missing, in canonical form.                                      |
| `matchedAdvantage` | `string[]`  | Advantage skills the profile has, in canonical form.                                            |
| `explanation`      | `string`    | Short text from the AI explaining the semantic score.                                           |

**Final score formula (authoritative)**

```
finalScore = round(0.7 * algorithmicScore + 0.3 * aiSemanticScore)
finalScore = clamp(finalScore, 0, 100)
```

- 70% of the result is deterministic skill overlap.
- 30% is the AI's semantic sub-score.
- The AI never produces `finalScore` directly — it only contributes
  `aiSemanticScore`. The combination happens in `matching.service.ts`.

**Defensive defaults.** If `profile.skills`, `jobAnalysis.requiredSkills`,
or `jobAnalysis.advantageSkills` are missing at runtime, they are treated
as `[]` so `calculateMatch` never throws on slightly malformed inputs
from the database.

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

## 4. Mock mode

`USE_MOCK_AI=true` switches every service function to deterministic
constants from `mock-ai.responses.ts`:

- No external API calls are made.
- `callAi` is never invoked — attempting to invoke it in mock mode throws.
- Responses are identical on every call, so tests and demos are
  reproducible.
- `calculateMatch` still runs the deterministic matching formula against
  the caller's profile and job, using `mockSemanticMatch.aiSemanticScore`
  as the 30% AI sub-score. So the full scoring path is exercised with
  zero latency and zero cost.

Use cases:

- Automated tests (no network I/O in CI).
- Local development without a Gemini key.
- Classroom demos that must not be blocked by rate limits.

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
- **Demo-ready with `USE_MOCK_AI=true`.** Any environment that sets this
  env var gets the full flow with zero external I/O.
