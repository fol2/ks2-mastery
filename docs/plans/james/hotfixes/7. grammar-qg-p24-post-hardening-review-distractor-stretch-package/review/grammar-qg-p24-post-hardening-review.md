# Grammar QG P24 Post-Hardening Review

## Source boundary

Primary source: uploaded `ks2-mastery-lean-05130813.zip`.

Supplementary source: GitHub recent Grammar commit history was used only to orient the P23 lineage. The ZIP remains the authority for this review.

Production: pending post-merge live smoke from `https://ks2.eugnel.uk`.

## Snapshot health

The implemented P23 snapshot is healthy under targeted Grammar checks:

- Grammar QG audit reports release `grammar-qg-p21-2026-05-11`.
- Template inventory remains `546`.
- Concept coverage remains `18/18`.
- Content quality seeds `1..3` report `1638` checks, `0` hard failures, and `0` advisories.
- P21 local repetition audit at `60` steps reports `0` violations and `0` warnings.
- P19 smart-practice audit for seeds `1..3` reports `33` sessions, `0` failures, and `0` advisories.
- Open-response fairness seeds `1..3` reports `0` findings.

## Finding A — learner-visible generic explanation distractors

A full learner-visible option scan found `1680` generic explanation distractor occurrences across `570` generated items and `19` templates. The repeated labels were:

- `It only depends on the final punctuation mark.`
- `It is correct because it is the shortest option.`
- `It is correct because it sounds more exciting.`
- `It is correct because the sentence has a capital letter.`
- `It is correct because the sentence mentions a person or thing.`

These are not marking failures, but they weaken learning quality because a child can learn to reject meta-level filler rather than reason about grammar.

## Fix A

The patch replaces those labels at runtime for manual-expansion selected-response questions with concept-specific misconception statements. It also replaces the two weak sentence-function P21 distractors.

After patch, the same scan reports:

- `0` generic distractor occurrences;
- `0` affected items;
- `0` affected templates.

The active P21 evidence bundle was regenerated after the fix. A direct scan of `reports/grammar/grammar-qg-p21-*` now reports no blocked generic labels, so adult-review artefacts no longer contradict the runtime behaviour.

## Finding B — correct-answer feedback can point forward but not stretch strong learners

The P23 feedback surface already gives a useful next-step cue. It does not yet give strong learners a small optional challenge after a correct answer. That is a missed opportunity for metacognition and beyond-KS2 challenge.

## Fix B

The patch adds a non-scored, question-type-aware `Extra challenge` line after correct answers only. It does not appear for incorrect, manual-review, or non-scored feedback and does not touch reward/mastery.

## Scope guard

No changes are made to reward, Stars, mastery, Hero Mode, monster assets, monster manifest content, cross-subject runtime, D1 schema, or other subjects. The only non-Grammar source change is an atomic-write release-gate stability fix for the monster manifest generator, with manifest-content-unchanged evidence attached.
