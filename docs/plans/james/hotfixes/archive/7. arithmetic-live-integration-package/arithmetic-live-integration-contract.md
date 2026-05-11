# Arithmetic live integration contract

Source boundary:

- Primary implementation snapshot: uploaded ZIP `/mnt/data/lean-after.zip`.
- ZIP SHA-256: `87ac1268ace44ed4a37a786ad9268b9d7a56ad63048240471d6e2f99988b686c`.
- Arithmetic PoC reference: uploaded HTML `/mnt/data/ks2_arithmetic_fluency_trainer_v6.html`.
- PoC SHA-256: `1d2e7b237c0b78bcb41116947535353f89114f576155f976af9c405476c09226`.
- GitHub was used only as a current-main cross-check for subject registry/runtime boundaries. The patch is against the uploaded ZIP snapshot.

Implementation contract:

1. Arithmetic is no longer a placeholder subject.
2. Arithmetic has an isolated question engine. It does not reuse or mutate spelling, grammar, punctuation, or reading engines.
3. Shared shell pieces are reused: subject registry, React route, command action handling, Worker command runtime, read-model flow, shared reward projection, monster codex, Hero provider/launcher contracts, and admin content overview.
4. Marking is deterministic and Worker-owned. The browser receives redacted current-question data: no expected answer and no worked solution before marking.
5. The engine includes 30 procedural KS2 arithmetic templates and 90 reward units across four strands:
   - number facts/place value: 12 units
   - written operations/inverses: 39 units
   - decimals/fractions: 30 units
   - percentages/mixed arithmetic: 9 units
6. True Test Mode is separate from learning modes. It saves responses and delays marking until finish.
7. Long multiplication and long division are two-mark items, but the implementation keeps the honest limitation that final-answer auto-marking cannot replicate official handwritten method marks.
8. Monster integration is subject-owned through Arithmetic reward-unit evidence. Direct Arithmetic monsters find eggs after a first clean unit, hatch later, and reach Mega only at the 100-star evidence threshold. The grand Arithmetic monster is separate and uses the grand-monster evidence path.
9. Hero Mode treats Arithmetic as a ready subject through provider and launch-adapter wiring. Hero tasks launch Arithmetic envelopes; Hero does not mark Arithmetic answers or mutate Arithmetic mastery directly.
10. Reasoning remains the only locked placeholder subject in the ready/locked constants.

2026-05-11 rebase closure note: item 10 describes the uploaded ZIP snapshot boundary. The final repository integration rebased over latest `main`, where Reasoning had already shipped as a live subject. The production closure therefore preserves Reasoning as live, keeps `HERO_LOCKED_SUBJECT_IDS` empty, and ships Arithmetic as an additional ready subject rather than re-locking Reasoning.

Patch contents:

- `shared/arithmetic/content.js`: procedural content, answer parsing, marking, content summary, test blueprints.
- `worker/src/subjects/arithmetic/*`: Worker engine, command handlers, read model.
- `src/subjects/arithmetic/*`: client module, metadata, read-model adapter, command actions, React practice surface, event hooks.
- Registry/runtime/route changes: `src/platform/core/subject-registry.js`, `src/surfaces/subject/SubjectRoute.jsx`, `worker/src/subjects/runtime.js`, `src/main.js`.
- Reward/monster changes: `src/platform/game/mastery/arithmetic.js`, shared mastery exports, `monsters.js`, reward projection.
- Hero changes: `shared/hero/constants.js`, arithmetic provider/launch adapter, provider/adapter registries.
- Admin/content overview changes: Arithmetic and Reading live status handling; Reasoning placeholder handling is superseded by the latest-main Reasoning live rollout noted above.
- Tests updated/added for Arithmetic runtime, Hero provider/adapter, admin overview, subject adapter contract, and related fixture drift.

Validation performed locally on the extracted ZIP snapshot:

- Syntax checks passed for 34 modified/new non-JSX JavaScript test/source files.
- Arithmetic content smoke: 30 templates, 90 reward units.
- Targeted Node tests passed: `122/122`.
- Arithmetic runtime tests passed: `5/5`.
- React/admin SSR tests could not be executed in this ZIP environment because `esbuild` is not installed in the extracted bundle. Their source syntax was checked and fixtures/assertions were updated.
- Full Vite/React production build was not run because the extracted ZIP has no `node_modules`; this is an environment/package limitation, not a runtime failure in the patched code.

Important unverified limits:

- No live production deployment or Cloudflare/D1 smoke was performed.
- No browser visual QA was performed.
- No official SATs method-mark auto-awarding is claimed for handwritten long multiplication/division method marks.

Patch application note:

Apply from the repository root with:

```bash
patch -p1 < arithmetic-live-integration.patch
```

The patch paths are generated from `lean-after-baseline/` to `lean-after-work/`, so `-p1` strips the snapshot folder prefix.
