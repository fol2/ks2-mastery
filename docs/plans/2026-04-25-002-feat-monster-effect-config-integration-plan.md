---
title: feat: Monster effect config integration
type: feat
status: active
date: 2026-04-25
origin: docs/brainstorms/2026-04-24-monster-visual-config-centre-requirements.md
---

# feat: Monster effect config integration

## Overview

Extend the existing Admin / Operations Monster Visual Config centre (PR #100) to also author the effect library introduced in PR #119. Admin gains three new authoring surfaces, all persisted through the same cloud-draft + strict-publish path that already governs visual settings:

1. **Per-monster effect bindings** — for each `monster × branch × stage` asset, declare which persistent / continuous effects apply and with what parameters (`shiny@intensity=0.6 palette=accent`, `idle-bob@amplitude=gentle`, etc.).
2. **Per-monster celebration tunables** — for each (monster, kind) pair where `kind ∈ {caught, evolve, mega}`, override visual flags (`showParticles`, `showShine`, modifier class such as `egg-crack`) and timing fields the catalog template surfaces.
3. **Effect catalog editing via templates** — admin can register new effect kinds through a closed, fixed set of visual templates (`motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`). Each template exposes a typed param schema and a code-owned `render()` / `applyTransform()` body. The admin only configures parameters; arbitrary code remains a code-only operation.

Runtime renderers (`<MonsterRender>`, `<CelebrationLayer>`) read the published effect config alongside the published visual config. Bundled fallback covers every code-registered effect so a missing or stale remote effect config never blanks the screen.

| Mode | Data source | Who can change | Production effect |
|---|---|---|---|
| Bundled fallback | The 8 effects already registered in code (egg-breathe, monster-motion-float, shiny, mega-aura, rare-glow, caught, evolve, mega) | Code change | Always available |
| Local admin buffer | Browser local storage (extends the autosave key from PR #100) | Admin in current browser | Preview only |
| Shared cloud draft | D1 global config draft (effect sub-document) | Admin only | Preview in Admin |
| Published config | D1 retained published version (visual + effect together) | Admin publish only | Drives runtime |

---

## Problem Frame

PR #100 made the **visual** side of monster rendering admin-authorable: facing, scale, offset, anchor, shadow, crop, filter, and timing CSS variables per renderer context. PR #119 introduced an **effect** library that decoupled animation/celebration rendering from mastery and from per-subject hooks. The two ship today as separate concerns.

What the user wants combined: a single Admin / Operations queue where, when reviewing `inklet-b1-3`, James can not only tune offset/scale/shadow but also: (a) declare that this monster wears a `shiny` overlay at intensity 0.6 in codex, (b) tune the `caught` celebration to skip `showParticles` because the asset already has confetti baked in, and (c) define a brand-new effect `crystal-glint` from the `sparkle` template with custom palette mapping and roll it out alongside the next visual publish.

Today every effect param, exclusive group, surface scope, and celebration toggle is hardcoded in the eight modules under `src/platform/game/render/effects/`. Adding a new effect or per-monster variation requires a code change + redeploy. The Admin centre's review flow stops at visual settings, so monster look reviews still need a code follow-up to land effect adjustments.

The integration must respect three load-bearing properties of PR #100:

- Strict publish: a partial or unreviewed draft never reaches production (origin R17, R20).
- Bundled fallback: production stays operable when remote config is missing or stale (origin R23, see origin: `docs/brainstorms/2026-04-24-monster-visual-config-centre-requirements.md`).
- Publish history with restore (origin R19).

---

## Requirements Trace

- R1. Admin can author per-monster effect bindings — which `persistent` and `continuous` effects apply to a given `monster-branch-stage` asset, with caller-supplied params (e.g. `intensity`, `palette`, `amplitude`).
- R2. Admin can tune per-monster celebration parameters — for each `kind` in `{caught, evolve, mega}`, override `showParticles`, `showShine`, `modifierClass`, plus any other tunable the catalog template surfaces. Defaults match today's hardcoded values so unmigrated monsters look unchanged.
- R3. Admin can register new effect kinds via templates — a fixed catalog of 6–7 visual templates (`motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`) with code-owned render bodies and admin-supplied param values, `kind`, `lifecycle`, `layer`, `surfaces`, `reducedMotion`, `zIndex`, `exclusiveGroup`.
- R4. The same cloud draft + strict publish path that governs visual config (origin R14–R19) governs effect config — no parallel persistence path, one publish action covers both.
- R5. Runtime renderers (`MonsterRender`, `CelebrationLayer`) consume the published effect config; bundled defaults remain the hard fallback when remote config is unavailable, incomplete, or stale (mirrors origin R23).
- R6. Strict publish blocks until every effect catalog entry, every per-monster binding, and every per-monster celebration tunable has a complete and valid value, and every (asset × context × effect-binding-row) is marked reviewed (extends origin R17, R20).
- R7. Admin preview renders the monster with its effect bindings stacked atop the visual frame in every relevant context, so review is single-page (extends origin R8, R10).
- R8. Catalog editing is constrained: templates own the rendered DOM and CSS classes; admin cannot inject arbitrary HTML, CSS, or JS through the centre. New visual primitives require a code change to add a template, exactly as today.
- R9. Effect bindings and tunables are **global** (per `monster-branch-stage`), not per-learner, mirroring origin R18.
- R10. Bundled defaults are seeded from the eight code-registered effects so the first published effect config is byte-equivalent to current production behaviour.

**Origin actors carried forward:**
- A1 James / Admin — extends the same role to effect bindings, tunables, and catalog entries.
- A2 Operations user — read-only on effect config too.
- A3 Learner — sees the published effect config rendered alongside visual config.
- A4 Admin preview renderer — extends to render effect overlays.
- A5 Worker config boundary — stores effect sub-document alongside visual sub-document.
- A6 Monster renderers — `MonsterRender` and `CelebrationLayer` are now config-aware.

---

## Scope Boundaries

- **No arbitrary render bodies in admin config.** Templates own all rendered DOM, CSS classes, and JS. New primitives are still a code change. Rationale: prevents stored XSS through the publish path and keeps the schema typed.
- **No per-learner effect overrides.** Effect config is global, like visual config (origin R18).
- **No trigger logic in the centre.** Effects do not fire automatically based on admin config — they apply when the runtime renders the monster in a matching surface. Trigger logic (RNG shiny encounters, milestone-based rarity unlock) remains a separate concern (PR #119 brainstorm Scope Boundaries).
- **No changes to the `defineEffect()` factory shape.** The contract from PR #119 stays as-is; config-defined effects pass through the same factory at runtime registration time.
- **No worker-authoritative effect resolution.** Like visual config, the worker stores and serves the published config; the browser resolves bindings at render time.
- **No removal of the eight existing code-registered effects.** They remain the bundled fallback. Admin config can override their params per-monster but cannot delete or unregister them globally.

### Deferred to Follow-Up Work

- A second wave of templates (3D glow, lottie-driven, particle-system) once the first six soak.
- Trigger logic / progression-driven binding (e.g. monster becomes `shiny` only after 100 mastered words). Stays in subject layer.
- Per-context binding overrides (different effects in `codexCard` vs `lightbox` for the same monster). v1 binds at the `monster-branch-stage` level only; per-context refinement is a future schema extension.

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/game/monster-visual-config.js` — visual config schema, `resolveMonsterVisual()`, `validateMonsterVisualConfigForPublish()`, bundled defaults. The effect config schema mirrors this file's shape so admin tooling can be reused.
- `src/platform/game/MonsterVisualConfigContext.jsx` — React context provider; will likely host the merged visual + effect config or get a sibling `MonsterEffectConfigContext`.
- `src/platform/game/monster-asset-manifest.js` — build-time asset manifest. Effect bindings key off the same `monster-branch-stage` asset identifiers.
- `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` (464 lines) — admin queue + autosave + draft buffer. The effect surfaces extend this panel.
- `src/surfaces/hubs/MonsterVisualFieldControls.jsx` — numeric + drag fields used per visual context. Patterns to mirror for effect param fields.
- `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` — preview renderer for the 6 visual contexts. Effect overlays mount on top of these previews via the existing `<MonsterRender>` integration in `CodexCreature.jsx`.
- `src/platform/game/render/define-effect.js` — `defineEffect()` factory with spec validation. Config-defined effects re-enter this factory at registration.
- `src/platform/game/render/registry.js` — `registerEffect`, `lookupEffect`, `resetRegistry`. The runtime hybrid pass calls `resetRegistry()` then re-registers code defaults + config additions.
- `src/platform/game/render/composition.js` — `composeEffects()` pipeline (lookup → surface filter → params → exclusive group → reduced motion → split). Admin bindings flow into this through `effects` props on `<MonsterRender>` (per-monster) and through `playCelebration`'s `params` / per-monster tunables for transient kinds.
- `src/platform/game/render/effects/{egg-breathe,monster-motion-float,shiny,mega-aura,rare-glow,caught,evolve,mega}.js` — the 8 bundled effects to migrate to template form for U2.
- `src/platform/game/render/effects/celebration-shell.js` — celebration shell + tunables (`showParticles`, `showShine`, `modifierClass`) currently hardcoded per kind. Per-monster celebration tunables override these.
- `worker/src/projections/monster-replays.js` and the wider `worker/src/` — config persistence layer (D1 retained published versions per PR #100). Effect config sub-document slots into the same row.

### Institutional Learnings

- `docs/solutions/` — none directly on effect config or admin authoring at the time of writing. PR #100's plan and brainstorm are the closest priors and are referenced as origin.

### External References

- External research skipped: this is internal admin tooling building on a well-grounded local pattern (PR #100). No security / payments / migration risk that warrants framework-doc lookups.

---

## Key Technical Decisions

- **Templates over freeform DSL.** The catalog editor offers a closed list of named templates (`motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`). Each template owns its render body in code; admin only configures `kind`, `lifecycle`, `layer`, `surfaces`, `reducedMotion`, `zIndex`, `exclusiveGroup`, and the template's typed param values. Rationale: blocks DOM/JS injection through publish, keeps validation tractable, and matches the "fixed schema" feel of PR #100's visual fields.
- **Single combined config document, two sub-trees.** Cloud config grows from `{ visual: {...} }` to `{ visual: {...}, effect: { catalog: {...}, bindings: {...}, celebrationTunables: {...} } }`. Publish covers both atomically. Restore restores both. Rationale: avoids drift between visual and effect publishes, reuses existing publish ceremony.
- **Bundled defaults via reverse-extraction.** The eight existing code-registered effects are migrated to template-described form; the `bundled-defaults.js` exporter produces an `effect.catalog` block byte-equivalent to today's behaviour. The default `bindings` map gives every `monster-branch-stage` the same automatic effects today's `CodexCreature.jsx` and `<CelebrationLayer>` produce. Rationale: first publish is a no-op visually.
- **Hybrid runtime registry.** On config load (or when no config is available), the runtime first re-registers the eight code-defined effects, then iterates the published catalog calling `defineEffect()` + `registerEffect()` for each entry — code wins where `kind` collides, OR config wins. Plan resolves: **config wins**, because admin-published changes are intentional. The eight code-defined effects are the fallback when no remote config is loaded; once config loads, admin's catalog (which seeds from the same defaults) takes over.
- **Per-monster bindings live with the asset baseline.** Each `monster-branch-stage` asset gains an `effects` field: `{ persistent: [...], continuous: [...] }`. Caller surfaces (codex, lesson, home) read the binding when rendering through `<MonsterRender>`. Rationale: keeps "what does this monster look like" colocated with "how does this monster move".
- **Per-monster celebration tunables live alongside per-monster bindings.** A separate `celebrationTunables` field on the asset baseline: `{ caught: { showParticles, showShine, modifierClass, ...templateParams }, evolve: {...}, mega: {...} }`. The `<CelebrationLayer>` resolves them at render time.
- **Strict publish extends origin R17.** Publish validation now also requires: every catalog entry has a valid template + complete params; every (monster × branch × stage) has a binding row marked reviewed; every (monster × kind) celebration row is marked reviewed. Same all-or-nothing gate.
- **No worker authoritative effect resolution.** The worker stores and serves the published config blob; the browser resolves bindings at render time, exactly as PR #100 does for visual config.

---

## Open Questions

### Resolved During Planning

- **Catalog DSL or templates?** Templates. Resolved: blocks injection, keeps validation tractable, supports R3 without ceding render body to admin input.
- **Where do bindings live in the schema?** With the asset baseline, not in a separate top-level table. Resolved: queryable alongside visual fields, reuses the asset manifest as the join key.
- **Code wins vs. config wins on `kind` collision?** Config wins. Resolved: admin-published intent is authoritative; code-defined effects are the fallback for unconfigured installations.
- **Single combined publish or separate visual + effect publishes?** Combined. Resolved: avoids drift, halves the ceremony, matches the "one production config" promise from PR #100.
- **Per-context bindings (different effects in `codexCard` vs `lightbox`)?** No, deferred. Bindings apply to a `monster-branch-stage` regardless of context; the catalog's `surfaces` field still gates which surfaces the effect renders on. Per-context refinement is a follow-up.
- **Trigger logic in the centre?** No, out of scope. Bindings declare *which effects apply if their context applies* — actual trigger logic (e.g. shiny only after 100 mastered words) lives in subject hooks.

### Deferred to Implementation

- **Exact template parameter schemas.** Each template's typed param surface (e.g. `glow` exposes `intensity`, `colour`, `radius`?) is a design call best made with the template's CSS in front of the implementer. The schema shape (`{ name: { type, default, min, max, values } }`) is fixed.
- **Whether `bindings.persistent` is an ordered list or a `Set` keyed by `kind`.** Both are valid; ordered list lets admin control z-index between two bindings of the same `exclusiveGroup` while a `Set` deduplicates. Decide during U5 with the admin field control in front of you.
- **D1 column shape vs. JSON blob for the effect sub-document.** PR #100 stores the visual config as a JSON blob; the effect sub-document likely fits the same row. Confirm during U6 implementation.
- **Whether the admin queue gets a third filter axis (`effect-incomplete`).** Likely yes — extend the existing queue filter set. Decide once the queue UI for bindings is in front of you.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Combined config document shape

```text
{
  manifestHash, draftRevision, publishedAt, ...                 # existing PR #100 envelope
  visual: { assets: { 'inklet-b1-3': { baseline, contexts } } } # PR #100, unchanged
  effect: {
    catalog: {
      'shiny': { template: 'sparkle', kind: 'shiny', lifecycle, layer, surfaces, reducedMotion, zIndex, exclusiveGroup, params: {...} }
      'crystal-glint': { template: 'sparkle', ... admin-defined ... }
      ...
    }
    bindings: {
      'inklet-b1-3': {
        persistent: [{ kind: 'shiny', params: { intensity: 0.6, palette: 'accent' } }, ...]
        continuous: [{ kind: 'monster-motion-float', params: {} }]
      }
      ...
    }
    celebrationTunables: {
      'inklet-b1-3': {
        caught:  { showParticles: true,  showShine: false, modifierClass: '' }
        evolve:  { showParticles: false, showShine: false, modifierClass: 'egg-crack' }
        mega:    { showParticles: true,  showShine: true,  modifierClass: '' }
      }
      ...
    }
  }
}
```

### Catalog template registry

```text
TEMPLATE = {
  id: 'glow' | 'sparkle' | 'aura' | 'particles-burst' | 'shine-streak' | 'pulse-halo' | 'motion'
  paramSchema: { <name>: { type, default, min, max, values, required } }
  // implementer-owned, code-only:
  buildEffectSpec({ kind, lifecycle, layer, surfaces, reducedMotion, zIndex, exclusiveGroup, params })
    -> EffectSpec   # the same shape defineEffect() accepts
}
```

Catalog publish reads a catalog entry, looks up its `template`, calls `template.buildEffectSpec()` to assemble an `EffectSpec`, then runs the existing `defineEffect()` validation. Admin never sees the spec — the entry shape is `{ template, kind, lifecycle, layer, surfaces, reducedMotion, zIndex, exclusiveGroup, params }` only.

### Runtime registration sequence

```text
on app boot OR config change:
  1. resetRegistry()
  2. for each of the 8 code-defined effects: registerEffect(<code-defined spec>)
  3. if published config exists:
       for each entry in config.effect.catalog:
         spec = TEMPLATES[entry.template].buildEffectSpec(entry)
         registerEffect(defineEffect(spec))   # config wins on kind collision
  4. surface providers expose config.effect.bindings + config.effect.celebrationTunables
     to <MonsterRender> and <CelebrationLayer> via context
```

### Render-time resolution

```text
<MonsterRender monster={entry} context={ctx}>
  bindings = useMonsterEffectConfig().bindings[entry.assetKey] ?? FALLBACK
  effects = [...bindings.continuous, ...bindings.persistent]
  // existing pipeline from PR #119:
  composeEffects({ effects, monster: entry, context: ctx, ... })

<CelebrationLayer>
  on next queued event: resolve tunables = config.effect.celebrationTunables[event.assetKey][event.kind]
  pass tunables to the kind's effect render() — celebration-shell consumes them
```

---

## Implementation Units

- [x] U1. **Effect config schema + bundled-defaults source**

**Goal:** Define the `effect.catalog`, `effect.bindings`, and `effect.celebrationTunables` schemas as siblings to the existing visual schema, plus a bundled-defaults exporter that reads the eight code-registered effects and produces the seed catalog + a default bindings map matching today's automatic effects.

**Requirements:** R3, R4, R10

**Dependencies:** None

**Files:**
- Create: `src/platform/game/render/effect-config-schema.js` (TypeScript-style JSDoc for shapes; runtime validators)
- Create: `src/platform/game/render/effect-config-defaults.js` (bundled defaults from the 8 code-registered effects)
- Modify: `src/platform/game/monster-visual-config.js` (extend the published-config envelope to include `effect: {...}`; existing `visual: {...}` untouched)
- Test: `tests/effect-config-schema.test.js`
- Test: `tests/effect-config-defaults.test.js`

**Approach:**
- Schema: three sub-documents (`catalog`, `bindings`, `celebrationTunables`) each keyed by a stable identifier — `kind` for catalog, `monster-branch-stage` for the others.
- `effect-config-defaults.js` imports the eight existing effect modules and reverse-extracts a config-shaped representation. For migration cleanliness it does not import their `render`/`applyTransform` bodies; templates own those.
- The bundled bindings map gives every `monster-branch-stage` the same automatic effects today's `CodexCreature.jsx` produces (`monster-motion-float` for caught monsters, `egg-breathe` for eggs).
- Bundled celebration tunables match today's hardcoded `showParticles`/`showShine` per kind.

**Execution note:** Test-first for the schema and defaults exporter. Lock the bundled-defaults output with a fixture so future template/catalog refactors prove byte-equivalence.

**Patterns to follow:**
- `src/platform/game/monster-visual-config.js` for the schema + validator + context-resolution function shape.
- `tests/render-effect-contract.test.js` for `node:test` + `node:assert/strict` coverage.

**Test scenarios:**
- Happy path: bundled defaults exporter returns a config whose `catalog` has eight entries with `kind` matching the eight code-registered effects (egg-breathe, monster-motion-float, shiny, mega-aura, rare-glow, caught, evolve, mega).
- Happy path: bundled `bindings` for any caught monster includes `monster-motion-float` in `continuous`; for an egg includes `egg-breathe`.
- Happy path: bundled `celebrationTunables` for `caught` shows `showParticles=true, showShine=false`; for `mega` shows both true.
- Edge case: schema validator accepts a minimal valid catalog entry (kind, template, lifecycle, layer, surfaces, reducedMotion).
- Edge case: schema validator rejects a catalog entry with unknown `template`, missing `kind`, or invalid `layer`.
- Edge case: schema validator rejects a binding referencing an unregistered `kind`.
- Edge case: schema validator rejects a celebration tunable with a `modifierClass` containing whitespace or special characters (XSS hardening).

**Verification:**
- `node --test tests/effect-config-schema.test.js tests/effect-config-defaults.test.js` exits 0.
- The bundled-defaults fixture in `tests/effect-config-defaults.test.js` byte-matches a frozen reference output.

---

- [x] U2. **Effect template registry**

**Goal:** Implement the closed set of visual templates (`motion`, `glow`, `sparkle`, `aura`, `particles-burst`, `shine-streak`, `pulse-halo`) with code-owned `buildEffectSpec()` functions and typed param schemas. Each template covers one of the visual treatments today's eight code-registered effects use.

**Requirements:** R3, R8

**Dependencies:** U1

**Files:**
- Create: `src/platform/game/render/effect-templates/index.js` (registry + lookup)
- Create: `src/platform/game/render/effect-templates/motion.js` (covers egg-breathe + monster-motion-float)
- Create: `src/platform/game/render/effect-templates/glow.js`
- Create: `src/platform/game/render/effect-templates/sparkle.js` (covers shiny)
- Create: `src/platform/game/render/effect-templates/aura.js` (covers mega-aura)
- Create: `src/platform/game/render/effect-templates/particles-burst.js` (transient celebration variant)
- Create: `src/platform/game/render/effect-templates/shine-streak.js` (mega celebration shine)
- Create: `src/platform/game/render/effect-templates/pulse-halo.js` (covers rare-glow)
- Modify: `src/platform/game/render/effects/effects.css` (template-owned class declarations)
- Test: `tests/effect-templates.test.js`

**Approach:**
- Each template module exports `{ id, paramSchema, buildEffectSpec({ kind, lifecycle, layer, surfaces, reducedMotion, zIndex, exclusiveGroup, params }) }`.
- `buildEffectSpec()` returns the same object shape `defineEffect()` already accepts.
- Templates' render bodies use existing CSS class names so today's stylesheet keeps applying. Where the existing eight effects were unique CSS-only (e.g. `fx-shiny`), the template's render emits the same DOM.
- The catalog editor (U6) reads `paramSchema` to drive admin field controls.

**Patterns to follow:**
- `src/platform/game/render/effects/shiny.js`, `mega-aura.js`, `rare-glow.js` for overlay render bodies (move into the matching templates).
- `src/platform/game/render/effects/egg-breathe.js`, `monster-motion-float.js` for the `motion` template's `applyTransform` body.

**Test scenarios:**
- Happy path: each template's `buildEffectSpec()` with default params produces a valid `EffectSpec` (passes `defineEffect()` without throwing).
- Happy path: `motion` template + the existing `egg-breathe` params produces a spec whose `applyTransform()` output is byte-identical to today's `computeEggBreatheStyle()` for known fixtures.
- Happy path: `sparkle` template + the existing `shiny` params produces an `EffectSpec` whose `render()` returns DOM matching the current `fx-shiny` shape.
- Edge case: `paramSchema` validation rejects out-of-range values (e.g. intensity: 2 clamps or fails per type schema).
- Edge case: unknown template id returns `null`/throws from the registry lookup.
- Integration: registering a template-built effect via `registerEffect()` then `composeEffects()` returns it in the expected layer.

**Verification:**
- `node --test tests/effect-templates.test.js` exits 0.
- `tests/render-effect-egg-breathe.test.js`, `tests/render-effect-monster-motion-float.test.js`, `tests/render-effect-shiny.test.js`, `tests/render-effect-mega-aura.test.js`, `tests/render-effect-rare-glow.test.js`, `tests/render-effect-caught.test.js`, `tests/render-effect-evolve.test.js`, `tests/render-effect-mega.test.js` all continue to pass after the eight effect modules delegate to templates (or are deleted in favour of the catalog seeding).

---

- [x] U3. **Hybrid runtime registry**

**Goal:** At app boot (and on config change), reset the registry, register the eight code-defined effects as bundled fallback, then iterate the published `effect.catalog` and re-register through `defineEffect()`. Config wins on `kind` collision. Without a published config, code-defined effects remain.

**Requirements:** R5, R10, key technical decision "config wins"

**Dependencies:** U1, U2

**Files:**
- Create: `src/platform/game/render/runtime-registration.js` (bootstrap function)
- Modify: `src/platform/game/MonsterVisualConfigContext.jsx` or sibling provider (carry effect config alongside visual config)
- Modify: `src/app/App.jsx` (call `runtimeRegistration` once on boot, before `<MonsterRender>` mounts)
- Test: `tests/runtime-effect-registration.test.js`

**Approach:**
- `runtimeRegistration({ catalog, templates })` calls `resetRegistry()`, then `registerEffect()` for each code default, then for each catalog entry.
- `MonsterEffectConfigContext` exposes the resolved `bindings` and `celebrationTunables` to consumers.
- Config-change reactivity is acceptable as a full re-registration (rare, admin-only event).

**Execution note:** Characterisation. Lock the post-boot registry contents with a snapshot test before changing the boot path so behaviour with no remote config is byte-equivalent.

**Patterns to follow:**
- `src/platform/game/MonsterVisualConfigContext.jsx` for context shape.
- `src/platform/game/render/registry.js` for `registerEffect` semantics.

**Test scenarios:**
- Happy path: with no remote config, post-boot registry contains the eight code-defined kinds and lookup returns the code-defined spec.
- Happy path: with a remote catalog overriding `shiny` to a different palette default, post-boot lookup returns the config-defined spec, not the code one.
- Happy path: with a remote catalog adding a new `crystal-glint` kind, post-boot lookup finds it.
- Edge case: malformed catalog entry (template unknown) — entry skipped, dev-warn, code default for the same `kind` (if any) wins.
- Edge case: re-registration is idempotent — calling `runtimeRegistration` twice produces the same registry state.
- Integration: a bound `crystal-glint` listed in `bindings['inklet-b1-3'].persistent` and rendered via `<MonsterRender>` produces the expected overlay.

**Verification:**
- `node --test tests/runtime-effect-registration.test.js` exits 0.
- `tests/render-effect-contract.test.js` continues to pass — hybrid registration must not break the spine.

---

- [ ] U4. **MonsterRender + CelebrationLayer consume config**

**Goal:** Threads the published `bindings` and `celebrationTunables` into the runtime renderers. `<MonsterRender>` reads its monster's bindings from context, falls back to a per-`displayState` default when no binding row exists. `<CelebrationLayer>` resolves the matching `(monster, kind)` tunables and passes them to the celebration shell.

**Requirements:** R1, R2, R7

**Dependencies:** U3

**Files:**
- Modify: `src/platform/game/render/MonsterRender.jsx` (read bindings from context if `effects` prop is not supplied)
- Modify: `src/platform/game/render/CelebrationLayer.jsx` (resolve tunables for the queued event before invoking the kind's effect)
- Modify: `src/platform/game/render/effects/celebration-shell.js` (accept `showParticles`, `showShine`, `modifierClass` from config-resolved tunables)
- Modify: `src/surfaces/home/CodexCreature.jsx` (pass `effects` from per-monster bindings; default to today's `EGG_EFFECTS` / `MONSTER_EFFECTS` constants when no binding row exists)
- Test: extend `tests/render-monster-render.test.js`
- Test: extend `tests/render-celebration-layer.test.js`
- Test: extend `tests/render-effect-{caught,evolve,mega}.test.js`

**Approach:**
- `<MonsterRender>` first checks if `effects` prop is supplied; if not, reads `useMonsterEffectConfig().bindings[assetKey]` and synthesises `[...continuous, ...persistent]`. Backward compatible: callers passing `effects` directly are unaffected.
- `<CelebrationLayer>` reads the queued event's `monster.id`, `next.branch`, `next.stage` to compute the asset key, looks up `celebrationTunables[assetKey][event.kind]`, and threads the resolved tunables through `effect.render({ params, monster, context, simplified, onComplete, tunables })`.
- `celebration-shell.js` reads tunables from a new `tunables` prop instead of hardcoded `showParticles` / `showShine` defaults; falls back to the kind's static default when tunables are absent.

**Patterns to follow:**
- The post-hotfix `celebration-shell.js` integration with `useMonsterVisualConfig()` — the same hook pattern works for `useMonsterEffectConfig()`.
- `src/surfaces/home/CodexCreature.jsx`'s pattern of falling back to `EGG_EFFECTS` / `MONSTER_EFFECTS` constants when nothing better is available.

**Test scenarios:**
- Happy path: `<MonsterRender>` without `effects` prop and a config binding `[{kind:'shiny', params:{intensity:0.8}}]` renders the shiny overlay at 0.8 intensity.
- Happy path: `<MonsterRender>` without `effects` prop and no config binding falls back to the per-`displayState` default (egg-breathe / monster-motion-float).
- Happy path: `<CelebrationLayer>` with a `caught` event where tunables specify `showParticles: false` renders the celebration shell without particles.
- Edge case: `<CelebrationLayer>` with no config (no `MonsterEffectConfigContext` provider) falls back to today's hardcoded `showParticles: true` / `showShine: false` for `caught`.
- Edge case: bindings reference a `kind` that no longer exists in the registry — drop with dev-warn, render the rest.
- Integration: full path — caller passes only the monster + context; hybrid runtime registers config-defined `crystal-glint`; `<MonsterRender>` reads bindings; `composeEffects()` resolves; overlay renders.

**Verification:**
- All the above tests pass.
- The fixture-parity tests for `egg-breathe` and `monster-motion-float` continue to pass; the fallback path matches today's automatic-effects behaviour.

---

- [ ] U5. **Cloud draft + strict publish + validation**

**Goal:** Extend PR #100's autosave, cloud draft write, validation, publish, and restore paths to cover the new `effect` sub-document. One publish action covers visual + effect together; one validation gate stops both.

**Requirements:** R4, R6, R9

**Dependencies:** U1

**Files:**
- Modify: `src/platform/game/monster-visual-config.js` (add `validateEffectConfigForPublish` and call it from the existing `validateMonsterVisualConfigForPublish` orchestrator; rename if helpful or keep as sibling)
- Modify: the worker's published-config handler (location to confirm during implementation via `worker/src/` scan; PR #100 plan references mutation receipts and D1 retained published versions)
- Modify: `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` (autosave key continues to include manifest hash; draft buffer now serialises both sub-documents; queue filters extend with `effect-incomplete`, `effect-changed`, `effect-published-mismatch`)
- Test: `tests/effect-config-validation.test.js`
- Test: extend `tests/hub-api.test.js` (or the existing publish-path tests on the worker side)

**Approach:**
- Validation: every catalog entry's params validated against its template's schema; every binding's `kind` reference must resolve in the catalog (code defaults included); every celebration tunable validated against the matching template (`particles-burst` for `caught`, etc.); every (asset, kind) pair marked reviewed.
- Publish: one call writes the merged `{ visual, effect }` blob with version increment + 20-version retention (origin R19).
- Restore: pulls the merged blob into draft as one operation (origin R19, R5).
- Local autosave: extend the autosave key to invalidate when the effect schema version changes.

**Patterns to follow:**
- `validateMonsterVisualConfigForPublish` in `src/platform/game/monster-visual-config.js`.
- The strict publish gate from origin R17, R20.
- Mutation receipt pattern for save / publish / restore (origin R21).

**Test scenarios:**
- Happy path: a complete config (visual reviewed for every asset/context, effect reviewed for every asset/kind/binding row) passes validation and publishes.
- Edge case: a catalog entry references an unknown template — validation fails with a specific error.
- Edge case: a binding references a `kind` that exists neither in the catalog nor in code defaults — validation fails.
- Edge case: a celebration tunable's `modifierClass` is a non-empty string with whitespace — validation fails (XSS hardening).
- Edge case: any (asset × context × effect-binding-row) is unreviewed — validation fails (origin R20 spirit, extended).
- Edge case: effect sub-document missing entirely — validation fails (it's now required, like visual).
- Integration: publish writes both sub-documents atomically; partial publish is impossible.
- Integration: restore copies both sub-documents into draft; admin can toggle either independently before re-publish.

**Verification:**
- `node --test tests/effect-config-validation.test.js` exits 0.
- The existing strict-publish test for visual config continues to pass.
- A fresh manual publish in dev with a single-template, single-binding, single-tunable change lands cleanly and rolls back via restore.

---

- [ ] U6. **Admin UI: catalog editor**

**Goal:** A new section in `MonsterVisualConfigPanel` (or a sibling panel in the same hub surface) where admin can list catalog entries, create a new entry from a template, edit params + metadata, and mark each entry reviewed. Read-only for Operations.

**Requirements:** R3, R8 (origin R7, R8, R11, R12, R15)

**Dependencies:** U1, U2, U5

**Files:**
- Create: `src/surfaces/hubs/MonsterEffectCatalogPanel.jsx`
- Create: `src/surfaces/hubs/MonsterEffectFieldControls.jsx` (mirrors `MonsterVisualFieldControls.jsx` for effect params)
- Modify: `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` (mount the catalog panel, share autosave + draft-write hooks, share queue filter state)
- Test: `tests/react-monster-effect-catalog-panel.test.js`

**Approach:**
- The catalog panel lists entries, surfaces template selection on creation, and renders param fields driven by the selected template's `paramSchema` (number / string / enum / boolean inputs).
- Editing flows through the same local autosave + manual cloud-draft save the visual panel uses (origin R13).
- Mark reviewed and revert apply per catalog entry (origin R12, R15).
- Operations users see the panel read-only.

**Patterns to follow:**
- `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` for the panel shell, autosave, and queue integration.
- `src/surfaces/hubs/MonsterVisualFieldControls.jsx` for typed input controls.

**Test scenarios:**
- Happy path: admin creates a new catalog entry from `sparkle` template — new row appears in the catalog, default params populated, marked unreviewed.
- Happy path: admin edits a catalog entry's `intensity` default param — local autosave updates within the existing autosave key window.
- Happy path: admin marks a catalog entry reviewed — entry shows reviewed badge; queue filter for unreviewed excludes it.
- Edge case: admin tries to delete a code-default catalog entry (`shiny`) — block with explanation.
- Edge case: admin sets `kind` to a value that collides with another catalog entry — block with inline error.
- Edge case: admin changes template after entering params — params reset to the new template's defaults with a confirmation prompt.
- Integration: admin saves draft with five new catalog entries — cloud draft contains all five; autosave key isolates the local buffer per (account, manifest hash).

**Verification:**
- `node --test tests/react-monster-effect-catalog-panel.test.js` exits 0.
- Manual: open the admin hub, create a new catalog entry, save draft, refresh — the draft survives.

---

- [ ] U7. **Admin UI: per-monster bindings + celebration tunables panel**

**Goal:** Inside the existing per-asset detail view, add two sub-panels: one for `bindings` (persistent + continuous effects this monster wears) and one for `celebrationTunables` (caught / evolve / mega overrides). Both render preview alongside the existing six visual contexts.

**Requirements:** R1, R2, R7 (origin R8, R10)

**Dependencies:** U2, U4, U6

**Files:**
- Create: `src/surfaces/hubs/MonsterEffectBindingsPanel.jsx`
- Create: `src/surfaces/hubs/MonsterEffectCelebrationPanel.jsx`
- Modify: `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` (mount both panels into the per-asset detail view)
- Modify: `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` (or sibling) — preview tiles render `<MonsterRender>` with the draft bindings; a celebration preview tile renders the relevant kind via `<CelebrationLayer>` with the tunables applied
- Test: `tests/react-monster-effect-bindings-panel.test.js`
- Test: `tests/react-monster-effect-celebration-panel.test.js`

**Approach:**
- Bindings panel: admin adds bindings from a dropdown of catalog entries; for each binding fills in template-typed params; toggles `enabled`; orders bindings (z-index resolution within the same exclusive group).
- Celebration panel: admin selects each kind and toggles `showParticles`, `showShine`, sets `modifierClass`, and any other tunables the chosen template surfaces.
- Preview integration: the preview grid's existing six visual contexts continue to render visual fields; an additional "Celebration: caught / evolve / mega" tile renders the celebration with the draft tunables.
- Queue extension: the existing queue filter set adds `effect-incomplete` and `effect-published-mismatch` axes that consider both bindings and celebration tunables.

**Patterns to follow:**
- The detail-view pattern in `MonsterVisualConfigPanel.jsx` for cross-context preview.
- The autosave + draft-write hook the catalog panel uses (U6).
- The XSS hardening on `modifierClass` (U5 validation).

**Test scenarios:**
- Happy path: admin opens `inklet-b1-3` detail view, adds a `shiny` binding at intensity 0.8 — preview tiles in `codexCard` and `lightbox` render the shiny overlay at the new intensity.
- Happy path: admin toggles `showParticles: false` on `inklet-b1-3 caught` — the celebration preview tile renders the shell without particles.
- Edge case: admin adds two bindings with the same `exclusiveGroup` (e.g. `shiny` and `rare-glow`) — admin sees an inline notice that only the later one wins at render time; both rows persist (composeEffects resolves at render).
- Edge case: admin tries to bind a `kind` whose catalog entry is unreviewed — block with inline error (publish gate would fail anyway).
- Edge case: admin adds a binding referencing a deleted catalog entry — entry shows error state, can be removed but not edited.
- Integration: admin saves a binding + tunable, refreshes the page, the local autosave restores the in-progress edit.
- Integration: admin marks every (asset × context × binding × tunable) row reviewed — the queue's "incomplete" filter empties, publish becomes enabled.

**Verification:**
- Both new test files exit 0.
- Manual: full review pass of one monster (visual + bindings + celebration), publish, observe runtime change for a learner.

---

- [ ] U8. **Documentation, smoke, and rollout**

**Goal:** Update operational docs for the merged centre, add a production smoke probe for the effect config endpoint, and outline a rollout sequence that respects "publish covers both atomically".

**Requirements:** Operational hygiene; supports R4, R5, R6 in production.

**Dependencies:** U5, U6, U7

**Files:**
- Modify: `docs/monster-visual-config.md` (rename or supplement to cover the merged centre)
- Modify: `docs/operating-surfaces.md` (admin hub now covers effects too)
- Create: `scripts/effect-config-production-smoke.mjs`
- Modify: `package.json` (add `smoke:production:effect` script)
- Test: extend `tests/bundle-audit.test.js` if the audited surface changes

**Approach:**
- Operational doc: how admin authors a new catalog entry, how to roll back via restore, what bundled fallback covers when a publish fails partway.
- Smoke probe: hits the published-config endpoint, asserts the merged shape parses, asserts the catalog includes at least the eight code-default kinds, asserts every covered asset has bindings + celebration tunables.
- Rollout note: first publish must include the bundled defaults verbatim so behaviour is byte-equivalent; subsequent publishes can ramp.

**Patterns to follow:**
- `scripts/punctuation-production-smoke.mjs` for the smoke script shape.
- `docs/full-lockdown-runtime.md` for the doc tone.

**Test scenarios:**
- Happy path: smoke probe against a deployed env returns `ok: true` with merged config containing all 8 default kinds.
- Edge case: smoke probe handles HTTP 5xx with retries; reports `ok: false` with a clear failure list.
- Edge case: smoke probe rejects a config whose catalog is empty (would imply bundled defaults failed to seed).

**Verification:**
- `node --test tests/bundle-audit.test.js` continues to pass.
- `npm run smoke:production:effect` against a fresh deploy returns `ok: true`.

---

## System-Wide Impact

- **Interaction graph:** Worker config endpoint → `MonsterEffectConfigContext` (new) → `<MonsterRender>` and `<CelebrationLayer>` consume bindings and tunables. Admin queue filters extend the existing visual queue. Mutation receipts cover save / publish / restore for the merged document.
- **Error propagation:** Validation failures during publish surface in the admin UI as inline errors, blocking publish. Runtime registration errors (template unknown, malformed entry) drop the entry with `warnOnce`; the rest of the config proceeds. The eight code-defined effects always re-register first so a broken catalog can never fully blank monster rendering.
- **State lifecycle risks:** Merged publish is one D1 row update — atomic by construction. The local autosave key includes manifest hash and draft revision, so schema migrations invalidate stale buffers. Restore copies both sub-documents to draft as one operation.
- **API surface parity:** The publish endpoint's payload shape grows; existing visual-only consumers must tolerate the new `effect` sub-document (treat it as optional during transition until U5 lands).
- **Integration coverage:** `tests/react-monster-effect-bindings-panel.test.js` and `tests/render-monster-render.test.js` together cover the full draft → preview → live runtime path.
- **Unchanged invariants:** `defineEffect()` shape, the eight code-registered effects, the `composeEffects` pipeline, the celebration event shape, the worker's mutation-receipt pattern. None of these change.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Template set proves too narrow for designer intent | Templates are extensible — adding one is a code change, not a schema change. Plan an early review after U2 with sample monsters to validate coverage. |
| Publishing a broken catalog blanks all monster rendering | Hybrid registry always registers the eight code defaults FIRST; broken catalog entries are dev-warned and skipped, never replacing defaults. |
| Admin authors `modifierClass` with class injection / XSS | Strict publish validation rejects whitespace, special chars, and unknown class names. Templates own actual class output; admin only picks from declared options. |
| Effect bindings desync from visual config across publishes | Single combined publish — both sub-documents move together; restore restores both. |
| Existing visual-only test fixtures break when the schema gains `effect` | U5's validator treats `effect` as required; all visual-only fixtures get the bundled `effect` defaults appended in a one-time test fixture migration. |
| Per-monster bindings explode the autosave payload size | Bindings are sparse (most monsters only override one or two effects); the existing autosave key already keys on draft revision and invalidates on schema bumps. |

---

## Documentation / Operational Notes

- `docs/monster-visual-config.md` becomes the single source for both visual and effect config authoring; supplement with an "Effect catalog and bindings" section.
- `docs/operating-surfaces.md` is updated to note the admin hub now covers effects.
- `npm run smoke:production:effect` is added alongside the existing `smoke:production:*` family.
- Rollout: first publish after this lands must be the bundled defaults verbatim so behaviour is byte-equivalent. Subsequent publishes may diverge.
- Audit: extend the production bundle audit to cover the merged config endpoint shape.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-24-monster-visual-config-centre-requirements.md](../brainstorms/2026-04-24-monster-visual-config-centre-requirements.md)
- Sibling plan: [docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md](2026-04-24-002-feat-monster-visual-config-centre-plan.md) (PR #100)
- Sibling plan: [docs/plans/2026-04-24-002-feat-monster-effect-library-plan.md](2026-04-24-002-feat-monster-effect-library-plan.md) (PR #119)
- Related code:
  - `src/platform/game/render/{define-effect,registry,composition}.js` — effect contract spine
  - `src/platform/game/render/effects/{egg-breathe,monster-motion-float,shiny,mega-aura,rare-glow,caught,evolve,mega,celebration-shell,palette}.js` — bundled effects
  - `src/platform/game/monster-visual-config.js`, `src/platform/game/MonsterVisualConfigContext.jsx`, `src/platform/game/monster-asset-manifest.js` — visual config foundations
  - `src/surfaces/hubs/MonsterVisualConfigPanel.jsx`, `src/surfaces/hubs/MonsterVisualFieldControls.jsx`, `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` — admin UI to extend
  - `src/platform/game/render/MonsterRender.jsx`, `src/platform/game/render/CelebrationLayer.jsx` — runtime renderers consuming the new bindings/tunables
- Related PRs: #100 (visual config centre), #119 (effect library), #141 (celebration shell visual-config hotfix)
