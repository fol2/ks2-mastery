# KS2 Reading subject implementation report

## Source boundary

Primary implementation snapshot: uploaded ZIP `ks2-mastery-lean-05051614.zip`.

Reading content source: uploaded PoC `ks2_reading_mastery_structural_refactor.html`.

GitHub was checked only as repository metadata/supplement; the patch was built from the uploaded ZIP snapshot.

## What changed

Reading is promoted from placeholder/PoC into a Worker-owned production subject:

- `shared/reading/content.js` adds the Reading content release, KS2 skills, passages, questions and paper bank.
- `worker/src/subjects/reading/` adds the isolated Reading engine, command handlers and safe read-model builder.
- `src/subjects/reading/` adds client read models, command actions, event hooks, metadata and React practice surface.
- `src/platform/core/subject-registry.js`, `src/surfaces/subject/SubjectRoute.jsx`, `src/main.js` wire Reading into the existing subject shell.
- `worker/src/subjects/runtime.js`, `worker/src/repository.js`, `worker/src/projections/rewards.js` wire Reading into Worker commands, public read-model redaction and rewards.
- Hero Mode now treats Reading as a ready subject, with a provider and launch adapter.
- Reading-owned monsters were added while reusing existing reserve art via `assetId`, avoiding Grammar/Punctuation state collisions.

## Content promoted

- 13 original passages.
- 107 Reading questions.
- 8 original 50-mark, 60-minute SATs-style papers.
- KS2 domains 2a-2h plus punctuation-for-meaning support strand.
- Question types: multiple-choice, short answer, answer-plus-evidence, open rubric, multi-select, matching and ordering.

Content release id: `reading-poc-promoted-2026-05-05`.

## Production contract

See the in-patch document:

`docs/plans/james/reading/reading-production-contract.md`

Key contract points:

- The browser renders, but Reading scheduling/marking/progress mutation stay Worker-owned.
- The Reading engine is isolated in `worker/src/subjects/reading/`.
- Model answers, explanations and evidence are hidden in the read model until an answer is marked.
- Hero launches Reading through the existing subject task-envelope boundary; Reading remains the subject authority.
- Reading monster state uses Reading-owned ids: `readbloom`, `readrill`, `inferane`, `structurillon`.

## Verification run

Targeted Node tests run from the extracted ZIP worktree:

```bash
cd /mnt/data/ks2-reading-work
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js
```

Result: 9 tests passed, 0 failed.

The tests cover:

- content bank counts and KS2 domain coverage;
- unique passage/question ids;
- evidence snippets being present in source passages;
- test-paper references resolving to existing passages/questions;
- Reading module being ready rather than placeholder;
- Hero ready/provider/adapter wiring;
- passage-first Worker session start;
- answer metadata hidden before attempt;
- deterministic marking and safe feedback exposure;
- Worker runtime command wiring;
- Reading skill-secured events projecting into Reading-owned monster rewards.

Additional module import checks passed for:

- `shared/reading/content.js`
- `worker/src/subjects/reading/engine.js`
- `worker/src/subjects/reading/commands.js`
- `worker/src/subjects/reading/read-models.js`
- `worker/src/hero/providers/index.js`
- `worker/src/hero/launch-adapters/index.js`
- `src/platform/game/monsters.js`
- `src/platform/game/mastery/reading.js`
- `src/subjects/reading/module.js`
- `src/subjects/reading/client-read-models.js`
- `src/subjects/reading/command-actions.js`
- `src/subjects/reading/event-hooks.js`
- `worker/src/repository.js`

## Limitations

The full npm test/build commands could not be completed in this lean ZIP environment because `node_modules` is not present.

Observed failures:

```text
npm test ...
Missing node_modules (react, esbuild) — run "npm install" from this worktree root before "npm test".
```

```text
npm run build
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from scripts/build-client.mjs
```

So the patch is source/test validated in this environment, but final CI should run after installing dependencies in the real worktree:

```bash
npm install
npm test -- tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js
npm run build
```

## Patch files

- `reading-subject-production.patch` is the normal patch and applies cleanly with `git apply` against the uploaded ZIP snapshot.
- `reading-subject-production-readable.patch` is the smaller review patch generated with CR-at-EOL ignored; apply it with `git apply --ignore-space-change` if you prefer that version.
