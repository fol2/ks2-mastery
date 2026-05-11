# Reading validation, hotfix, interface, and content-pool expansion contract

## Evidence boundary

Primary evidence is the uploaded local ZIP snapshot: `ks2-mastery-lean-05102302.zip`.
GitHub is supplementary evidence for recent Reading commits and current-main comparison only. Local ZIP runs prove behaviour for the extracted snapshot plus this patch. Production is not certified by this package.

## Scope

This patch is Reading-only except for adding one `package.json` script entry for the Reading audit. It modifies:

- `worker/src/subjects/reading/engine.js`
- `src/subjects/reading/components/ReadingPracticeSurface.jsx`
- `shared/reading/content.js`
- `shared/reading/metadata.js`
- `scripts/audit-reading-content-quality.mjs`
- Reading-focused tests
- `package.json` audit script registration

It does not modify Spelling, Grammar, Punctuation engines, Hero economy, Stars, monsters outside Reading reward tests, learner-profile storage, migrations, or production deployment scripts.

## Bug contract: post-span negation must not earn Reading marks

The Reading matcher must reject learner answers/evidence that contain a correct phrase but immediately contradict it after the phrase.

Before this patch, the uploaded ZIP correctly rejected prefix negation such as `not speech marks`, but still accepted post-span negation such as:

- `speech marks are not needed`
- `the house around her seemed to change did not happen`
- `folded slips of paper were not inside`

Acceptance:

- Exact/contains checks reject local prefix negation.
- Exact/contains checks reject local post-span negation/falsifier patterns.
- Keyword group checks reject local post-span negation when the group itself is negated.
- Evidence fallback does not award the evidence mark for locally contradicted overlap evidence.
- Legitimate contrast remains valid, for example `folded slips of paper, but not coins`.
- `not only ...` remains valid where the phrase itself is being affirmed.

## Interface contract: delayed feedback final question label

The Reading one-question delayed-feedback UI must not tell a child to “Save and next” when there is no next question.

Acceptance:

- Immediate-feedback mode keeps `Submit answer`.
- Delayed-feedback mode shows `Save and next` when another question exists.
- Delayed-feedback mode shows `Save answer` on the final question.
- Mark buttons keep mode-specific wording: `Mark now`, `Mark this section`, or `Mark whole paper`.
- The Reading session remains inside the existing webapp frame; no route/frame redesign is introduced.

## Question-pool expansion contract

The Reading pool must be expanded systematically rather than by adding near-duplicates.

Acceptance:

- Add at least three original passages across fiction, non-fiction, and poetry.
- Add at least one complete 50-mark Reading paper referencing the new passages.
- Preserve all 12 Reading/Punctuation support skills.
- Preserve answer-safe metadata: browser metadata must not include answers/checks/rubrics.
- Keep duplicate normalised stems at zero.
- Keep duplicate model answers at zero.
- Keep repeated stem-shape advisories at zero in the new audit.
- All evidence snippets must appear in their source passage.
- Every paper must reference existing questions and sum to exactly 50 marks.

## Validation commands

From a fresh ZIP extraction after applying the patch:

```bash
git apply --check patches/001-reading-post-negation-ui-and-pool-expansion.patch
git apply patches/001-reading-post-negation-ui-and-pool-expansion.patch
node scripts/audit-reading-content-quality.mjs --out=reports/reading/reading-content-quality-audit.json
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js \
  tests/hero-providers.test.js \
  tests/hero-launch-adapters.test.js \
  tests/monster-system.test.js \
  tests/button-label-consistency.test.js
```

The React render-level `tests/reading-session-interface.test.js` also needs to pass in a dependency-complete repo checkout. In this lean ZIP environment it cannot run because `esbuild` is not present.
