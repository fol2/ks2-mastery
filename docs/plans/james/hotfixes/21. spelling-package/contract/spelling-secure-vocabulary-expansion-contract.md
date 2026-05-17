# Spelling Secure Vocabulary Expansion — Local Codex Execution Contract

## 1. Title and purpose

**Title:** Spelling Secure Vocabulary Expansion — coverage taxonomy, content pipeline, runtime hardening, and production validation.

**Purpose:** Expand KS2 Mastery Spelling beyond the current statutory/core-sized word set into a larger secure-vocabulary programme without corrupting statutory SATs-style practice, Mega/post-Mega semantics, learner-facing copy, answer marking, reward/mastery boundaries, Hero/monster logic, data integrity, accessibility, routing, deployment behaviour, or hard-refresh production behaviour.

This is not a simple word-list import. The local agent must create a defensible content and coverage contract for vocabulary that “needs to be secured,” then implement only changes that can be validated from source, generated content reports, tests, audits, reviewer passes, and live production evidence.

## 2. Source authority

### ZIP evidence

Primary supplied snapshot:

- ZIP: `ks2-mastery-lean-05161145.zip`
- ZIP path in ChatGPT environment: `/mnt/data/ks2-mastery-lean-05161145.zip`
- SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`
- Archive shape: rootless lean review archive.
- Manifest evidence: review profile; source/scripts/tests/fixtures/repo config included; `assets/**`, `reports/**`, and `output/**` omitted; `tracked_total=5138`, `copied=1544`, `omitted=3594`, `placeholders=0`.
- `.git`: not present in the extracted ZIP. Do not use ZIP extraction as Git history evidence.

The ZIP is authoritative for the supplied snapshot and for this patch package unless a newer branch/ref is explicitly provided by the maintainer.

### GitHub evidence

Supplementary repo evidence checked:

- Repository: `fol2/ks2-mastery`
- Ref: `main`
- Default branch reported by GitHub API: `main`
- Exact file fetched: `worker/src/repository.js`
- GitHub blob SHA for fetched file: `a20215b8519c99fca4c05922ba1bc0c47c17108f`
- Local ZIP git blob SHA for the same file: `a20215b8519c99fca4c05922ba1bc0c47c17108f`

This confirms only that this file is byte-identical between the uploaded ZIP and fetched GitHub `main` for the two adjacent issues patched here. It does not prove the whole ZIP equals GitHub `main`.

### Local-run evidence

Local checks were run only against extracted ZIP snapshots in this ChatGPT container. They prove local behaviour in that environment only.

Local runtime caveat:

- Local `node --version`: `v18.20.4`
- Repository `.nvmrc`: `22`
- Worker/server harness checks that import `node:sqlite` could not run faithfully in this environment.

### Production evidence

Production is **not proven** by this package. A live open of `https://ks2.eugnel.uk` only proves the public app shell was reachable at review time; it does not prove this spelling expansion, patch, endpoint behaviour, deploy source, hard-refresh journey, or release identifier.

## 3. Patch root and apply assumptions

Patch file in this package:

- `patches/001-spelling-expansion-cache-and-admin-signal.patch`

Apply from the repository root, either from a clone of `fol2/ks2-mastery` at the intended branch/ref or from a clean extraction of the rootless ZIP snapshot.

Recommended commands:

```bash
# from repo root
patch --dry-run -p1 < patches/001-spelling-expansion-cache-and-admin-signal.patch
patch -p1 < patches/001-spelling-expansion-cache-and-admin-signal.patch
```

Patch status from ChatGPT local validation:

- Dry-run on a fresh ZIP extraction: passed.
- Apply on a fresh ZIP extraction: passed.
- Post-patch `npm run content:validate`: passed.
- Post-patch Worker endpoint test/probe: not run successfully in ChatGPT container because Node 18 lacks `node:sqlite`; must be run under Node 22 by the local agent.

The patch is intentionally small. It does **not** implement the full vocabulary expansion.

## 4. Scope

In scope:

- Spelling content taxonomy for official statutory words, secure-extension vocabulary, and enrichment/extra vocabulary.
- Spelling content import/generation/validation pipeline.
- Spelling runtime/read-model/scheduler/mode semantics where directly affected by expanded secure vocabulary.
- Spelling Worker/account content APIs and admin content-quality signals where directly affected.
- Existing spelling UI copy only where needed to avoid learner/adult misunderstanding of statutory vs secure-extension vs enrichment vocabulary.
- Performance and bundle/runtime capacity evidence for thousands of words.
- Audio/TTS coverage planning for new words, if learner-facing dictation depends on audio.
- Tests, audits, reviewer packs, release reports, and live production verification.

## 5. Non-goals

Do not use this task to redesign unrelated subjects or gameplay. Do not widen the work into Grammar, Punctuation, Arithmetic, Reasoning, Reading, Hero Mode, monsters, reward economy, Stars, broader mastery projection, or production config unless a narrowly necessary regression fix is required and separately evidenced.

Do not claim “all suitable vocabulary” has been secured unless the source list, inclusion criteria, adult review status, runtime coverage, scheduler coverage, learner journey, and production evidence prove it.

## 6. No-go areas

The local agent must not:

- Dump thousands of new secure words into the existing `extra` pool and claim they are secured. Current mature flows treat Extra differently from core.
- Dump all secure-extension words into the existing statutory/core pool if that would distort SATs-style tests, Mega, Guardian, Boss, or historical graduation semantics.
- Change answer marking to accept non-UK spellings unless each variant is explicitly approved per word.
- Weaken independent evidence requirements for secure/Mega/post-Mega progress.
- Change reward/mastery/Stars/Hero/monster logic except read-only boundary updates required to prevent spelling regressions.
- Add new random rewards, streak pressure, loot-box mechanics, or Hero coin changes.
- Move spelling session creation, marking, scheduling, progress mutation, or reward projection into browser-only logic.
- Hide content provenance or adult-review gaps behind generated reports.
- Deploy or mark `DONE` without live verification on `https://ks2.eugnel.uk`.

## 7. Files and areas likely to change

Likely content/data files:

- `content/spelling.seed.json`
- New secure vocabulary source/import files, if introduced, under `content/`.
- `src/subjects/spelling/data/content-data.js`
- `src/subjects/spelling/data/word-data.js`

Likely model/generator/validator files:

- `src/subjects/spelling/content/model.js`
- `src/subjects/spelling/content/patterns.js`
- `src/subjects/spelling/content/data-transfer.js`
- `scripts/validate-spelling-content.mjs`
- `scripts/generate-spelling-content.mjs`
- Any new import/audit/reviewer scripts for secure vocabulary.

Likely runtime/read-model files:

- `src/subjects/spelling/service-contract.js`
- `src/subjects/spelling/read-model.js`
- `src/subjects/spelling/client-read-models.js`
- `src/subjects/spelling/components/spelling-view-model.js`
- `src/subjects/spelling/components/SpellingSetupScene.jsx`
- `src/subjects/spelling/components/SpellingWordDetailModal.jsx`
- `shared/spelling/service.js`
- `worker/src/subjects/spelling/*`
- `worker/src/content/spelling-read-models.js`
- `worker/src/repository.js`

Likely tests:

- `tests/spelling-content.test.js`
- `tests/spelling-content-api.test.js`
- `tests/spelling-core.test.js`
- `tests/spelling-progression.test.js`
- `tests/spelling-mega-invariant.test.js`
- `tests/spelling-guardian.test.js`
- `tests/spelling-sticky-graduation.test.js`
- `tests/spelling-remote-sync-hydration.test.js`
- `tests/server-spelling-engine-parity.test.js`
- `tests/worker-spelling-read-model.test.js`
- `tests/react-spelling-surface.test.js`
- `tests/precache-spelling-audio.test.js`
- `tests/build-spelling-word-audio*.test.js`
- `tests/bundle-audit.test.js`

## 8. Exact implementation tasks

### Task A — Source ledger and divergence check

1. Confirm the working source: uploaded ZIP, GitHub `main`, branch, PR, or named commit.
2. Record source boundary in the final evidence:
   - ZIP name/hash.
   - GitHub repo/ref/commit.
   - Whether the branch differs from the ZIP snapshot.
   - Which source is authoritative for implementation.
3. If the working branch differs from the ZIP patch root, apply the patch only after verifying equivalent code paths and updating the patch if necessary.

### Task B — Apply or verify equivalent patch

1. Apply `patches/001-spelling-expansion-cache-and-admin-signal.patch`, or prove the branch already has equivalent fixes.
2. Run under Node 22:
   - `node --test tests/spelling-content-api.test.js`
   - Any narrower endpoint test needed to prove `/api/admin/ops/content-quality-signals` reports spelling item coverage from persisted content.
3. Confirm `spellingRuntimeContentRowKey` no longer uses the entire `content_json` string as the Map key.
4. Confirm spelling content-quality item coverage derives from actual runtime snapshot/summary fields, not nonexistent `publication.runtimeWordCount` or `bundle.secureCoreCount`.

### Task C — Define the secure vocabulary taxonomy

Create and implement a clear taxonomy before importing thousands of words. Minimum viable taxonomy:

- `statutory-core`: official statutory programme/list vocabulary that must remain the basis for current SATs-style/core semantics.
- `secure-extension`: suitable KS2 vocabulary that must be secured, scheduled, reviewed, and evidenced, but must not be misrepresented as the official statutory list.
- `enrichment-extra`: optional/enrichment words that can be practised but do not gate statutory core or secure-extension mastery.

The exact field names are up to the local agent, but the distinction must be durable in content, runtime snapshots, read models, scheduler eligibility, admin reports, and UI copy.

### Task D — Implement import and review provenance

For every new secure-extension word, capture at least:

- canonical spelling;
- accepted spellings/variants;
- rejected/common-confusion variants where useful;
- year suitability or stage suitability;
- category/source/provenance;
- review status and reviewer identity/source where applicable;
- UK spelling policy decision;
- pattern/morphology tags;
- family/root relation;
- example sentences suitable for KS2;
- any safety/exclusion notes;
- audio/TTS requirement status.

Do not release a generated or scraped list without adult-review evidence and validation gates.

### Task E — Extend validators and audits

Update or add validators to fail, not merely warn, on release-blocking issues:

- duplicate canonical words across tiers;
- duplicate accepted variants that collide across words;
- missing or weak explanations;
- missing or low-quality example sentences;
- unsafe/offensive/adult/age-inappropriate terms;
- ambiguous UK/US spelling variants;
- missing provenance/review status for secure-extension words;
- missing pattern/family tags where the word is meant to serve a pattern;
- dead launchable patterns or threshold regressions;
- content release metadata mismatch;
- generated runtime counts that differ from source counts;
- audio coverage gaps for dictation-required words.

Existing `npm run content:validate` currently passes with six pattern warnings in the ZIP. The expansion must reduce or explicitly quarantine these warnings, not bury them under a larger content set.

### Task F — Preserve mode semantics

Mode rules must be explicit and tested:

- SATs/Test mode must stay official/statutory by default unless a clearly labelled secure-extension test mode is added.
- Smart Review may schedule secure-extension words only when the learner’s readiness and task type make sense.
- Trouble Drill must include secure-extension words only after those words have learner evidence.
- Word Bank filters must distinguish statutory/core, secure-extension, and enrichment/extra.
- Mega/post-Mega must not silently flip for historically graduated learners without transparent “new secure words added” handling.
- Guardian/Boss/Pattern Quest must avoid overclaiming: a statutory-Mega child should keep their statutory achievement while receiving honest secure-extension maintenance/growth tasks.

### Task G — Scale and performance proof

Current ZIP snapshot is small enough for the existing static generated data shape, but thousands of words may change that. Before release, prove:

- generated JS/data size remains acceptable or is split/lazily loaded;
- Worker cold start and D1 read paths remain within budget;
- content import/publish remains deterministic and idempotent;
- runtime read-model generation does not regress;
- bundle audit passes;
- production client lockdown remains intact;
- no accidental TTS spend explosion is introduced.

If the static generated files become too large, split the content path before shipping the vocabulary expansion.

### Task H — UI and copy updates

Learner/adult-facing copy must be honest:

- “Official/statutory spellings” means official statutory coverage.
- “Secure vocabulary” means approved KS2 extension coverage.
- “Extra/enrichment” means optional practice.
- Do not tell a child they lost Mega because the system added thousands of new words. Use a low-pressure “new secure words are ready” model.

### Task I — Release ID and migration semantics

Update release metadata only when it truly affects learner-facing secure coverage. If secure-extension words are added:

- bump content model/release metadata as appropriate;
- produce a release manifest with statutory count, secure-extension count, enrichment count, sentence count, audio status, validator result, reviewer status, and generation timestamp;
- ensure account-scoped published content routes pin learner runtime reads to the correct release;
- ensure historical progress imports and post-Mega records remain valid.

## 9. Previous-work validation tasks

Before implementing, validate and record the current state:

1. Run `npm run content:validate` and capture the exact summary.
2. Confirm current runtime counts from the published release.
3. Confirm current list split: statutory/core vs Extra.
4. Confirm existing tests prove Extra does not currently behave like statutory/core.
5. Confirm current `SPELLING_CONTENT_RELEASE_ID` semantics and whether the expansion requires a bump.
6. Confirm patch-equivalent fixes for runtime content cache key and admin content-quality signals.
7. Search diff for forbidden unrelated changes:
   - reward;
   - mastery;
   - Stars;
   - Hero Mode;
   - monsters;
   - subject progression outside spelling;
   - production config.

## 10. Acceptance criteria

All must pass before the local agent may use `DEPLOYMENT READY`.

1. Source boundary is explicit and divergence, if any, is reported.
2. Vocabulary taxonomy is implemented and visible in source, runtime, admin summary, and learner/adult copy.
3. Official/statutory coverage is preserved and not inflated by secure-extension words.
4. Secure-extension words have provenance, adult-review status, age suitability, UK spelling decisions, pattern tags, explanations, and sentence coverage.
5. All generated content artefacts are deterministic and counts reconcile source → generated data → Worker persisted content → runtime read model.
6. Existing mature spelling modes still work: Smart Review, Trouble Drill, SATs/Test, Word Bank, Pattern Quest, Guardian, Boss/post-Mega, import/export/hydration.
7. Historical Mega/post-Mega users are not unfairly downgraded or mislabelled.
8. Content validation has zero errors. Pattern warnings are either fixed or explicitly quarantined with non-launchable status.
9. The patch-equivalent cache and admin signal fixes are verified under Node 22.
10. Performance/bundle/runtime budgets pass with the expanded word count.
11. Audio/TTS plan is validated for all words that require dictation audio.
12. No unrelated reward/mastery/Stars/Hero/monster changes are present.
13. Code Reviewer and Contract Auditor both return the exact required PASS line.
14. Live production is verified before `DONE — LIVE VERIFIED` is claimed.

## 11. Required commands, tests, and audits

Use Node from `.nvmrc` first:

```bash
node --version      # must be Node 22.x for Worker/server tests
npm ci
```

Minimum commands:

```bash
npm run content:validate
npm run content:generate
npm run check
npm run audit:client
```

Minimum spelling tests, adapting command syntax to the repo’s test runner:

```bash
node --test tests/spelling-content.test.js
node --test tests/spelling-content-api.test.js
node --test tests/spelling-core.test.js
node --test tests/spelling-progression.test.js
node --test tests/spelling-mega-invariant.test.js
node --test tests/spelling-guardian.test.js
node --test tests/spelling-sticky-graduation.test.js
node --test tests/spelling-remote-sync-hydration.test.js
node --test tests/server-spelling-engine-parity.test.js
node --test tests/worker-spelling-read-model.test.js
node --test tests/react-spelling-surface.test.js
node --test tests/precache-spelling-audio.test.js
node --test tests/build-spelling-word-audio*.test.js
node --test tests/bundle-audit.test.js
```

Add and run new commands for the expansion, for example:

```bash
node scripts/import-spelling-secure-vocabulary.mjs --check --json
node scripts/audit-spelling-secure-vocabulary.mjs --json
node scripts/build-spelling-secure-vocabulary-review-pack.mjs --json
node scripts/verify-spelling-secure-vocabulary-release.mjs --json
```

The exact script names may differ, but equivalent import, audit, reviewer-pack, and release-verification evidence is mandatory.

## 12. Regression checks

After implementation, perform targeted regression checks for:

- SATs/Test uses only official/statutory words by default.
- Secure-extension words appear only in labelled secure-extension contexts.
- Existing Extra/enrichment words remain optional and do not gate statutory Mega.
- Smart Review and Trouble Drill do not over-focus newly imported words at the expense of due/weak statutory work.
- Pattern Quest does not launch patterns with too little safe coverage.
- Guardian/Boss/post-Mega journeys remain usable after a hard refresh.
- Adult/admin content summaries show separate statutory, secure-extension, and enrichment counts.
- Worker idempotency and stale-revision behaviour are unchanged.
- Answer marking remains exact for canonical spellings and approved variants only.
- Audio fallback/availability is clear and does not silently fail in production.
- Accessibility labels and keyboard flow remain usable in spelling setup/practice/summary surfaces.

## 13. Production deployment and verification requirement

`DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.

`DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.

`DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.

Live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- timestamp
- release/version/commit/build identifier where available
- deployment command or deployment source if applicable
- hard-refresh/browser check performed
- specific user journey checked
- pass/fail result
- logs/screenshots/console/network notes where relevant

If production cannot be checked, the final status must be:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

Required live user journeys:

1. Hard refresh `https://ks2.eugnel.uk`.
2. Confirm deployed commit/build/release identifier where exposed.
3. Use a signed-in Worker session or `/demo`, as appropriate for production QA.
4. Open Spelling setup/read model.
5. Verify statutory/core copy and counts.
6. Verify secure-extension copy and counts if implemented.
7. Start a relevant Spelling practice journey.
8. Complete at least one session path and confirm summary/progress/read-model consistency.
9. Check Word Bank filters.
10. Check admin/operations content-quality signal if the role/environment permits.
11. Record console/network failures, if any.

## 14. Required final evidence

Final local-agent evidence must include:

- source ledger;
- diff summary;
- exact patch or commit SHA;
- content release manifest;
- import/audit/reviewer-pack outputs;
- validator/test/audit command outputs with timestamps;
- bundle/performance evidence;
- forbidden-area diff/search evidence;
- production live evidence, or explicit production-not-proven status;
- Code Reviewer output;
- Contract Auditor output.

Do not summarize “tests passed” without command names, environment, and outputs or artifact paths.

## 15. Reviewer loop requirement

After implementation, the local agent must run two independent review passes:

- Code Reviewer.
- Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, “good to have” comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.
