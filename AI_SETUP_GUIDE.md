# AI Integration Setup Guide

HiredMe uses **Google Gemini** for every AI feature: CV parsing, job-description
analysis, match scoring, interview question generation, answer evaluation and
interview summaries. There is no second provider — the Gemini SDK is imported in
exactly one file, `server/src/services/ai/ai.client.ts`.

A mock mode is available for offline development. It returns fixed canned
responses and is not a substitute for the real provider when judging output
quality.

## Configuring real Gemini

1. Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Set it in `server/.env` (or the repository-root `.env` when running Docker):

   ```
   USE_MOCK_AI=false
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-flash-lite-latest
   ```

3. Restart the server.

`GOOGLE_GENERATIVE_AI_KEY` is accepted as an alternative name for the same key.
`GEMINI_MODEL` is optional and defaults to `gemini-flash-lite-latest`.

When `USE_MOCK_AI` is anything other than `true`, startup validation requires one
of those two keys and the server exits with a clear message if neither is set.

### Verifying the connection

```bash
cd server
npm run smoke:ai
```

The smoke script exercises each AI function against the real provider and prints
a pass/fail line per function. It is the fastest way to confirm a key works
before testing through the UI.

## Mock mode

```
USE_MOCK_AI=true
```

No API key is needed. In this mode:

- CV parsing returns one fixed sample profile
- Job analysis, matching, questions, evaluations and summaries return canned
  fixtures
- Answer evaluation varies only with simple text characteristics of the answer
  (length, presence of code, mention of trade-offs) — it is pattern matching,
  not comprehension

Mock mode is for working offline and for tests that must not hit the network. Any
judgement about extraction quality, match quality or question variety has to be
made with a real key, because the mock responses are constant by construction.

## What real Gemini adds

- Questions that reflect the specific job and the user's actual profile
- Semantic evaluation of an answer rather than keyword and length heuristics
- Feedback and summaries written against what the candidate actually said
- Job analysis and match reasoning grounded in the pasted job description

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Server exits at boot with an environment validation error naming the Gemini keys | `USE_MOCK_AI` is not `true` and neither key is set |
| `Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_KEY` thrown on an AI request | The key was removed from the environment after boot |
| `AI client should not be called in mock mode` | `USE_MOCK_AI=true` while exercising a real-AI code path |
| Identical CV parse output for every upload | Still in mock mode |
