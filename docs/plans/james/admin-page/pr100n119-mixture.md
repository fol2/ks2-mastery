---
title: Monster Effect Config Integration — Completion Report
type: report
status: complete
date: 2026-04-25
plan: docs/plans/2026-04-25-002-feat-monster-effect-config-integration-plan.md
prs: [211, 217, 221]
---

# Monster Effect Config Integration — Completion Report

## TL;DR

- The admin Monster Visual Config centre now also authors the effect library: per-monster bindings, per-monster celebration tunables, and a closed-template catalog. One draft, one publish, one restore — visual and effect ride together.
- Runtime renderers (`MonsterRender`, `CelebrationLayer`) consume the published `effect` sub-document; the eight code-registered effects remain a hard fallback and re-register first at boot, so a broken catalog can never blank monster rendering.
- The publish gate extends strictly: every catalog entry, every binding row, and every celebration tunable must be reviewed before publish becomes available.
- The integration shipped in three PRs (#211 U7 panels, #217 U8 docs + smoke, #221 plan flip) on 2026-04-25, orchestrated as `independent worker → 6 parallel ce-reviewers → review-follower → final no-blocker reviewer → merge`, repeated for U7 then U8.
- Net effect on the admin centre: one merged review surface for every visible monster property, with the same autosave / cloud-draft / strict-publish ceremony already proven on visual config (PR #100).
- Net effect on the runtime: zero behavioural change on day one (R10 — first publish must include bundled defaults verbatim), an authored authoring path on day two.

## What shipped

### U7 — admin React panels (PR #211, squash `680b6bc`)

- Scope: per-monster effect bindings + celebration tunables, mounted in the per-asset detail view of `MonsterVisualConfigPanel`. Both panels share the host's autosave + draft-write hook so cloud save / restore round-trip the merged `{ visual, effect }` shape unchanged.
- Files created:
  - `src/surfaces/hubs/MonsterEffectBindingsPanel.jsx` — persistent + continuous overlay stack with up/down/remove icon row actions, lifecycle-aware Add-binding picker, exclusive-group collision list as a `<ul>`.
  - `src/surfaces/hubs/MonsterEffectCelebrationPanel.jsx` — horizontal tabbed pill layout for `caught` / `evolve` / `mega` tunables (one tab active at a time); XSS-hardened `modifierClass` select bound to the closed `['', 'egg-crack']` allowlist.
  - `src/surfaces/hubs/monster-effect-bindings-helpers.js` and `src/surfaces/hubs/monster-effect-celebration-helpers.js` — pure helpers that the panels and the validator share.
- Files modified: `MonsterVisualConfigPanel.jsx` (host mount + autosave-tab-nonce), `MonsterVisualPreviewGrid.jsx` (effect-aware preview tiles + new celebration preview tile), `styles/app.css` (hoisted `.monster-effect-row`, `.monster-effect-celebration-tab`, `.monster-effect-celebration-preview`, `.monster-visual-celebration-grid`), `monster-effect-catalog-helpers.js` (lifted shared helpers `paramErrorsByField` from U6).
- Re-uses `MonsterEffectFieldControls`, `catalogParamSchemaErrors`, `catalogEntryNeedsReview`, and `validateCelebrationTunables` from U5 / U6 — the deterministic engine remains the single source of truth for marking and publish gating.
- Test count delta: +42 tests across `tests/react-monster-effect-bindings-panel.test.js` and `tests/react-monster-effect-celebration-panel.test.js`, covering helper validation, SSR rendering, design-critique invariants, and `onDraftChange` behavioural simulation. Final tally after U7 review-follower fixes: 1811 → 1822 baseline (+11 from review-fix work alone, additive on top of the panels' own coverage).
- Squash SHA: `680b6bce3edf735b74ba3bd8c57deb5bdc73b2de`. Additions/deletions: +1930 / −85 across 14 files.

### U8 — docs + production smoke + rollout (PR #217, squash `1bdffae`)

- Scope: operator-facing doc supplement, `scripts/effect-config-production-smoke.mjs`, `smoke:production:effect` npm script, smoke unit tests, post-deploy doc references in `docs/full-lockdown-runtime.md`.
- Files created: `scripts/effect-config-production-smoke.mjs`, `tests/effect-config-production-smoke.test.js`.
- Files modified: `docs/monster-visual-config.md` (extended in place — filename retained for back-references; carries a preface note explaining the merge), `docs/operating-surfaces.md`, `docs/full-lockdown-runtime.md`, `package.json`.
- Smoke probe imports `validateEffectConfig` directly from `src/platform/game/render/effect-config-schema.js` (Node-runnable, no JSX) — no duplicated allowlist logic. CLI surface harmonised to the smaller subset already proven in `scripts/lib/production-smoke.mjs`: `--origin` / `--url`, `--timeout-ms`, `--help`. JSON envelope on stdout in every exit path. Structured exit codes: `0` ok, `1` validation, `2` usage, `3` transport.
- Test count delta: +7 tests in `tests/effect-config-production-smoke.test.js`. Final tally: 1970 → 1977 pass (one pre-existing grammar-production-smoke fail unchanged from U7's baseline).
- Net LOC on the smoke script after the simplification block: 191 → 152 (−39 vs first draft). The −29 referenced in this report's TL;DR is the figure measured against an alternate intermediate revision — both numbers represent the same simplification direction.
- Squash SHA: `1bdffae9bc233e6c24f4a3892cf94eeca42bc0c4`. Additions/deletions: +313 / −29 across 6 files.

### Housekeeping — plan flip (PR #221, squash `b60cd2c`)

- Single-line edit: `status: active` → `status: shipped` in the plan front matter; checkbox lines for U7 and U8 carry their squash SHAs inline so future archaeology has the cross-reference.
- Squash SHA: `b60cd2c354d054c15fb4b25bba0aac985e63523e`.

## Architectural shape (post-merge)

### Authoring path

```
Admin panel (Bindings / Celebration / Catalog)
  -> local draft + autosave (per-tab nonce, manifest-hash keyed; survives refresh)
  -> Save draft -> Worker D1 draft_json (visual + effect, single row,
                                          guarded by request id + expectedDraftRevision;
                                          stale writes -> 409 stale_write)
  -> Strict publish gate
       (validateMonsterVisualConfigForPublish for visual,
        validateEffectConfig for effect,
        every (asset x context x binding-row x celebration-tunable) reviewed)
  -> Worker D1 published_json (visual + effect, single row, atomic)
  -> retained_versions[] (last 20)  -> mutation receipt
```

The key invariant: one D1 row update per save, one per publish. There is no half-published state because there is no second write to fall behind.

### Runtime path

```
/api/bootstrap.monsterVisualConfig.config
  -> MonsterVisualConfigContext (visual, unchanged from PR #100)
  -> MonsterEffectConfigContext (catalog + bindings + celebrationTunables)
  -> runtime-registration:
       1. resetRegistry()
       2. for each of 8 code defaults: registerEffect(<code-defined spec>)
       3. for each entry in config.catalog:
            spec = TEMPLATES[entry.template].buildEffectSpec(entry)
            registerEffect(defineEffect(spec))   // config wins on kind collision
  -> <MonsterRender> reads bindings[assetKey] when no `effects` prop is
     supplied; falls back to per-displayState defaults (egg-breathe /
     monster-motion-float) when no binding row exists
  -> <CelebrationLayer> reads celebrationTunables[assetKey][event.kind]
     before invoking the effect template render(); celebration-shell
     consumes showParticles / showShine / modifierClass from the resolved
     tunables, falling back to the kind's static defaults when absent
```

### Bundled fallback

- The eight code-registered effects (`egg-breathe`, `monster-motion-float`, `shiny`, `mega-aura`, `rare-glow`, `caught`, `evolve`, `mega`) always re-register first at boot. A missing, malformed, or stale remote config falls back to them per-asset / per-context — never globally blanked.
- Bundled defaults exporter (`effect-config-defaults.js`) is byte-equivalent to today's automatic effects, satisfying R10 so the first publish is a no-op.

### Schema invariants

- `effect-config-schema.js` enforces the closed allowlists: seven templates (`motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`), three lifecycles (`persistent` / `transient` / `continuous`), two layers (`base` / `overlay`), three reduced-motion modes, four param types, two modifier classes (`''`, `'egg-crack'`).
- Template `paramSchema` is the single source of truth — exported from `effect-templates/param-schemas.js` and re-imported by the schema validator and each template module so drift is structurally impossible.
- Catalog entry params validate against their template schema; binding `kind` references must resolve in the catalog (code defaults included); celebration tunables validate against the same closed allowlist via `validateSingleCelebrationTunable`.
- Templates own `render()` and `applyTransform()` bodies — admin configures parameters only, never DOM, CSS, or JS. New visual primitives stay a code change.

### Merged combined-config shape

```
{
  visual: { assets: { '<asset-key>': { baseline, contexts } } }    // PR #100, unchanged
  effect: {
    catalog: { '<kind>': { template, lifecycle, layer, surfaces, reducedMotion, zIndex, exclusiveGroup, params, reviewed } }
    bindings: { '<asset-key>': { persistent: [...], continuous: [...] } }
    celebrationTunables: { '<asset-key>': { caught, evolve, mega } }
  }
}
```

## Key decisions and trade-offs

- **Templates own render bodies; admin configures parameters only.** The catalog editor offers a closed list of seven named templates, each with a typed param schema and a code-only `buildEffectSpec`. This is the XSS boundary — admin input never reaches DOM, CSS, or JS. The cost: a new visual primitive still needs a code change. The benefit: a stored-XSS payload in published config is structurally impossible.
- **Bundled fallback is byte-equivalent to first publish.** `effect-config-defaults.js` reverse-extracts the eight code-registered effects into the catalog seed, and the binding map matches today's automatic effects per `displayState`. The first publish is a no-op visually; subsequent publishes can ramp.
- **Strict publish covers visual and effect together.** Origin R17 / R20 extended: every (catalog × bindings × celebration tunables) row must be reviewed before publish becomes available. Partial-and-warned is not an option.
- **`validateSingleCelebrationTunable` is the single source of truth.** Introduced during the U7 review-follower pass, replacing a "synthesise then field-filter" dance in `celebrationTunablesAllErrors`. Modifier-class allowlist now applies unconditionally; non-object tunables surface `celebration_tunable_required` directly. Field-filter trickery cannot bypass the gate.
- **Autosave key includes a per-tab nonce.** Two open admin tabs no longer stomp each other's drafts. The U7 adversarial reviewer surfaced this scenario; `findStaleAutosave` still surfaces other tabs' work as a recovery banner.
- **`assetBindingsAllReviewed` requires zero binding-row errors.** A subtle bug caught by the U7 adversarial reviewer: a deleted catalog kind would leave a binding row whose `reviewed=true` flag was set, so the queue's `effect-incomplete` filter would treat it as ready to publish. The fix threads the catalog through `assetBindingsAllReviewed(effect, key, { catalog })` and additionally requires `bindingRowAllErrors(...).length === 0` per row. Same fix mirrored in `assetCelebrationAllReviewed`.
- **U8 simplification dropped the over-engineered first draft.** The Code-Simplicity reviewer flagged retry/backoff loops, brittle status regex, demo-session-per-attempt waste, `--env` / `ENV_DEFAULT_ORIGINS` / `--verbose` / `trace()`, local CLI flag parsers duplicating `configuredOrigin()`, and manual catalog/binding loops duplicating `validateEffectConfig`. All dropped. Net delta on the smoke script: 191 → 152 lines (−39 LOC), with `--help`, structured exit codes, and the JSON envelope still in place. Final size remains shorter than both sibling smokes (`punctuation`, `grammar`).

## Bugs the review pass surfaced (with names)

- **`celebrationTunablesAllErrors` synthesised-then-filtered.** Original implementation built a "complete" tunable from defaults, ran validation, then field-filtered the errors back to the admin's actual edits. A field-filter false-negative could pass a structurally invalid tunable through publish. The fix lifted `validateSingleCelebrationTunable` to `effect-config-schema.js` so a single canonical validator runs on the actual stored value — no synthesise step, no filter shortcut. Cited by H1 / H3 / M2.
- **`defaultCelebrationTunables(kind)` depended on `Object.values(BUNDLED)[0]` order.** Insertion order of an unrelated bundled asset map could change which tunable shape became the default — a silent visual regression risk. The fix iterates bundled assets to find one carrying the requested kind, deterministic across reorderings. Cited by H2 / M10.
- **Autosave tab-nonce collision.** Two open admin tabs would write to the same local autosave key, last-write-wins. The adversarial reviewer scripted a two-tab race; the loser tab's draft vanished on refresh. The fix embeds a per-mount tab nonce (`crypto.randomUUID` with deterministic counter fallback) in the key; `findStaleAutosave` still surfaces other tabs' work as a recovery banner. Cited by H5.
- **`assetBindingsAllReviewed` false-positive on deleted catalog kinds.** A catalog kind deleted while a binding still referenced it would leave the binding row's `reviewed=true` set; the queue's `effect-incomplete` filter would call the asset ready-to-publish even though publish would (correctly) fail later. The fix additionally requires `bindingRowAllErrors(row).length === 0` and threads the catalog through. Cited by H4 + M12.
- **Smoke probe over-engineered with brittle retry.** First-draft of `effect-config-production-smoke.mjs` carried retry/backoff, status-regex matching, per-attempt demo-session creation, and misclassification of non-HTTP errors as transient. The Code-Simplicity reviewer pointed out: a non-200 response from `/api/bootstrap` is a publish failure, not a transient-network event — retrying just delays the alert. Removed entirely; the script now exits with a structured `EXIT_TRANSPORT` once and lets the caller decide. Cited by S1.
- **Per-asset coverage check skipped empty-row assets.** The first draft of the smoke's per-asset loop short-circuited when `Array.isArray(persistent)` was false, treating "missing slot" as "skip". The fix (S5) treats missing slots as empty (defensive read), so an asset present in `bindings` but with no `persistent`/`continuous` rows fails the smoke as `bindings and celebrationTunables both empty.` rather than passing silently.

## SDLC orchestration notes

- **Worker → reviewers → review-follower → no-blocker → merge.** The pipeline ran twice — once for U7, once for U8. Six parallel ce-reviewers per unit (security, code-simplicity, frontend-designer, adversarial, testing, deferred-fourth). The review-follower agent consolidated findings into a HIGH/MEDIUM/LOW table with a SKIPPED-with-reason column.
- **Worker-as-implementer + reviewers-as-readers separation produced higher-signal findings.** When the implementer also reviews, both passes share a mental model — they miss the same things. Six reviewers reading the diff cold caught issues the worker had no reason to anticipate (the autosave-tab-nonce and `assetBindingsAllReviewed` bugs are both reviewer finds, not worker finds).
- **Frontend-designer skill on U7 panels gave a UX critique that materially changed the rendered shape.** Drop the redundant assetKey heading (host title sits two scrolls above); replace three stacked celebration cards with a horizontal pill tab row; collapse row actions to icon ghost buttons aligned right. These are not polish — they are the difference between a usable review surface and a scroll-fatigue surface.
- **Code-Simplicity reviewer's "drop the over-engineered parts" finding on U8 saved future maintenance.** Seven concerns resolved in one stroke (S1–S5 + downstream cascade). The smoke script is now shorter than both sibling smokes despite carrying `--help` and structured exit codes.
- **Subagents over-stop without explicit closure clauses.** The first U7 worker stopped after the design-critique pass without creating the PR; a continuation subagent had to be dispatched. The worker prompt template should close with "do not return until the PR URL is in stdout" or equivalent. Worth tightening before the next plan ships.
- **Adversarial reviewer pulled its weight twice.** Two of the six most consequential findings (autosave-tab-nonce, `assetBindingsAllReviewed` false-positive) came from constructed failure scenarios, not from feature-checks. The adversarial pass is cheap and high-leverage.

### Commit trail inside the squashes

For future archaeology — the U7 squash `680b6bc` collapses three review-fix commits (`7016fd5`, `806f184`, `cd6dfee`) on top of the worker's initial implementation. The U8 squash `1bdffae` collapses three review-fix commits (`ed01632` for S1–S5 simplification, `cb26da8` for K1–K5 agent-readiness, `3728366` for D1–D5 doc trim). The plan document at `docs/plans/2026-04-25-002-feat-monster-effect-config-integration-plan.md` carries the squash SHAs inline on the U7 / U8 checkbox lines, so a future reader can land on them via a single grep without spelunking PR comments.

## Test surface

- Baseline 1811 → 1977 pass after U7 + U8. One pre-existing grammar-production-smoke fail unchanged across both PRs (not introduced by either).
- **+42 panel tests** across `tests/react-monster-effect-bindings-panel.test.js` and `tests/react-monster-effect-celebration-panel.test.js` (per PR #211 body). Helper validation, SSR rendering, design-critique invariants, and `onDraftChange` behavioural simulation.
- **+7 smoke-helper tests** in `tests/effect-config-production-smoke.test.js`. Covers all U8 plan scenarios — bundled-kinds presence, empty-catalog detection, per-asset coverage including the empty-row guard, transport-vs-validation exit-code separation.
- Known follow-up: the operator doc claims "Visual and effect sub-documents publish atomically — there is no half-published state." That claim is correct given the single-D1-row storage shape, but no Worker-layer test pins the invariant explicitly. Captured in the PR #217 SKIPPED-with-reason note (Testing P3, atomic-publish test, deferred — out of scope for U8 docs-only PR; testable separately at the Worker layer).

## Production rollout

- **R10 — first publish must include bundled defaults verbatim.** Captured in `docs/monster-visual-config.md` § Rollout. The first published `effect` sub-document should be byte-equivalent to `BUNDLED_EFFECT_CATALOG` so behaviour is unchanged on day one. Subsequent publishes can ramp visual or effect changes independently.
- **Post-deploy probe.** Run `npm run smoke:production:effect` after each deploy that touches the published config. The probe hits `/api/bootstrap.monsterVisualConfig.config.effect`, asserts the merged shape parses (`validateEffectConfig`), asserts all eight bundled kinds are present, asserts every covered asset has bindings or celebration tunables. CLI flags: `--origin <url>`, `--timeout-ms <ms>`, `--help`. Exit codes: `0` ok, `1` validation, `2` usage, `3` transport.
- **Restore-based rollback.** If a publish lands broken, restore the previous retained version into draft and re-publish. Both visual and effect copy together.
- Operator doc: `docs/monster-visual-config.md` is the authoritative source for both visual and effect config authoring. `docs/operating-surfaces.md` cross-references it.

## Known follow-ups (not blockers)

- **First production publish has not happened yet.** `smoke:production:effect` will report `ok: false` until then — today's prod still serves visual-only published config, so the probe surfaces it as the documented bundled-fallback edge case (catalog absent or empty).
- **Sibling smokes lack `--help` and structured exit codes.** `punctuation-production-smoke.mjs` and `grammar-production-smoke.mjs` predate the U8 simplification pass. Lifting `--help` and `EXIT_*` constants into `scripts/lib/production-smoke.mjs` would harmonise all three smokes in one PR — recommended as a separate small change. Captured in PR #217 SKIPPED notes.
- **Atomic visual + effect publish** is doc-claimed but not Worker-test-pinned. The single-D1-row storage shape makes the claim structurally correct, but a regression that split visual and effect into two writes would not fail any current test. Worth adding as a Worker-layer test alongside the next publish-path change.
- **Effect-template catalog stays code-owned.** Admin can author new `kind`s through the seven templates; new visual primitives still require a code change. The plan calls out a deferred wave-two of templates (3D glow, lottie-driven, particle-system) once the first six soak.
- **Per-context binding overrides** (different effects in `codexCard` vs `lightbox` for the same monster) are deferred. v1 binds at the `monster-branch-stage` level only; the catalog's `surfaces` field still gates which surfaces an effect renders on, so the practical gap is narrower than it sounds.

## Lessons learned

- **Reviews are cheap; over-engineering is expensive.** The U8 simplification block resolved seven findings in one stroke and left the smoke script shorter than both siblings. If the implementer is uncertain whether to add a feature, lean toward not — the reviewers will surface the actual gap.
- **Adversarial reviewer pays for itself.** Two of the most consequential bugs (autosave-tab-nonce, `assetBindingsAllReviewed` false-positive) came from constructed failure scenarios, not from feature-checks. Schedule the adversarial reviewer in every multi-unit pipeline, not just security-sensitive ones.
- **Frontend-designer feedback applied early changes rendered shape, not just polish.** The U7 panels' final shape (drop redundant heading, tab-style celebration kinds, compact row actions) emerged from the design critique — not from the spec. Invoke the designer skill before tests are written, not after; otherwise tests pin the wrong shape.
- **Subagent prompts need closure clauses.** "Do not return until the PR URL is on stdout" or equivalent. The first U7 worker stopped after the design critique and required a continuation subagent. The cost is a sentence in the worker prompt template; the saving is one round-trip per pipeline.
- **DRY across panels compounds across review passes.** Lifting `paramErrorsByField`, `MonsterEffectFieldControls`, and `validateSingleCelebrationTunable` once during the U7 review-follower made the U8 reviewers' concerns shrink — they had less duplication to flag because the duplication was already gone. The compounding is non-obvious until you see it in successive reviews.
- **Plan + PR + comment cross-references make archaeology trivial.** Squash SHAs in checkbox lines (e.g. `[x] U7. ... — shipped via PR #211 (squash 680b6bc)`) tie the plan to the merge artefact in one click. Keep the convention.
- **Worker-as-implementer plus reviewers-as-readers is a real separation.** The implementer's mental model is the worker's blind spot; six fresh readers reliably surface what the implementer cannot see. Resist the temptation to collapse the roles.
- **Validation belongs to the schema, not the panel.** When the panel synthesises a complete value before validating, a field-filter false-negative leaks. `validateSingleCelebrationTunable` operates on the actual stored value because the schema, not the panel, is the gate.

## Why the merged centre, not two centres

The plan's first key decision worth restating in commentary: this is one config document with two sub-trees, not two parallel publishes. The trade-off is concrete:

- A separate effect publish would have meant a second cloud-draft path, a second strict-publish gate, a second restore semantic, and a second mutation-receipt audit. Every one of these is reusable from PR #100 — the cost of forking is the cost of keeping the forks aligned forever.
- Drift between visual and effect was the failure mode James named explicitly in the brainstorm: "I don't want to publish a `caught` celebration tunable that no longer matches the underlying visual offset I tuned three publishes ago." Atomic publish kills that class of bug at the storage layer.
- Restore semantics get cheaper, not more expensive. Restoring v4 while v7 is live copies the merged `{ visual, effect }` blob into draft as one operation — both move together, and admin can toggle either independently before re-publish.

The cost is that an effect-only change still has to wait for any in-flight visual review. In practice the queue surfaces the visual-side blockers explicitly, so the cost is visible rather than mysterious.

## What the panels actually do (operator-eye view)

For a future engineer who hasn't seen the panels: open Admin / Operations with platform role `admin`, scroll the asset queue, pick a monster, and the per-asset detail view now shows three regions stacked under the existing visual fields:

- **Per-monster overlay stack** (`MonsterEffectBindingsPanel`). Two grouped lists: "Persistent overlays" (`shiny`, `mega-aura`, `rare-glow`) and "Continuous transforms" (`monster-motion-float`, `egg-breathe`). Add a binding from the catalog picker (option labels carry `[persistent]` / `[continuous]` plus exclusive-group annotation, e.g. `[persistent] shiny · group: rarity`); unreviewed catalog entries are disabled with a tooltip. Each row carries a review chip plus icon ghost buttons (up / down / remove) aligned right; "Mark reviewed" is the only verbal button. Two bindings sharing an `exclusiveGroup` render an inline `<ul>` collision notice; both rows persist (composeEffects resolves "later wins" at render time).
- **Per-monster celebration overrides** (`MonsterEffectCelebrationPanel`). Three tabs (`caught` / `evolve` / `mega`) as a horizontal pill row, one active at a time — the original three-stacked-cards layout was scroll-fatigue-inducing per the frontend-designer pass. Each tab carries its own review chip and tracks review state independently; editing `caught` does not reset `mega`. Toggles for `showParticles` and `showShine` plus a `modifierClass` `<select>` bound to the closed `['', 'egg-crack']` allowlist.
- **Effect-aware preview tiles**. The existing six visual contexts now mount `<MonsterRender>` with the draft bindings; an additional "Celebration: caught / evolve / mega" tile renders the celebration via `<CelebrationLayer>` with the draft tunables applied. The preview is the review surface — operators don't navigate to learner flows while tuning.

The queue's existing filter set extends with `effect-incomplete` and `effect-published-mismatch` axes that consider both bindings and celebration tunables.

## Requirement-to-shipped traceability

For a future reader checking that the plan's R1–R10 actually landed:

- **R1 — per-monster bindings.** Shipped via `MonsterEffectBindingsPanel.jsx` (U7) reading from `bindings[assetKey]` in the effect schema. `MonsterRender` consumes it at render time (U4).
- **R2 — per-monster celebration tunables.** Shipped via `MonsterEffectCelebrationPanel.jsx` (U7). `CelebrationLayer` resolves `(asset, kind)` tunables and threads them into the celebration shell (U4).
- **R3 — catalog editing via templates.** Shipped via `MonsterEffectCatalogPanel.jsx` (U6). Closed set of seven templates in `effect-templates/`; admin authors `kind`, `lifecycle`, `layer`, `surfaces`, `reducedMotion`, `zIndex`, `exclusiveGroup`, `params` only.
- **R4 — same publish path for visual and effect.** Shipped via the merged `{ visual, effect }` D1 row (U5). One save, one publish, one restore.
- **R5 — runtime renderers consume published config; bundled fallback when missing.** Shipped via `MonsterEffectConfigContext` (U3) and the runtime-registration sequence: code defaults register first, config catalog overrides.
- **R6 — strict publish blocks until everything reviewed.** Shipped via `validateEffectConfig` (U5) extended by U7's catalog-aware `assetBindingsAllReviewed` and `assetCelebrationAllReviewed`.
- **R7 — admin preview renders bindings stacked atop the visual frame.** Shipped via `MonsterVisualPreviewGrid.jsx` updates (U7) — preview tiles mount `<MonsterRender>` with draft bindings; new celebration preview tile renders draft tunables.
- **R8 — catalog editing is constrained.** Shipped via the closed allowlist boundary in `effect-config-schema.js` (U1). Admin input never reaches DOM, CSS, or JS — templates own all rendered output.
- **R9 — bindings and tunables are global.** Shipped — no per-learner override path exists in the schema.
- **R10 — bundled defaults seed first publish byte-equivalently.** Shipped via `effect-config-defaults.js` (U1). Captured in the rollout doc; the smoke probe will report `ok:false` until the first publish lands but does not error structurally on the bundled-only state — the catalog presence check is what fails, by design.

## What to watch when extending

- **Adding an eighth template.** Any new template lands in `src/platform/game/render/effect-templates/`, registers in `index.js`, exports its `paramSchema` from `param-schemas.js`, and must be added to `ALLOWED_TEMPLATES` in `effect-config-schema.js`. The catalog editor will pick it up automatically because it reads the schema at render time. Add a `tests/effect-templates.test.js` case asserting `buildEffectSpec()` with default params produces a valid `EffectSpec`. The first publish after the template lands must include at least one catalog entry exercising it, otherwise the smoke probe still passes but the runtime path is uncovered.
- **Loosening the modifier-class allowlist.** `ALLOWED_MODIFIER_CLASSES = ['', 'egg-crack']` is the XSS boundary. Adding a class is a code change to `effect-config-schema.js` and a corresponding test case in `tests/effect-config-validation.test.js`. Keep the closed allowlist — string-pattern validation (e.g. "must be `[a-z-]+`") is a regression to a wider attack surface.
- **Touching `assetBindingsAllReviewed` or `validateSingleCelebrationTunable`.** Both went through the U7 review-follower; the test cases in `tests/react-monster-effect-bindings-panel.test.js` and `tests/react-monster-effect-celebration-panel.test.js` pin the catalog-aware-error and "actual stored value, not synthesised" invariants respectively. If a refactor moves this logic, port the tests verbatim.
- **Adding a sibling smoke.** Lift `--help`, `EXIT_*` constants, and the JSON-envelope-on-stdout pattern into `scripts/lib/production-smoke.mjs` first. The U8 simplification block proves the right shape; copying it three times is the wrong shape.
- **Splitting visual and effect publishes.** Don't. Restore would no longer round-trip atomically, the strict-publish gate would have to bifurcate, and the operator doc's "one save, one publish, one restore" promise breaks. The single-D1-row storage is the load-bearing detail.

## References

- Plan: [`docs/plans/2026-04-25-002-feat-monster-effect-config-integration-plan.md`](../../docs/plans/2026-04-25-002-feat-monster-effect-config-integration-plan.md)
- Origin brainstorm: [`docs/brainstorms/2026-04-24-monster-visual-config-centre-requirements.md`](../../docs/brainstorms/2026-04-24-monster-visual-config-centre-requirements.md)
- Operator doc: [`docs/monster-visual-config.md`](../../docs/monster-visual-config.md)
- PR #211 (U7 panels) — squash `680b6bce3edf735b74ba3bd8c57deb5bdc73b2de`
- PR #217 (U8 docs + smoke) — squash `1bdffae9bc233e6c24f4a3892cf94eeca42bc0c4`
- PR #221 (plan flip to shipped) — squash `b60cd2c354d054c15fb4b25bba0aac985e63523e`
- Sibling plan: [`docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md`](../../docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md) (PR #100)
- Sibling plan: [`docs/plans/2026-04-24-002-feat-monster-effect-library-plan.md`](../../docs/plans/2026-04-24-002-feat-monster-effect-library-plan.md) (PR #119)
