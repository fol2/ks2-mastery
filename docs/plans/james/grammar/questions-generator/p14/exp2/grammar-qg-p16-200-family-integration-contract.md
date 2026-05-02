# Grammar QG P16 — 200-Family Manual Bench Expansion Integration Contract

## Purpose

P16 is a content-depth track. It is not an AI integration, not a reward change, and not a production-safety-only phase. The aim is to move from a merely certified Grammar QG pool to a genuinely broad and deep pool that reduces repeated learner experience.

## Delivered content

- Combined manual pack: `grammar-qg-p16-manual-expansion-200-families.json`
- Delta-only pack: `grammar-qg-p16-manual-expansion-delta-110-families.json`
- Audit: `grammar-qg-p16-manual-expansion-200-families-audit.json`

## Engineering contract

1. Import as draft-only.
2. Never add unreviewed P16 cases to normal smart-practice scheduling.
3. Preserve `templateFamilyId`, `caseId`, `conceptIds`, `questionType`, `inputType`, `depthTier`, `promptText`, answer fields and review checklist.
4. Generate a reviewer pack showing prompt, visible options/rows, correct answer, rationale, feedback and read-aloud text.
5. Produce a marking matrix for constructed-response families.
6. Produce a distractor audit for selected-response families.
7. Promote only families with approved evidence.
8. Update scheduler to prevent same-template repeats and recent-surface repeats.
9. Regenerate release artefacts under a new content release ID.
10. Run production smoke after deployment.

## Product acceptance

- At least 200 new manual template families accepted or replaced.
- At least 2,000 accepted new cases.
- No ordinary five-question session repeats the same template family.
- No learner sees the same surface within the configured recent-history window unless it is retry/trouble/spaced retrieval.
- Parent-facing copy distinguishes quick practice from deep practice.
- Stars are not slowed until the expanded content pool is live and pacing telemetry has been reviewed.

## Rejection rules

Reject or block any family that has ambiguous answerability, weak grammar logic, repeated surface wording, missing correct answer, missing accepted answer, unclear distractor rationale, or read-aloud copy that misstates the target.
