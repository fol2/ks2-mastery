---
title: Punctuation QG P15-P20 Systematic Expansion Contract
subject: punctuation
scope: questions-engine-only
status: implementation-contract
sourceBaseline: punctuation-qg-p14-3564-2026-05-04
createdAt: 2026-05-04
owner: KS2 Mastery
---

# Punctuation QG P15-P20 — systematic expansion contract

## Purpose

This contract defines the remaining work needed to turn the P14 Punctuation question engine from a locally verified 3,564-item pool into a durable heavy-play question system whose repetition is not noticeable to normal intensive learners.

Scope is deliberately narrow: **Punctuation questions only**. This contract covers the question pool, question-generation architecture, answer marking, session scheduling, reviewer governance, and UI/UX around question sessions. It does not change the Punctuation reward model, Stars, monsters, cross-subject Hero Mode, or unrelated subject content.

## Source boundary

Baseline evidence is the uploaded lean ZIP snapshot from 2026-05-04.

P14 source/local gates are substantially delivered in that snapshot:

- release ID: `punctuation-qg-p14-3564-2026-05-04`;
- runtime item count: 3,564;
- fixed item count: 512;
- generated item count: 3,052;
- generated family count: 42;
- transfer-mode runtime items: 276;
- published punctuation skills covered: 14;
- P14 source audit: PASS locally;
- P14 session-variety audit: PASS locally;
- model self-marking: 0 failures locally.

P14 is **not production-certified from this snapshot** because the P14 production smoke artefact is absent:

```text
reports/punctuation/punctuation-qg-p14-production-smoke.json
```

That gap must be recorded before any P15-P20 release is described as production-certified.

## Ultimate product target

By the end of P20, Punctuation should have:

```text
runtime items:                           >= 15,000
unique learner-facing surfaces:          >= 14,800
unique variant signatures:               >= 14,800
published skills:                        all 14 covered
unique learner surfaces per skill:        >= 500
open/typed items per skill:               >= 300
transfer/open-production items per skill: >= 120
generated family count:                  >= 126
generated family minimum size:            >= 80 learner-facing surfaces
model self-marking failures:              0
unapproved runtime items:                 0
unapproved duplicate surfaces:            0
negative-vector coverage:                 every family + every published skill
heavy-play one-learner 50-session sweep:  >= 220 unique surfaced items
heavy-play multi-learner sweep:           >= 1,200 unique surfaced items
production smoke:                         release ID + runtime count + admin/authenticated coverage present
```

These numbers are intentionally higher than a minimum viable expansion. The minimum viable floor is about 10,000 unique learner-facing surfaces, but the proper heavy-play target is approximately 15,000 unique surfaces plus scheduler cooldowns.

## Definition: genuinely new question

A question counts as genuinely new only if it changes the learner-facing surface or the cognitive task in a meaningful way. The following do **not** count as genuine expansion on their own:

- same stem with a different generated ID;
- same model answer with shuffled context words;
- same template with only one noun changed;
- same distractor pattern repeated across many topics;
- deeper `generatedPerFamily` when the template bank is not structurally richer;
- hidden duplicates served less often by scheduler weighting.

A generated item is counted as unique only when its normalised learner-facing signature is unique:

```text
mode + prompt + stem + options + model + validator/rubric intent + skillIds
```

A transfer/open-production item is counted only when the prompt requires the learner to produce or repair punctuation in a sentence, passage, list, or paragraph, and the answer marker rejects token-only fragments.

## Non-negotiable boundaries

P15-P20 must not:

- change Punctuation Stars or monster progression just because the pool grows;
- hide bad content behind scheduler weighting;
- claim production readiness from local tests only;
- expand by duplicating old stems with new IDs;
- allow generated open-answer items without a validator, accepted pattern, or explicit marking rubric;
- allow reviewer-blocked or unreviewed runtime items in production;
- make Smart sessions feel like random drilling detached from weak/due/retention evidence;
- add new learner-facing UI surfaces unless they directly improve question-session clarity or repetition control.

P15-P20 may:

- add generator families and DSL dimensions;
- add manual fixed items only where a generator cannot safely cover the skill;
- add new prompt forms inside existing modes;
- add transfer, paragraph, combine, typed repair, insert, and choice variants;
- strengthen answer marking and negative tests;
- add scheduler cooldowns and exposure history;
- improve answer-surface copy, feedback, and session-summary repetition transparency.

## Phase P15 — measurement, contract, and anti-fake-variety gate

P15 does not attempt the big content build. It makes measurement strict enough that future expansion cannot fake variety.

Acceptance:

- Add a pool-quality audit that reports runtime count, unique learner surfaces, unique variant signatures, per-skill counts, per-mode counts, generated family counts, transfer/open-production counts, duplicate surfaces, model self-marking failures, and reviewer status coverage.
- Add a depth-only simulation that proves why simply raising `generatedPerFamily` is not enough.
- Add a machine-readable P15-P20 threshold file or equivalent script constants.
- Add a P15 report showing the P14 baseline and exactly which P20 gates currently fail.
- Keep P14 verifier evidence intact.

Required artefacts:

```text
docs/plans/james/punctuation/questions-generator/p15-p20/punctuation-qg-p15-baseline-report.md
reports/punctuation/punctuation-qg-p15-baseline-audit.json
scripts/audit-punctuation-qg-p20-expansion.mjs
tests/punctuation-qg-p20-expansion.test.js
```

P15 exits with the honest status:

```text
BASELINE_MEASURED_NOT_EXPANDED
```

## Phase P16 — generator architecture expansion

P16 expands the generator architecture before the main content build. It must make structural variety possible.

Required DSL dimensions:

```text
topicDomain: school, sport, science, history, geography, art, music, outdoor, home, community, library, theatre, transport, nature, technology
sentenceShape: simple, compound, complex, embedded, fronted, reported, list, multi-clause, contrast, cause-effect
register: classroom, narrative, instruction, report, explanation, dialogue, notice, formal, informal
contextType: sentence, mini-passage, note-pair, list, bullet-list, paragraph, speech exchange, GPS-style prompt
misconceptionType: missing-mark, wrong-mark, over-punctuation, boundary-loss, comma-splice, possession-number, quote-placement, list-confusion, fragment-answer
answerFormat: choice, insert, fix, combine, transfer, paragraph, open-production
validatorIntent: exact-repair, flexible-sentence, paragraph-repair, bullet-consistency, direct-speech, list-structure, possession, contraction, boundary-preservation
```

Acceptance:

- At least 126 generated families are defined or generated from family specs.
- Every published skill has at least 8 families, including at least 2 transfer/open-production families.
- Each family declares skill IDs, mode, misconception intent, answer format, validator intent, and review category.
- Each family has a deterministic generation path and stable variant signatures.
- Every family has at least 80 unique learner-facing generated surfaces available at production depth.
- Existing P14 families remain backward-compatible unless deliberately retired through a review register.

P16 exits with:

```text
GENERATOR_ARCHITECTURE_READY
```

## Phase P17 — skill-by-skill production expansion

P17 is the main content expansion. It must be skill-balanced, not simply high total count.

Acceptance by published skill:

```text
unique learner-facing surfaces per skill:        >= 500
open/typed items per skill:                      >= 300
transfer/open-production items per skill:        >= 120
choice/recognition items per skill:              >= 80
paragraph/combine/list/deeper-context exposure:  present where pedagogically valid
misconception tags per skill:                    >= 8 distinct tags or all known tags for that skill
```

Published skills:

```text
sentence_endings
list_commas
apostrophe_contractions
apostrophe_possession
speech
fronted_adverbial
parenthesis
comma_clarity
colon_list
semicolon
dash_clause
semicolon_list
bullet_points
hyphen
```

Acceptance overall:

```text
runtime items:                  >= 12,000 by P17 exit
unique learner surfaces:         >= 11,500 by P17 exit
no generated model duplicates:   no unapproved duplicate model clusters over threshold
model self-marking failures:     0
```

P17 exits with:

```text
SKILL_BALANCED_POOL_READY
```

## Phase P18 — open-answer, transfer, paragraph, and marking hardening

P18 treats open answer marking as a separate risk. It must not be bundled into raw expansion.

Acceptance:

- Every open/typed item has one of: accepted variants, validator, rubric, or generated oracle.
- Transfer answers reject token-only fragments such as `yes`, `ok`, `a comma`, or copied prompt fragments.
- Paragraph repairs preserve sentence boundaries unless the item explicitly teaches boundary correction.
- Direct speech marking rejects missing reporting commas where required, missing closing quotes, and punctuation outside quotes when the model requires inside punctuation.
- Apostrophe marking preserves spacing around plural possessive apostrophes and does not normalise away meaningful possession-number errors.
- Colon, semicolon, dash, hyphen, bullet-list, and parenthesis items each have negative vectors for common overuse and underuse errors.
- Every generated family has at least 5 negative-vector examples, and every published skill has at least 40 negative-vector examples.
- Model answers still self-mark correct at 100%.

Required reports:

```text
reports/punctuation/punctuation-qg-p18-negative-vector-register.json
reports/punctuation/punctuation-qg-p18-open-answer-fairness.json
reports/punctuation/punctuation-qg-p18-marking-matrix.json
```

P18 exits with:

```text
OPEN_MARKING_HARDENED
```

## Phase P19 — scheduler, cooldown, session variety, and UI/UX session feel

P19 makes the expanded pool feel expanded. A large pool can still feel repetitive with weak scheduling.

Scheduler acceptance:

- No same item twice in one session.
- No same variant signature twice in one session.
- No same generated family more than twice in one six-question Smart session unless the session is explicitly focused/remedial.
- No same learner-facing surface inside the last 100 surfaced questions for normal Smart sessions unless weak/retry evidence explicitly overrides the cooldown.
- Weak/due/retry items are not hidden just to fake variety.
- Transfer/open-production exposure is capped so it appears regularly but does not dominate normal Smart sessions.
- Paragraph and deeper-context items appear often enough to maintain transfer but not so often that short sessions feel exhausting.

Heavy-play acceptance:

```text
one learner, 50 Smart six-question sessions:        >= 220 unique surfaced items
one learner, 50 sessions, immediate repeats:        0
one learner, 50 sessions, same-signature repeats:   0 inside a session
10 learners, 50 sessions each:                      >= 1,200 unique surfaced items overall
average modes per six-question Smart session:       >= 4
transfer/open-production ratio in Smart sessions:   0.12 to 0.35 unless learner state justifies otherwise
```

UI/UX acceptance:

- Setup/landing keeps one primary action for Punctuation practice.
- Session copy tells the learner clearly what kind of answer is expected.
- Typed answer boxes are prefilled only for repair/insert modes where prefill supports the task.
- Paragraph and bullet-list tasks use multiline input.
- Feedback shows the corrected sentence/passage in readable form.
- Summary explains progress without implying bigger pool equals faster Stars.
- Adult/admin diagnostic view exposes repetition metrics without surfacing internal generated IDs to children.

P19 exits with:

```text
HEAVY_PLAY_VARIETY_READY
```

## Phase P20 — reviewer governance, production rollout, and certification

P20 makes the system maintainable and production-certifiable.

Governance acceptance:

- Every runtime item is approved, or inherits approval from an approved family generation rule and approved negative-vector pack.
- Blocked and needs-review items are excluded from production runtime.
- Duplicate learner-facing surfaces are allowed only when explicitly approved as deliberate contrast pairs.
- Reviewer register records reviewer, timestamp, decision, decision scope, and reason.
- Review register can be machine-validated against the actual runtime pool.
- Manual fixed items and generated items are both covered.

Required P20 artefacts:

```text
reports/punctuation/punctuation-qg-p20-expansion-audit.json
reports/punctuation/punctuation-qg-p20-review-register.json
reports/punctuation/punctuation-qg-p20-negative-vector-register.json
reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json
reports/punctuation/punctuation-qg-p20-production-smoke.json
```

Production smoke acceptance:

```text
environment: production
origin present and expected
releaseId: punctuation-qg-p20-{runtimeCount}-{yyyy-mm-dd}
runtimeItemCount matches release ID embedded count
worker version or commit present
authenticated coverage true
admin diagnostic coverage true
Smart six-question sample has 6 unique items and 0 immediate repeats
post-P20 expansion audit status PASS
review register status PASS
negative-vector register status PASS
```

P20 exits with:

```text
FULL_PUNCTUATION_QG_HEAVY_PLAY_CERTIFIED
```

## Required package scripts

The implementation should expose:

```json
{
  "audit:punctuation-qg:p20-expansion": "node scripts/audit-punctuation-qg-p20-expansion.mjs --json --out reports/punctuation/punctuation-qg-p20-expansion-audit.json",
  "verify:punctuation-qg:p20-expansion": "npm run audit:punctuation-qg:p20-expansion && node --test tests/punctuation-qg-p20-expansion.test.js"
}
```

`verify:punctuation-qg:p20-expansion` is expected to fail on the P14/P15 baseline. It is a post-P20 acceptance gate, not a claim that the current pool already satisfies the ultimate target.

## Release ID rule

P20 release IDs must follow:

```text
punctuation-qg-p20-{runtimeItemCount}-{yyyy-mm-dd}
```

The verifier must parse the embedded runtime count and compare it with the actual runtime pool count. A release ID with a correct-looking format but a false count is a failed release.

## Evidence rule

No phase may be marked complete from prose alone. Each phase needs source artefacts and generated evidence. Production certification requires production evidence with environment, origin, release ID, runtime count, authenticated coverage, admin coverage, and pass/fail result.

Implementation delivered does not equal rollout evidence accepted.
