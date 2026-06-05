---
title: Secure Vocabulary Sentence Repair
status: completed
date: 2026-06-05
origin: user request
---

# Secure Vocabulary Sentence Repair Plan

## Problem

The secure-extension spelling vocabulary currently contains repeated placeholder sentences in the form `The teacher wrote the word ... on the board for secure vocabulary spelling practice.` These sentences do not show word meaning and make the spelling Word Bank feel unfinished.

## Scope

Repair the published spelling content so every affected secure vocabulary word has at least one usable, context-bearing example sentence. The follow-up quality standard is stricter than simple placeholder removal: the latest secure vocabulary release must have no exact duplicate sentences, no normalised duplicate sentences, and no repeated sentence frame after the target word is blanked out. Keep the work to content, generated runtime artefacts, and regression coverage. Do not change spelling progression, remote sync, learner state, D1 schema, or non-spelling subject behaviour.

## Requirements

- Replace every secure vocabulary sentence using the repeated board-practice template in `content/spelling.seed.json`.
- Replace the first repair pass's weak generated frames with safer word-sensitive, source-bucket-aware sentences.
- Preserve each existing `sentenceEntryIds` link, word slug, accepted spelling, provenance, list membership, publication metadata, and spelling pool classification.
- Regenerate the spelling runtime artefacts consumed by the app and Worker.
- Add a regression check that fails if the board-practice template returns to the published spelling content.
- Add a regression check that fails on exact duplicate, normalised duplicate, or blanked-target repeated-frame secure vocabulary sentences.
- Deploy through the package scripts, not raw Wrangler, and verify production content after deployment.

## Existing Patterns

- `content/spelling.seed.json` is the source content bundle.
- `scripts/generate-spelling-content.mjs` regenerates `src/subjects/spelling/data/content-data.js`, `src/subjects/spelling/data/word-data.js`, and `worker/src/generated-spelling-content-seed.js`.
- `tests/spelling-content.test.js` already covers spelling content integrity and is the best place for a narrow content-regression assertion.
- Deployment must use `npm run check` and `npm run deploy`, matching `AGENTS.md`.

## Implementation Units

### 1. Sentence Content Repair

Files:
- `content/spelling.seed.json`

Replace the lazy sentence text for each affected `secure-vocabulary-*__01` entry with a sentence that uses the word in a plausible school, subject, writing, maths, science, geography, history, morphology, or general-vocabulary context. Keep all IDs and metadata unchanged.

Test scenarios:
- All affected entries still reference an existing word slug.
- No secure vocabulary sentence contains `on the board for secure vocabulary spelling practice`.
- Each repaired sentence still contains its target word as a whole word or accepted spelling.
- The latest published secure vocabulary snapshot contains exactly 1,215 secure-extension words and zero duplicate-frame audit issues.

### 2. Runtime Regeneration

Files:
- `src/subjects/spelling/data/content-data.js`
- `src/subjects/spelling/data/word-data.js`
- `worker/src/generated-spelling-content-seed.js`

Run the existing generator after the seed edit. Do not hand-edit generated files.

Test scenarios:
- The generated runtime files contain no board-practice secure vocabulary sentence.
- The generated content remains valid under the existing spelling content model.

### 3. Regression Coverage

Files:
- `tests/spelling-content.test.js`

Add a targeted test that inspects the published spelling snapshot or seed-backed content and rejects the repeated board-practice template for secure vocabulary entries.

Test scenarios:
- The test fails on the current placeholder content.
- The test passes after the repaired sentences and generated artefacts are in place.

### 4. Release Verification

Files:
- Evidence files only if needed under existing report or validation locations.

Run focused spelling content validation, then the repo-required `npm test` and `npm run check`. After deploy, verify `https://ks2.eugnel.uk` exposes the updated spelling content using production API/browser evidence.

Test scenarios:
- Local tests pass.
- Production `/api/version` reflects the deployed build.
- Production Word Bank or spelling content proof shows repaired secure vocabulary sentences and no banned template.

## Risks

- The content edit is large, so validation must check both absence of the lazy template and preservation of word linkage.
- Generated files are large and may create a noisy diff; this is expected, but only generated spelling artefacts should change.
- Production verification needs a logged-in or demo-capable browser/API path for spelling Word Bank content.

## Out Of Scope

- Rewriting secure vocabulary explanations.
- Reclassifying secure vocabulary words between Core and Extra.
- Changing remote learner state, D1 migrations, R2 assets, or spelling session logic.
