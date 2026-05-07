# Reading validation hotfix contract

## Evidence boundary

Primary local source snapshot: uploaded `ks2-mastery-lean-05070029.zip`.

This rebuilt package was produced from that ZIP snapshot and validated by applying the patch to a fresh extraction. It does not claim a fresh live production smoke or visual asset certification.

## Patch scope

The patch changes Reading-only runtime/content/UI/reward surfaces plus Reading tests:

- `worker/src/subjects/reading/engine.js`
- `src/platform/game/mastery/reading.js`
- `src/platform/game/mastery/index.js`
- `shared/reading/content.js`
- `src/subjects/reading/components/ReadingPracticeSurface.jsx`
- `tests/button-label-consistency.test.js`
- `tests/worker-reading-runtime.test.js`
- `tests/reading-content-contract.test.js`
- `tests/reading-session-interface.test.js`

No Spelling, Grammar, Punctuation, Hero scheduler, database migration, or production smoke script is changed. The button-label test update is test-only governance for the deliberate Reading list-mode label `Save this section`; it is included so the full repository gate remains reproducible.

## Defects fixed

### 1. Immediate passage repeat after session start/end

Before the patch, Reading passage selection only penalised recent answer events. A learner could start and end a session without answering, then immediately receive the same passage again.

The patch records a small `recentPassageStarts` memory in Reading data and excludes very recent started passages when alternatives exist. This is a scheduler selection guard; it never hides the only valid candidate.

Acceptance: the runtime test proves `red_tin_box -> city_swifts` after a start/end/no-answer flow with deterministic random `0`.

### 2. Guided mode repeated the same first-four questions

Before the patch, Guided mode returned `questions.slice(0, 4)`, so it ignored the existing weakness/diversity scheduler.

The patch routes Guided mode through the same weakness/diversity logic with a four-question limit.

Acceptance: the runtime test seeds the first four `red_tin_box` questions as strong and verifies Guided mode no longer returns the static first-four set.

### 3. Noticeable duplicate Reading question stems

The content bank had repeated generic stems after normalisation, especially summary/order prompts.

The patch rewords the repeated stems to be passage-specific while preserving ids, answer keys, marks, rubrics, options, model answers, papers, and release id.

Acceptance: the content audit reports:

```json
{
  "passageCount": 21,
  "questionCount": 182,
  "skillCount": 12,
  "duplicateNormalisedStemGroups": 0,
  "duplicateModelAnswerGroups": 0
}
```

### 4. One-question delayed-feedback UI had competing save/next controls

Before the patch, delayed-feedback one-question mode could expose two controls with effectively the same “Save and next” meaning.

The patch keeps a single primary save-and-next path in delayed-feedback mode, retains the secondary draft-next path for non-delayed draft navigation, and improves list-mode copy so the learner stays inside the Reading frame.

Acceptance: the static UI audit reports `saveAndNextCount: 1`, `hasShowDraftNextButton: true`, and `hasActiveForm: true`.

### 5. Reading monsters/stars needed deeper 100-star parity

Reading already had Reading-owned monster ids, but the reward state was still too count-like compared with the hardened Grammar/Punctuation 100-star model.

The patch adds:

- direct Reading 100-star thresholds;
- grand Reading 100-star thresholds for `lorequill`;
- persisted `starHighWater` and `displayStars` fields;
- `grandStars` / `grandStarMax` for the grand Reading monster;
- release-scoped mastered filtering so stale release keys cannot inflate the current release view;
- deep secure evidence and mastery keys on `reading.skill-secured` events.

Acceptance: the runtime tests verify release-scoped 100-star high-water behaviour and secure evidence payloads.

## Required acceptance gates

From repo root:

```bash
git apply --check --ignore-whitespace patches/001-reading-validation-hotfix-repo-root.patch
git apply --ignore-whitespace patches/001-reading-validation-hotfix-repo-root.patch

node --test \
  tests/worker-reading-runtime.test.js \
  tests/reading-content-contract.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Expected result: all targeted Reading/UI tests pass.

Repository closure gates:

```bash
npm test
npm run check
```

## Local validation result

Patch dry-run: pass.

Patch apply: pass.

Targeted Reading/UI tests: 35/35 pass.

Full repository `npm test`: 109154/109154 pass, 12 skipped.

Full repository `npm run check`: pass.

Content audit: 21 passages, 182 questions, 12 skills, 0 duplicate normalised stems, 0 duplicate model answers.

UI static audit: one save-and-next path, list-mode active form present, delegated Reading list panel present.

## Known limits

This package does not prove live production readiness. A production claim still requires a live smoke with origin, timestamp, release id, and pass/fail result.

The uploaded lean ZIP does not contain `node_modules`; therefore full React render testing that requires `esbuild` was not run in this rebuild. The package includes a static UI contract audit instead.
