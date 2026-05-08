# Punctuation P20 real scheduler and session UI hardening contract

## Scope

This patch is Punctuation-only. It changes scheduler candidate coverage, text-session input guarding, a related P20 generated-family cluster metadata correction, and tests for those behaviours.

It must not change Grammar, Reading, Spelling, Arithmetic, Reasoning, Hero Mode, monster thresholds, star projection, release IDs, production smoke reports, reviewer registers, punctuation item surfaces, model answers, generator templates, generated item counts, or generated punctuation content banks except for the two cluster metadata corrections listed in this contract.

## Contract: scheduler

The P20 production scheduler must inspect the full eligible candidate set by default. With the current expanded content, smart mode starts on `choose`, and the real content index has more than 32 published `choose` candidates. The default selection path must not silently truncate that set to the first 32 candidates.

Explicit `candidateWindow` values remain supported for deterministic probes and bounded tests. Passing `candidateWindow: 7` should inspect exactly 7 candidates while still reporting the full candidate count.

Acceptance checks:

- default smart/choose selection reports `inspectedCount === candidateCount` for the real P20 content index;
- explicit small candidate windows still report the requested inspected count;
- scheduler still returns a published item;
- existing bounded-window scheduler tests remain valid when they explicitly pass a window.

## Contract: P20 cluster metadata

The full-window scheduler exposed an existing P20 systematic generated-family metadata defect. The `parenthesis` primary skill was mapped to the `boundary` cluster and the `semicolon` primary skill was mapped to the `structure` cluster in the generated family config, which allowed focus-cluster starts to select an item from the wrong primary skill family.

The only generated content bank change allowed by this patch is:

- `parenthesis`: cluster `boundary` -> `structure`;
- `semicolon`: cluster `structure` -> `boundary`.

This correction must not change the P20 release ID, generated item count, fixed item count, runtime item count, item surfaces, item signatures, model answers, or generator templates.

Acceptance checks:

- P20 generated runtime items from `gen_p20_*` families keep each primary skill in the expected cluster;
- focus-cluster session starts stay within the requested primary skill cluster across deterministic random samples;
- legacy mixed generated families are not reclassified by this patch.

## Contract: session input

Text-answer sessions must not submit a blank or whitespace-only learner answer. This is enforced in two places:

- the primary text submit button is disabled while `typed.trim().length === 0`;
- the form submit handler returns early before dispatching when the trimmed answer is empty.

Choice-item behaviour is unchanged. Prefilled insert/fix/paragraph items remain submittable because the initial stem is real text. Transfer/combine blank answer boxes require a learner-entered answer before submit.

## Validation commands

From repo root after applying the patch:

```bash
node --test   tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js   tests/punctuation-session-input-hardening.test.js   tests/punctuation-session-ui.test.js
```

Recommended additional local confidence run when time allows:

```bash
node --test tests/punctuation-scheduler.test.js tests/punctuation-qg-p20-expansion.test.js tests/punctuation-qg-p20-production-evidence.test.js
```

Release-gate and deployment preflight commands required before production deployment:

```bash
npm run verify:punctuation-qg:p20
npm test
npm run check
```

## Production boundary

This contract validates source and local behaviour. It does not claim live production deployment, Cloudflare/D1 runtime behaviour, or a new live smoke unless a separate production evidence artefact with origin, timestamp, release ID, and pass/fail result is supplied.
