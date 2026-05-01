---
phase: punctuation-qg-p11
title: Punctuation QG P11 — Product Depth, Variety, and Learning Journey Release Plan
status: required
author: ChatGPT review
language: en-GB
created: 2026-05-01
source_zip: ks2-mastery-lean-04302325.zip
source_zip_sha256: 636eb22b6e043fdae7a4a9f768ebca70b0dc5e4b81db0319a0a467a5b2eb61c9
primary_authority: uploaded lean ZIP
---

# Punctuation QG P11 — Product Depth, Variety, and Learning Journey Release Plan

## Decision

P11 is required.

P10 is a useful certification phase for marking, evidence boundaries, human acceptance records, and deployment smoke. It does not solve the product concern that triggered this work: whether Punctuation has enough question depth, whether the learner sees enough variety when clicking through the app, whether short sessions are educationally effective, and whether Stars are being earned too quickly.

The release should not be expanded under the claim that the question generator is now a finished product. The honest status after P10 is:

```text
P10 = depth-4 certification and marking hardening
P11 = product-depth and learner-journey hardening
```

The P11 goal is not another paperwork certification batch. The goal is to make the product feel materially better to a child clicking through real sessions.

## Evidence boundary

This plan uses the uploaded lean ZIP as the primary source. The ZIP contains source, tests, scripts, reports and lean placeholder assets. It does not contain Git metadata, so commit ancestry checks in certification validators cannot be treated as ZIP-local proof. Live production evidence is accepted only where a smoke artefact records origin, timestamp, release id and result.

The local environment matched the requested Node family: `.nvmrc` is `22`, and the local runtime was Node `v22.16.0`.

## What P10 really achieved

P10’s core marking fix appears real. Focused P10 tests passed locally from the uploaded ZIP:

```text
punctuation-closed-lexical-preservation-p10.test.js: 4 tests pass
punctuation-closed-preservation-productionisation.test.js: 17 tests pass
punctuation-negative-vectors.test.js: 18 tests pass locally in this snapshot
reviewer cluster / authority / evidence tests: 24 tests pass
```

The local review pack summary also reports:

```text
productionDepth: 4
totalItems: 192
production approved items: 192
review-required clusters approved: 47
unreviewed non-required clusters: 68
```

The archived P10 verifier log in the ZIP records 10 top-level gates, 56 logical gates, and `CERTIFIED_POST_DEPLOY`. The P10 production smoke artefact records `runtimeItems: 192`, `generatedDepth: 4`, and release `punctuation-r4-full-14-skill-structure`.

These are meaningful. They do not prove that the product now has enough depth or that the learner journey is not repetitive.

## P10 gaps found in product review

### Gap 1 — Production question count did not increase

The production pool remains:

```text
fixed items: 92
generated production items: 100
total production items: 192
PRODUCTION_DEPTH: 4
CAPACITY_DEPTH: 8
```

P10 deliberately keeps depth 6 blocked. That means P10 did not answer the original product question of whether the item pool is large enough. It certified the depth-4 pool; it did not expand it.

The current generated production structure is 25 generator families × 4 variants. That is tidy, but not deep enough if the product is supposed to sustain repeated use without visible repetition.

### Gap 2 — The default Smart session is too short for the intended mode mix

The current allowed round lengths are `1`, `2`, `3`, `4`, `6`, `8`, and `12`, and the default preference is `roundLength: '4'`.

The Smart mode cycle is:

```text
choose → insert → fix → transfer → combine → paragraph
```

With a default four-question Smart session, a clean run only reaches:

```text
choose → insert → fix → transfer
```

It does not naturally reach `combine` or `paragraph`. That means the advertised deeper question types are present in the bank, but the default click journey can hide them from the learner.

Four-question sessions are acceptable for a guided micro-check or a quick rescue. They are not enough for a standard Smart Practice mission if the goal is variety, mixed retrieval and depth.

### Gap 3 — Every new Smart session restarts at the same visible rhythm

Because a new session starts with `answeredCount = 0`, the mode cycle starts at `choose` again. In repeated short sessions, the learner sees a repeated pattern even when item ids change.

A child does not experience variety as a database count. A child experiences variety as the next few clicks. The current default journey is too predictable.

### Gap 4 — Misconception retry can visibly loop after one wrong answer

A local product audit found a concrete repetition bug. In a 12-question Smart session where the first answer is wrong and the following answers are correct, the current P10 snapshot can show the same misconception retry item repeatedly:

```text
slot 1: ap_choose_possession        fallback             wrong
slot 2: ap_insert_singular          misconception-retry  correct
slot 3: ap_insert_singular          misconception-retry  correct
slot 4: ap_insert_singular          misconception-retry  correct
slot 5: ap_insert_singular          misconception-retry  correct
slot 6: ap_insert_singular          misconception-retry  correct
```

The intended scheduler has a `retriedMisconceptions` guard, but the session state does not persist the selected retry tag back into the active session. Therefore the guard can be ineffective in the actual service path.

This is not a theoretical issue. It explains the exact product complaint: the learner clicks and feels that the same kind of question is coming back too often.

A patch sketch is supplied separately: `punctuation-qg-p11-misconception-loop.patch`.

### Gap 5 — Choice coverage is shallow

The production pool has only 20 `choose` items. The generated production families currently add many insert/fix/combine/paragraph variants, but they do not materially expand the first visible `choose` slot.

If every default Smart session starts at `choose`, a 20-item choice pool will feel smaller than a 192-item bank.

### Gap 6 — Some skills remain thin

The production pool has uneven skill coverage. The thinnest single-skill groups include:

```text
apostrophe_possession: 8
speech: 8
apostrophe_contractions: 11
comma_clarity: 12
hyphen: 12
semicolon_list: 12
```

Multi-skill families help, but the learner-facing result still needs more contexts per skill, not only more generated variants per existing template.

### Gap 7 — Star pacing still needs a product gate

The underlying memory model is not simply “one correct answer equals secure”; it requires streak, accuracy and a span of days for secure memory. That is good.

The product risk is the UX layer: if a four-question session celebrates too much, or if Try/Practice Stars look like mastery, children and parents will feel the subject is finished too quickly. P11 must test the displayed Star journey, not only the memory state.

A four-question run should never be communicated as “you have learnt the section”. It should be communicated as “quick practice complete” unless spaced independent evidence supports stronger language.

## P11 scope

P11 has seven units. All are production-facing.

## U1 — Product journey audit pack

Create a learner-surface audit pack, not only a reviewer-data pack.

For each audited item, record:

```text
item id
source: fixed / generated
skill ids
mode
prompt shown to the learner
stem shown to the learner
options and correct index for choice items
input widget expected
model answer
accepted answers
feedback on correct answer
feedback on wrong answer
misconception tags
selection reason
session slot
whether it is a first-click, retry, mixed review, due review or spaced return
```

Acceptance criteria:

1. The pack includes all 192 depth-4 production items.
2. The pack includes all candidate items proposed for depth 6 and depth 8.
3. The pack includes at least 24 simulated learner journeys: fresh learner, one wrong then correct, repeated wrong, guided mode, weak mode, GPS mode, and post-secure maintenance.
4. The pack marks whether each item was actually surfaced by the product service, not just present in content data.
5. Reviewer approval must be against this surface pack.

## U2 — Increase production depth and diversify the first-click surface

P11 should raise production depth only after QA, but the target should be depth 8, not another minimal depth-6 paperwork step.

Target pool:

```text
fixed items: 92
generated items: 200
minimum production pool: 292
PRODUCTION_DEPTH: 8
```

This is the current capacity depth and gives a visible increase from 192. However, raw depth is not enough.

P11 must also add new first-click and transfer coverage:

1. Add generated `choose` families so the first visible slot is not limited to 20 fixed items.
2. Add more open transfer prompts with different contexts, not only punctuation shape variants.
3. Add context packs: classroom, sport, museum, nature, science, story, dialogue, instructions and non-fiction.
4. Ensure every published single-skill area has at least 12 production items, with a target of 16+ where feasible.
5. Ensure every major skill has at least three different learner-facing contexts.

Acceptance criteria:

1. `PRODUCTION_DEPTH` is raised to 8 only after all generated candidates pass preservation, negative vectors, reviewer surface QA and journey simulation.
2. Production pool is at least 292 items.
3. `choose` count is at least 40.
4. No published single-skill group has fewer than 12 production items.
5. No generator family contributes repeated near-identical stems without a different context or cognitive demand.

## U3 — Default session redesign

Change the default learner journey:

```text
Guided micro-check: 4 questions
Smart Practice default: 6 questions
Deep Practice / GPS: 8 or 12 questions
```

A standard Smart Practice session should naturally reach the full mode cycle:

```text
choose → insert → fix → transfer → combine → paragraph
```

Acceptance criteria:

1. Default Smart Practice uses six questions.
2. Guided mode may keep four questions, because it is a focused scaffold.
3. Weak-spots sessions may use four or six depending on the learner’s load, but should not be labelled as full mastery.
4. A four-question run is never labelled as a completed section or completed learning path.
5. Product copy distinguishes `quick check`, `practice`, `secure`, and `retained`.

## U4 — Fix misconception retry loops

Patch the scheduler-service bridge so a misconception tag retried in a session is recorded in the session state. A correct retry should not cause the same retry item to be shown again immediately.

Acceptance criteria:

1. In a 12-question session with pattern “first answer wrong, all following answers correct”, no item may appear five times in a row.
2. A misconception retry may appear once as immediate repair.
3. If the retry is answered correctly, the next item should return to normal mixed/new/due selection unless there is a different unresolved misconception.
4. If the learner keeps answering incorrectly, the scheduler may give up to the configured retry limit, then demote to a different task or end with supportive feedback.
5. `retriedMisconceptions` must be serialisable through the service state and restored state.

A patch sketch is supplied with this plan.

## U5 — Anti-repetition journey gate

Add a journey simulator gate that fails the build when the learner-facing click sequence is repetitive.

The gate should simulate at least:

```text
fresh learner, 20 short sessions
fresh learner, 10 six-question Smart sessions
one wrong then correct, 12-question Smart session
always wrong, 12-question Smart session
post-secure learner, spaced review session
same-day grinding, 15 sessions
```

Acceptance criteria:

1. No same item appears twice in a row.
2. No same item appears more than twice within 20 attempts, except explicitly authored near-retry cases with different stems.
3. No first-click mode is always `choose` across repeated standard sessions.
4. No same generator family dominates more than 35% of a six-question session unless the session is explicitly guided.
5. Every 20-session fresh-learner simulation must surface at least five modes and at least ten skills.
6. The gate outputs examples, not only aggregate scores.

## U6 — Star pacing and session-completion copy

Add a Star pacing verifier that tests the learner-visible reward journey.

Acceptance criteria:

1. A single four- or six-question same-day session cannot produce wording that implies mastery.
2. Same-day grinding cannot produce Mega / 100-Star completion without spaced independent evidence.
3. Try/Practice Stars are visually and verbally distinct from Secure/Retained evidence.
4. Parent/admin surfaces show why Stars were earned: first independent win, repeat independent win, varied practice, secure confidence, retained after secure.
5. The summary screen must offer a meaningful next action, not “you are done” after a tiny session.

## U7 — Production smoke that matches the child journey

The current smoke evidence is useful, but too thin for a product release.

P11 needs two smoke levels:

1. Source smoke: deterministic service-level journey simulation from ZIP/source.
2. Live smoke: authenticated child-session path against production after deployment.

Acceptance criteria for live smoke:

```text
origin
release id
worker version or deployed commit
learner/account identity type, without exposing private data
authenticated coverage: true
dashboard start path
session item 1 to item 6 surfaces
submit-answer path
feedback path
summary path
star/progress copy check
admin/parent visibility check if available
pass/fail with timestamp
```

## U8 — Product acceptance, not only certification acceptance

P11 acceptance must be explicit:

```text
Question count accepted: yes/no
Click journey accepted: yes/no
Default session length accepted: yes/no
Star pacing accepted: yes/no
Question-surface review accepted: yes/no
Live journey smoke accepted: yes/no
```

Do not reuse a generic “human accepted 192 items” fixture as proof that the product journey is good. Product acceptance must include examples from the child-facing sequence.

## P11 verifier contract

Add:

```text
npm run verify:punctuation-qg:p11
```

Required gates:

1. P10 composed gates.
2. Production depth 8 candidate gate.
3. Generated choose-family coverage gate.
4. Surface audit pack gate.
5. Misconception retry loop gate.
6. Anti-repetition journey simulator gate.
7. Default Smart Practice length gate.
8. Star pacing and completion-copy gate.
9. Product acceptance manifest gate.
10. Live journey smoke evidence gate.

The verifier must print the key counts:

```text
productionDepth
fixedCount
generatedCount
totalProductionItems
chooseCount
minSingleSkillCount
standardSmartRoundLength
first-click mode distribution
max item repeat in journey simulations
star pacing status
live smoke status
```

## Production decision after P11

Only ship the expanded production claim if all of these are true:

```text
production pool >= 292
Smart Practice default = 6
misconception retry loop fixed
choice coverage expanded
journey simulator passes
Star pacing passes
surface review pack approved
live authenticated child journey smoke passes
```

If any of those fail, the release may still be a good marking release, but it should not be called a product-depth release.

## Plain conclusion

P10 made the marking and evidence safer. It did not make the Punctuation product deep enough.

P11 must make the next few clicks feel better: more varied, less repetitive, slightly longer where appropriate, and paced so that Stars feel earned rather than cheap.
