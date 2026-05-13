# Grammar QG P25 Post-Hardening Review

## Source boundary

Primary source: uploaded `ks2-mastery-lean-05131153.zip`.

Supplementary source: GitHub recent Grammar history was used only to orient the P24 lineage. The ZIP remains the authority for this review.

Production: not independently certified by this package.

## Snapshot health

The implemented post-P24 snapshot is healthy under targeted Grammar checks:

- Grammar content release remains `grammar-qg-p21-2026-05-11`.
- Template inventory remains `546`.
- Concept coverage remains `18/18`.
- Content quality seeds `1..3`: `1638` checks, `0` hard failures, `0` advisories.
- P21 local repetition at `60` steps: pass, `0` violations, `0` warnings.
- Grammar QG P21 smart-practice seeds `1..3`: pass, `33` sessions, `0` failures, `0` advisories.
- Open-response fairness seeds `1..3`: `0` findings.

## Finding A — incorrect feedback hides the misconception-specific hint

The Worker result shape already carries `minimalHint`, and those hints are strong: they tell the child exactly what to check next, such as tense/aspect, sentence function, or pronoun clarity.

The current feedback panel renders:

`feedbackLong || minimalHint`

That means when `feedbackLong` contains an answer summary, the misconception-specific `minimalHint` is hidden. A deterministic scan across templates and seeds `1..3` found:

```json
{
  "totalWrongSamples": 1167,
  "affectedSamples": 1161
}
```

This is not an engine or marking bug. It is a learner-facing feedback-quality glitch: the best learning cue is present in the read model but not visible.

## Fix A

The patch adds `grammarFeedbackLearningCueCopy(result)` and renders it as:

`Remember: <minimalHint>`

It appears only for incorrect auto-marked feedback and only when the hint is distinct from `feedbackLong`.

After patch, the same affected sample set reports:

```json
{
  "affectedSamples": 1161,
  "cueVisibleSamples": 1161,
  "missing": []
}
```

## Finding B — correct-answer stretch cues are still too generic

P24 correctly added a non-scored `Extra challenge` cue, but it is question-type based. For a world-class Grammar subject, correct-answer stretch should point at the exact concept where possible.

## Fix B

The patch adds concept-specific stretch prompts for all 18 Grammar concepts. Example:

- Relative clauses: `Extra challenge: write one new sentence with who, which, or that.`
- Active/passive: `Extra challenge: switch active and passive voice while keeping the meaning.`
- Hyphen ambiguity: `Extra challenge: remove the hyphen and explain how the meaning changes.`

These are non-scored and do not change mastery or rewards.

## Scope guard

No changes are made to reward, Stars, mastery, Hero Mode, monsters, D1 schema, Worker subject commands, scheduler weights, answer marking, or any other subject.
