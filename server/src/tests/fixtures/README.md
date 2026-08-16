# Test fixtures

Shared inputs for the matching and job-analysis tests. Everything here is test
data: nothing in this directory is imported by production code, and nothing here
is shown to users.

## Rules

1. **No personal data.** No names, email addresses, phone numbers, employers,
   institutions, or profile URLs — not even from a public CV. Profile fixtures
   describe skills and experience only.
2. **No credentials or keys**, in any form, including expired ones.
3. **Third-party text stays here.** Job-posting text is a test input. Do not
   reproduce it in the README, the user interface, or any generated document.
4. **No Microsoft-specific behaviour in production code.** These files exist to
   validate general extraction and matching rules. If a test only passes because
   production code special-cases a string from this directory, the test is wrong.

## Files

| File | Purpose |
| --- | --- |
| `microsoft-job-partial.ts` | Scenario A: the one-paragraph description a user actually pasted in production, plus the job analysis the model returned for it. Validates the matching layer only. |
| `microsoft-job-full.ts` | Scenario B: a complete posting for the same role. Validates extraction recall and classification, then matching on richer input. |
| `security-candidate-profile.ts` | The candidate profiles both scenarios match against, plus the exact-match and unrelated control profiles. |

## Provenance

`microsoft-job-partial.ts` holds the verbatim paragraph that was pasted into the
job form during production testing, and the verbatim `analyzeJob` response it
produced. Both are kept exactly as observed — the point of Scenario A is that
this thin input was handled reasonably by extraction and still scored zero at
matching.

`microsoft-job-full.ts` is **reconstructed apart from its opening paragraph.**
That paragraph is the verbatim Scenario A input and is imported from
`microsoft-job-partial.ts` rather than copied, so the third-party text lives in
exactly one file and the two scenarios cannot drift apart. Everything after it —
responsibilities, required and preferred qualifications, benefits — was written
from the technology inventory recorded while reviewing the real posting (security
research, identity platform internals, programming and query languages, AI
tooling, forensics) together with the non-skill noise a real posting carries.

So the full fixture is representative of the original rather than a copy of it,
which is what the recall assertions need while keeping republished third-party
text to the single paragraph the regression case actually requires.

## Why two scenarios

The two fixtures separate two different claims that were originally conflated:

- Scenario A cannot show an extraction defect. Python, SQL and Windows internals
  are absent from the model's *input*, so their absence from the output is
  correct behaviour. What Scenario A does show is a matching defect: a candidate
  with `cyber-attack`, `tcp-ip` and `networking` scored a deterministic zero
  against `cybersecurity`, `threat-detection` and `security-investigation`.
- Scenario B is the fixture that can show an extraction defect, because the
  input really does name those technologies.

Assertions on Scenario B are about **distribution and presence**, never exact
equality with a fixed list: a model that dumps every phrase into
`requiredSkills` has not improved recall, so `requiredSkills` is also bounded.
