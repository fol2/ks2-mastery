# Punctuation P14 — Post-live quality hardening contract

## Purpose

P14 is not a new feature phase. It is a post-live quality-hardening contract for the P13 Punctuation subject now serving the 3,312-item pool.

The goal is to protect learner trust after the large content expansion: better question quality, stronger open-production depth, cleaner answer validation, and a verified pacing/UX loop. No new learner-facing feature should be added unless it is required to fix a question-quality or answer-surface defect.

## Non-negotiable boundaries

P14 must not:

- add a new mode;
- change the subject reward model without a separate reward contract;
- introduce new visual surfaces;
- increase Stars just because the pool is larger;
- hide bad content behind scheduler weighting;
- claim production certification from local tests only.

P14 may:

- fix generated/fixed question quality;
- add generated transfer/open-production templates;
- add fixed items only when they repair coverage gaps;
- strengthen marking where it rejects objectively bad answers;
- improve copy that tells children what to answer;
- adjust round length only if backed by pacing evidence and tests.

## Gate 1 — Source/runtime identity

Acceptance:

- `PUNCTUATION_CURRENT_RELEASE_ID` remains explicit.
- Production depth remains explicit.
- Runtime pool count is deterministic.
- The verifier records fixed/generated/total counts.
- Any content change updates the evidence artefact.

Minimum expected after applying the supplied P13 quality patch:

```text
fixed: 512
generated: 2800
total: 3312
generated families: 28
model marking failures: 0
```

If transfer expansion is added, the expected counts must be updated and named honestly.

## Gate 2 — Apostrophe generated-quality regression

Acceptance:

No generated runtime item may surface these grammar defects in stem or model:

```text
you've ready to / youve ready to
we've ready to / weve ready to
they'll ready to / theyll ready to
we'll ready to / well ready to
it isn't move / it isnt move
we aren't move / we arent move
it isn't forget / it isnt forget
we aren't forget / we arent forget
```

Every generated typed-answer model in the affected apostrophe families must begin as a complete sentence.

Required test:

```text
tests/punctuation-p13-full-subject-quality.test.js
```

## Gate 3 — Paragraph sentence-boundary marking

Acceptance:

A paragraph-repair answer must not be marked correct if it removes a prose sentence boundary from a multi-sentence passage.

Example rejection required:

```text
Model:
We can't find the children's coats. The girls' bags are in the hall.

Reject:
We can't find the children's coats The girls' bags are in the hall
```

Bullet-list paragraph items must continue to allow their existing accepted variants. This gate must not break bullet-point golden marking.

Required regression:

```bash
node --test tests/punctuation-golden-marking.test.js tests/punctuation-p13-full-subject-quality.test.js
```

## Gate 4 — Transfer/open-production depth

Current risk:

```text
transfer items: 24 / 3312
```

Acceptance target:

```text
transfer/open-production items: at least 250 runtime items
minimum 12 transfer/open-production items per published skill cluster where the skill can reasonably support transfer
no token-only fragment acceptance
all transfer prompts show clear answer expectations
```

This is content-quality expansion, not a new feature. It should add or regenerate transfer templates, not a new UI.

Required audit outputs:

- count by mode;
- count by skill;
- model answer self-marking pass;
- adversarial token-only rejections;
- answer-surface review pack samples.

## Gate 5 — Session workflow and variety

Acceptance:

For seeded source simulation:

```text
80 sessions minimum
0 immediate item repeats
minimum 3 modes in normal Smart sampled sessions
at least 200 unique surfaced items across 80 mixed sampled sessions
```

For one learner across repeated Smart six-question sessions:

```text
20 sessions minimum
0 immediate repeats
at least 80 unique surfaced items across 120 surfaced questions
transfer appears but does not dominate
paragraph appears at least once every 4 sessions on average, unless learner state justifies otherwise
```

The scheduler must not fake variety by hiding weak items. Weak/due/retry reasons must still win when learning evidence says they should.

## Gate 6 — UI/UX answer-surface review

Acceptance:

For each mode:

- choose: options are visible, correct index is valid, no answer leakage in the prompt;
- insert: input is prefilled from the stem where appropriate;
- fix: input is prefilled and learner is told to repair punctuation only;
- transfer: prompt states whether the learner must use exact words or can create a new sentence;
- combine: source fragments are visible and answer box is blank;
- paragraph: multiline answer is possible and model feedback is readable.

The skill-detail modal must be reviewed as a pacing decision:

```text
Current: roundLength '4' for focused guided practice.
Decision required: keep as quick rescue OR change to '6' to align with Smart default.
```

The decision must include Star-pacing impact, not just preference.

## Gate 7 — Star pacing and “too quick to finish”

Acceptance:

P14 must produce a Star-pacing simulation showing:

- how many sessions a fresh learner needs to reach early, mid, and secure display stages;
- whether four-question focused rounds can inflate progress too quickly;
- whether six-question Smart rounds produce enough breadth before secure status;
- whether repeated same-signature/generated siblings are correctly deduped;
- whether support/guided attempts are capped appropriately.

No reward or Star rule changes are allowed unless this simulation shows a real pacing defect.

## Gate 8 — Production smoke after patch

After patch/deploy, production evidence must contain:

```text
origin: https://ks2.eugnel.uk
environment: production
releasePhase: punctuation-qg-p13-live-serving or successor
runtimeItemCount: expected current count
workerCommitSha or workerVersionId present
authenticatedCoverage: true
adminHubCoverage: true
smartSix.summaryTotal: 6
smartSix.uniqueItems: 6
smartSix.immediateRepeats: 0
```

Production status is not certified without this artefact.

## Required artefacts

P14 must provide:

```text
punctuation-p14-quality-hardening-report.md
punctuation-p14-source-audit.json
punctuation-p14-session-variety-audit.json
punctuation-p14-star-pacing-simulation.json
punctuation-p14-reviewer-samples.md
punctuation-p14-production-smoke.json
patch files for any source/content fixes
```

## Release verdict labels

Use only these labels:

```text
LIVE_SERVING_WITH_CONTENT_QUALITY_DEFECTS
QUALITY_PATCH_READY
QUALITY_PATCH_DEPLOYED_SOURCE_VERIFIED
QUALITY_PATCH_PRODUCTION_VERIFIED
TRANSFER_DEPTH_HARDENED
FULL_PUNCTUATION_SUBJECT_CERTIFIED
```

`FULL_PUNCTUATION_SUBJECT_CERTIFIED` requires all gates above, including production smoke after deployment.
