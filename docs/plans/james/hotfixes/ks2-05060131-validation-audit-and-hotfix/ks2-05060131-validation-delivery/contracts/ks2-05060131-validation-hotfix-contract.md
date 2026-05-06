# KS2 Mastery 05060131 validation hotfix contract

Status: ready for application
Primary snapshot: `ks2-mastery-lean-05060131.zip`
Scope: post-delivery validation of the uploaded lean ZIP, with focused hotfixes for source bugs found during the audit.

## Evidence boundary

The uploaded ZIP is the primary artefact for this contract. Local test runs prove behaviour for that extracted snapshot only. GitHub `main` was used only as an exact-file supplement to check whether the same risky source exists there. Production status is accepted only where a committed smoke/evidence artefact contains origin, release ID, timestamp, and pass/fail state.

The lean ZIP intentionally uses asset placeholders. This contract does not certify visual asset payload completeness.

## Findings covered by this patch

### BUG-001 — Hero daily date key is locale-shape dependent

`shared/hero/seed.js` currently derives the Hero daily `dateKey` by calling `Intl.DateTimeFormat('en-CA').format(...)` and assuming the returned string is `YYYY-MM-DD`. In this validation environment, it returned `04/27/2026`. That breaks Hero's daily contract because scheduler seed, quest ID, metrics grouping, and day-boundary logic depend on a stable ISO-like date key.

Required fix:

- Build the date key using `Intl.DateTimeFormat(...).formatToParts()`.
- Assemble the result explicitly as `YYYY-MM-DD`.
- Keep timezone-aware behaviour.
- Fall back safely when a timezone string is invalid.

Acceptance tests:

- `tests/hero-contracts.test.js`
- `tests/hero-p6-datetime.test.js`
- `tests/hero-contracts.test.js` adds `deriveDateKey falls back safely when timezone is invalid`.

### BUG-002 — Reading exact-answer matcher accepts learner substrings

`worker/src/subjects/reading/engine.js` allowed a learner answer to pass an `exactAny` check when the model answer contained the learner answer. That means a short fragment such as `he` can be accepted if the model answer contains `he`.

Required fix:

- Exact answers must accept exact normalised equality.
- Exact answers may accept the full model phrase embedded inside a longer learner answer.
- Exact answers must not accept learner substrings of the model answer.
- `containsAny` checks must use phrase-boundary containment, not arbitrary character substring containment.

Acceptance test:

- `tests/worker-reading-runtime.test.js` adds `reading exact match checks reject learner substrings of the correct answer`.
- `tests/worker-reading-runtime.test.js` adds `reading contains checks use phrase boundaries rather than character substrings`.

### BUG-003 — Reading stale/duplicate responses can overwrite marked answers

The Reading runtime accepted `save-response` without checking payload `expectedSessionId` / `expectedQuestionId`. It also wrote a new response before discovering that a question was already marked. That created a mismatch risk: stored response could change while stored result and feedback stayed from the earlier answer.

Required fix:

- `save-response` rejects stale `expectedSessionId`.
- `save-response` rejects stale `expectedQuestionId`.
- `save-response` rejects saves for already marked questions.
- `submit-answer` rejects already marked questions before mutating `responses`.
- Duplicate/stale submissions emit no new events and do not alter response/result state.

Acceptance tests:

- `tests/worker-reading-runtime.test.js` adds `reading save-response rejects stale expected session or question ids`.
- `tests/worker-reading-runtime.test.js` adds `reading marked answers cannot be overwritten by duplicate or stale submissions`.

## Patch contents

Apply from repository root:

```bash
git apply patches/001-hero-datekey-reading-integrity-hotfix.patch
```

Files changed:

```text
shared/hero/seed.js
worker/src/subjects/reading/engine.js
tests/hero-contracts.test.js
tests/worker-reading-runtime.test.js
```

## Required verification after applying

Minimum local gate:

```bash
node --check shared/hero/seed.js
node --check worker/src/subjects/reading/engine.js
node --check tests/hero-contracts.test.js
node --check tests/worker-reading-runtime.test.js
node --test tests/hero-contracts.test.js tests/hero-p6-datetime.test.js tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js
```

Regression gate for previously validated punctuation release:

```bash
npm run verify:punctuation-qg:p20
```

Recommended Node 22 gate outside this lean-ZIP environment:

```bash
npm test
npm run check
npm run verify:grammar-qg-p20
```

## Explicit non-goals

This patch does not change Hero economy, Hero Camp, subject reward projection, Grammar QG content, Punctuation QG content, Reading content, Cloudflare routing, or visual asset payloads. It also does not fake production smoke evidence.

## Acceptance decision

Accept the uploaded snapshot with this hotfix applied. Without this hotfix, Hero daily scheduling has a cross-runtime date-key risk, and Reading has two integrity weaknesses that are easy to miss in happy-path tests.
