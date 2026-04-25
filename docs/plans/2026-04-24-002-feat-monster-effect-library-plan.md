---
title: feat: Monster animation and effect library
type: feat
status: active
date: 2026-04-24
---

# feat: Monster animation and effect library

## Overview

Reshape `src/platform/game/` into a composable visual library for monster animations and effects. Today the folder mixes mastery tracking (771-line `monster-system.js`), event normalisation, ack tracking, and two hard-coded CSS motion presets. Adding a new visual (e.g. shiny aura, rare glow, mega rays) currently requires editing several files and inventing ad hoc CSS — there is no extension point.

The new library exposes a small, trigger-agnostic surface:

- A declarative `<MonsterRender>` component that takes a monster + an `effects` array
- An imperative `playCelebration()` queue feeding a single `<CelebrationLayer>` mounted at app root
- A `defineEffect()` factory that lets each effect live in one self-contained module with explicit lifecycle, layer, surface scope, and reduced-motion behaviour
- A registry-driven composition pipeline that enforces stacking rules, exclusive groups, and surface filtering uniformly

Mastery logic (currently entangled with rendering) moves to its own module so the visual library is purely visual.

---

## Problem Frame

Three concrete pains motivate this rethink:

1. **Adding new effects is expensive.** Shiny / rare / aura overlays do not exist; today, adding one requires touching `monsters.js`, `monster-celebrations.js`, the consuming surface (`CodexCreature.jsx`, `CodexCreatureLightbox.jsx`, `MonsterMeadow.jsx`), and inventing CSS in surface stylesheets. There is no shared contract.
2. **Cross-subject reuse is awkward.** Spelling, punctuation, and grammar each `import` directly from `monster-system.js` and emit slightly different reward event shapes. The visual layer cannot be exercised without going through subject-specific code paths.
3. **Visual concerns and mastery concerns are tangled.** `monster-system.js` is 771 lines mixing per-subject mastery rules, event generation, and progress lookups; the file is also the place from which subjects import view-time helpers like `monsterIdForSpellingWord`. A subject change risks breaking the visual contract and vice versa.

The brainstorm conversation (this session, Phase 2) established that the library should be **trigger-agnostic** — all four trigger models (progression-unlock, RNG, author-tagged, hybrid) coexist outside the library, which only renders what callers declare.

---

## Requirements Trace

- R1. A new effect type can be added by creating a single file under `src/platform/game/render/effects/` that uses `defineEffect()`. No edits to base components are required.
- R2. Multiple effects may stack on the same monster (e.g. shiny + mega-aura + idle-bob) without bespoke per-combination CSS. Stacking rules are enforced by the registry.
- R3. Persistent overlays (shiny, rare-glow, mega-aura), continuous motion (egg-breathe, monster-motion-float), and transient celebrations (caught, evolve, mega) all use the same module, but with the lifecycle they need.
- R4. The library is trigger-agnostic: all decisions about which effects to apply are made by callers. The library never reads mastery state, RNG, or player profile data.
- R5. Existing visual behaviour is preserved: every monster keeps its current hash-seeded breathe/float parameters, stage-tiered motion profiles, and the three existing celebration overlays (`caught`, `evolve`, `mega`).
- R6. `prefers-reduced-motion` is respected per effect. Each effect declares `reducedMotion: 'omit' | 'simplify' | 'asis'`.
- R7. Mastery functions used by subjects (`recordMonsterMastery`, `monsterIdForSpellingWord`, `derivePhaeton`, `progressForMonster`, etc.) keep their public API, but live in a `mastery/` module separate from the render library.
- R8. New effects added in this plan: `shiny`, `mega-aura`, `rare-glow` — concrete validation that the contract supports the brainstorm catalog.

---

## Scope Boundaries

- **Trigger logic is out of scope.** This plan does not implement RNG-based shiny encounters, milestone-based rarity unlock, or default-effect declarations on `monsters.js`. That is a follow-up once the library exists.
- **Audio is out of scope.** Effects do not trigger sound. A future `audioChannel` extension is left as a Future Consideration.
- **No new monster artwork.** Existing PNG sprites under `assets/monsters/` are reused. Overlay effects are CSS / inline SVG, not new sprite variants.
- **No worker-side change.** `worker/src/projections/monster-replays.js` and reward event shapes stay as they are. The Worker remains authoritative for mastery; this plan only reshapes the browser-side render layer.
- **Backward compatibility for stored `monsterCelebrations` queue is required.** Existing serialised pending/queue events must continue to render after migration; no data migration is planned.

### Deferred to Follow-Up Work

- Default-effects declaration on `monsters.js` entries (e.g. phaeton always carries a subtle aura): separate plan once the library is exercised in production.
- Per-effect audio channel: future consideration after the visual library is stable.
- Shiny RNG / progression-unlock triggers: separate plan owned by subject layer or a new `effect-policy` module.

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/game/monsters.js` — pure data registry (15+ monsters × 5 stages, accent/secondary/pale palette, `nameByStage`, `masteredMax`).
- `src/platform/game/monster-system.js` (771 lines) — mastery rules + event generation. Public exports used by tests: `recordMonsterMastery`, `monsterIdForSpellingWord`, `derivePhaeton`, `progressForMonster`, `monsterSummary`, `monsterSummaryFromSpellingAnalytics`, `ensureMonsterBranches`. Used by `tests/monster-system.test.js`.
- `src/platform/game/monster-celebrations.js` — event normalisation: `OVERLAY_KINDS = { caught, evolve, mega }`, `isMonsterCelebrationEvent`, `normaliseMonsterCelebrationEvent`, `shouldDelayMonsterCelebrations`.
- `src/platform/game/monster-celebration-acks.js` — ack persistence in `localStorage` via `ACK_STORAGE_KEY`.
- `src/surfaces/home/data.js` — `eggBreatheStyle()` and `monsterMotionStyle()`: hash-seeded (`hashString` FNV-1a) per-monster CSS variable generators with stage-tiered profiles and context-aware sizing (`card` / `feature` / `preview`). Must be preserved verbatim during port.
- `src/surfaces/home/CodexCreature.jsx` — current consumer: applies `eggBreatheStyle` / `monsterMotionStyle` via inline `style` on `<img>`, plus class names `is-${entry.displayState}` (`fresh` / `egg` / `monster`). The actual CSS keyframes live in surface stylesheets.
- `src/platform/app/create-app-controller.js` — celebrations integration: `published.reactionEvents.filter(isMonsterCelebrationEvent)` then `store.deferMonsterCelebrations` or `store.pushMonsterCelebrations`; dismissal via action `monster-celebration-dismiss` calling `acknowledgeMonsterCelebrationEvents`.
- `tests/monster-system.test.js` — dedicated test suite for mastery functions; this must keep working after split.

### Architecture & Convention Notes

- Codebase is vanilla JS (`.js` and `.jsx`), not TypeScript — runtime validation only, no Zod (avoid new dependency).
- React surfaces under `src/surfaces/<route>/`, platform code under `src/platform/`, subjects under `src/subjects/<subjectId>/`.
- Existing tests use `node:test` + `node:assert/strict`, no test framework dependency.
- Worker-authoritative runtime: browser sends intent + renders read models; this plan does not change that.

### Institutional Learnings

- `docs/solutions/` does not contain entries matching monster, render, or animation topics (verified by listing). No prior learnings constrain this plan.

### External References

- External research skipped: this is internal frontend composition, no security/payments/migration risk, and local patterns (existing CSS variable generators, React composition) are sufficient.

---

## Key Technical Decisions

- **Approach B from brainstorm: layered overlay components.** Rejected A (CSS variants) because PNG variant explosion (16 monsters × 5 stages × N variants) and stacking limitations. Rejected C (full SVG migration) as scope creep — leave as future option. Rejected D (Lottie) as it requires a designer pipeline.
- **Three lifecycles, kept distinct.** `persistent` (always-on while monster is shown), `continuous` (RAF or CSS-keyframes idle motion), `transient` (one-shot, queue-popped). They render through different code paths (declarative props vs queue subscription) and collapsing them creates branching elsewhere. Rationale: lifecycle is the single most distinguishing property and reviewers read the plan more easily when each path has a single purpose.
- **Two layers only: `'base'` and `'overlay'`.** `base` effects compose transforms on the base sprite (motion). `overlay` effects render DOM siblings with `zIndex` ordering and CSS blend modes. Particle / filter layers can be added later if proven needed (YAGNI).
- **Split API: declarative props for state-bound effects, imperative `playCelebration()` for transient ones.** Rationale: persistent state belongs in render props (React reconciliation handles add/remove); transient celebrations are intrinsically queue-shaped (multiple pending, must dismiss in order, ack persists) and forcing them into props would mean fighting reconciliation.
- **Effect registry, not direct imports.** Effects register themselves at module load (`registerEffect(defineEffect({...}))`). Renderers look up by `kind`, not by import. Lets the catalog grow without churning the render component.
- **Vanilla JS runtime validation in `defineEffect()`.** Each effect declares a `params` schema (type/default/min/max/enum). The factory validates input at render time, dev-warns on unknown `kind` or unknown param. No Zod, no TypeScript — matches codebase style.
- **`monster-system.js` splits into `mastery/` (subject-facing logic) and `render/` (visual library).** Public exports listed in research stay importable from a thin `monster-system.js` re-export shim during migration to avoid breaking tests and subject hooks.
- **Folder structure:** `src/platform/game/render/` for the new visual library, `src/platform/game/mastery/` for subject-facing mastery functions, `src/platform/game/monsters.js` (data) and `src/platform/game/monster-system.js` (re-export shim) stay at top level.

---

## Open Questions

### Resolved During Planning

- **Should `monsters.js` declare `defaultEffects`?** Deferred to follow-up. Rationale: solving it requires the library to exist first; carrying it now mixes catalog and render concerns.
- **Where does `playCelebration()` mount?** Single `<CelebrationLayer>` near app root in `src/main.jsx` (or wherever the React tree's outermost layout lives) so celebrations float above all surfaces uniformly.
- **What happens to existing `monsterCelebration` events in storage during migration?** They keep flowing. The migration is consumer-side: old `<MonsterCelebrationOverlay>` (or its current implementation) is replaced by `<CelebrationLayer>`, which subscribes to the same store slice and re-renders the same event shape via the new `caught` / `evolve` / `mega` effect modules.

### Deferred to Implementation

- **Exact surface where `<CelebrationLayer>` mounts.** Will be obvious once we trace where today's celebration UI mounts (likely `src/surfaces/app/AppShell.jsx` or similar; identify during U6 implementation).
- **Whether `continuous` lifecycle uses RAF or pure CSS.** Today's `monsterMotionStyle` is CSS-keyframe driven via CSS variables. Likely answer: CSS for current motion, RAF only if a future effect needs it. Decide per-effect when implementing.
- **Whether to keep `monster-system.js` re-export shim long-term or delete after subject hooks are updated.** Leave shim, decide on removal in a follow-up clean-up PR once the new layout has soaked.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Effect contract — directional shape

```text
defineEffect({
  kind, lifecycle, layer, surfaces[], zIndex?, exclusiveGroup?, reducedMotion,
  params: { <name>: { type, default?, min?, max?, values? } },
  // pick ONE of the three based on layer/lifecycle:
  render({ params, monster, context, onComplete? })   -> JSX | null     // overlay layer
  applyTransform({ params, monster, time?, context })  -> { translateY?, scale?, ... }   // base layer
})
```

### Render pipeline

```
<MonsterRender monster stage context effects>
  ├─ resolve effects []                  -> registry lookup by kind
  ├─ filter by surfaces[]                -> drop wrong-surface effects (dev-warn)
  ├─ apply exclusiveGroup conflict rule  -> last wins, others dev-warn
  ├─ apply prefers-reduced-motion        -> per-effect 'omit' | 'simplify'
  ├─ split by layer                      -> base[], overlay[]
  ├─ compose base transforms             -> matrix multiply / merge CSS vars
  ├─ render <BaseSprite> with composed transform
  └─ render overlay[] sorted by zIndex
```

### Celebration queue pipeline

```
playCelebration(spec) -> store.pushCelebration(spec)
                                    │
                                    ▼
        <CelebrationLayer> subscribes to store.celebrations.queue
                                    │
                                    ▼
        renders effect module for spec.kind on top of scrim
                                    │
                                    ▼
        on complete -> store.advanceCelebration() + ack persist
```

---

## Implementation Units

- [ ] U1. **Effect contract, factory, registry, composition rules**

**Goal:** Define the `defineEffect()` factory, an in-memory registry, and the rules that govern stacking, exclusive groups, surface filtering, and reduced-motion behaviour. This is the spine the rest of the plan builds on.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `src/platform/game/render/define-effect.js`
- Create: `src/platform/game/render/registry.js`
- Create: `src/platform/game/render/composition.js`
- Test: `tests/render-effect-contract.test.js`

**Approach:**
- `defineEffect(spec)` returns a frozen effect descriptor; validates required fields and `params` schema shape at definition time.
- `registerEffect(effect)` adds to a `Map<kind, effect>`; second registration of the same `kind` replaces (dev-warn).
- `composeEffects({ effects, monster, context })` runs the pipeline: lookup → surface filter → exclusive-group resolution → reduced-motion application → split by layer → return `{ base, overlay }` arrays.
- Reduced-motion detection through a small helper that reads `window.matchMedia('(prefers-reduced-motion: reduce)')`; injectable for tests.
- All dev warnings go through a single `warnOnce(key, message)` helper to avoid console spam.

**Execution note:** Test-first. The contract is the load-bearing seam; characterise it via tests before any consumer code.

**Patterns to follow:**
- Existing input normalisation style in `src/platform/game/monster-celebrations.js` (defensive normalisation, never throws on malformed input).
- `node:test` + `node:assert/strict` from `tests/monster-system.test.js`.

**Test scenarios:**
- Happy path: `defineEffect()` accepts a minimal valid spec and returns a frozen descriptor with defaulted optional fields.
- Happy path: `composeEffects()` returns `{ base: [...], overlay: [...] }` correctly split by `layer` and sorted overlay by `zIndex` ascending.
- Edge case: empty `effects` array returns `{ base: [], overlay: [] }`.
- Edge case: same `kind` listed twice in `effects` array — last wins, prior is silently dropped.
- Error path: `defineEffect()` with missing `kind` or invalid `lifecycle` throws with a descriptive message.
- Error path: `composeEffects()` with unknown `kind` skips it and dev-warns; does not throw.
- Edge case: `surfaces` mismatch — effect dropped, dev-warn.
- Edge case: two effects with the same `exclusiveGroup` — later one wins, earlier dev-warns.
- Edge case: `prefers-reduced-motion` injected as `true`, effect with `reducedMotion: 'omit'` is dropped from output entirely.
- Edge case: `prefers-reduced-motion` injected as `true`, effect with `reducedMotion: 'simplify'` keeps a `simplified: true` flag in the descriptor for the renderer to read.
- Integration: registry survives multiple `registerEffect()` calls and `composeEffects()` reads the latest registration.

**Verification:**
- All scenarios in `tests/render-effect-contract.test.js` pass.
- `node --test tests/render-effect-contract.test.js` exits 0 and the test file exercises every scenario above.

---

- [ ] U2. **`<MonsterRender>` declarative React component**

**Goal:** A single React component that consumes the composition pipeline and renders a monster with its persistent + continuous effects layered correctly. No mastery logic; no event subscription.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1

**Files:**
- Create: `src/platform/game/render/MonsterRender.jsx`
- Create: `src/platform/game/render/BaseSprite.jsx` (the inner `<img>` with composed transform)
- Test: `tests/render-monster-render.test.js`

**Approach:**
- Props: `{ monster, stage, context = 'card', effects = [] }`. `monster` is a normalised entry (id, accent, secondary, pale, etc.).
- Composes effects via U1, then renders `<BaseSprite>` with merged transform style + each overlay as a sibling positioned absolutely.
- For `continuous` `base`-layer effects (e.g. egg-breathe, monster-motion), merges their `applyTransform()` output into a single inline style block, exactly mirroring today's behaviour where `eggBreatheStyle` / `monsterMotionStyle` outputs CSS variables for keyframe consumption.
- For `transient` effects in `effects` array — by contract these don't belong here. Renderer dev-warns and drops; transient effects flow through `<CelebrationLayer>` (U3).
- A11y: `<BaseSprite>` carries the `alt`; overlay nodes set `aria-hidden="true"`.

**Patterns to follow:**
- `src/surfaces/home/CodexCreature.jsx` for the existing pattern of `<img className srcSet style />` composition.
- React hooks for `prefers-reduced-motion` detection injected via context (one provider per app, mock-friendly).

**Test scenarios:**
- Happy path: renders monster image with correct `src`, `srcSet`, `alt`, and class names matching today's contract (snapshot or structural assertion against output element list).
- Happy path: with one `base`-layer continuous effect, the composed transform style appears on `<BaseSprite>`.
- Happy path: with two `overlay`-layer persistent effects, two overlay siblings render in `zIndex` order and each carries `aria-hidden="true"`.
- Edge case: empty `effects` array renders just the base sprite with no overlays.
- Edge case: `effects` includes a `transient` lifecycle entry — dev-warns, drops, base still renders.
- Edge case: `displayState === 'fresh'` (uncaught monster) renders the placeholder pattern from today's `CodexCreatureVisual`, ignores effects.
- Integration: when reduced-motion context is `true`, an effect declaring `reducedMotion: 'omit'` is absent from the rendered tree.

**Verification:**
- All scenarios pass.
- Visual parity check: a story or smoke harness rendering one monster with empty `effects` produces visually identical DOM to today's `<CodexCreatureVisual>` (compare class list, style keys, `srcSet`).

---

- [ ] U3. **`<CelebrationLayer>` and `playCelebration()` queue API**

**Goal:** A single overlay layer mounted at app root that subscribes to a celebration queue in the store and renders `transient` effect modules one at a time. `playCelebration(spec)` is the imperative push API.

**Requirements:** R3, R4, backward compatibility for stored events.

**Dependencies:** U1

**Files:**
- Create: `src/platform/game/render/CelebrationLayer.jsx`
- Create: `src/platform/game/render/play-celebration.js`
- Modify: `src/platform/core/store.js` (add `pushCelebration` / `advanceCelebration` actions if not already present in equivalent form)
- Test: `tests/render-celebration-layer.test.js`

**Approach:**
- `playCelebration({ kind, monster, surface, params })` validates against the registered effect's `params` schema, then pushes to `store.celebrations.queue`.
- `<CelebrationLayer>` subscribes to `store.celebrations.queue[0]`, looks up the registered `transient` effect, renders it with an `onComplete` callback that calls `store.advanceCelebration()` and persists ack via `acknowledgeMonsterCelebrationEvents`.
- Reuse the existing `monster-celebration-acks.js` storage; no new key.
- For backward-compat: when a celebration event already exists in the legacy `pending` / `queue` shape (per `monster-celebrations.js`), `<CelebrationLayer>` reads from the same store slice and maps `kind` (caught / evolve / mega) into the new effect lookup.

**Execution note:** Characterise existing celebration flow before changing it. Read where today's celebration overlay mounts and how dismissal flows (`monster-celebration-dismiss` action in `create-app-controller.js`).

**Patterns to follow:**
- `src/platform/core/store.js` action-dispatch pattern (verify exact shape during implementation).
- `src/platform/game/monster-celebration-acks.js` for ack persistence.
- Existing dismissal handling in `src/platform/app/create-app-controller.js` lines around `monster-celebration-dismiss`.

**Test scenarios:**
- Happy path: `playCelebration({ kind: 'caught', monster, surface: 'lesson', params: {...} })` pushes a normalised event to the queue.
- Happy path: when `queue[0]` exists, `<CelebrationLayer>` renders the matching transient effect and passes an `onComplete` prop.
- Happy path: invoking `onComplete` advances the queue and persists an ack via `monster-celebration-acks`.
- Edge case: queue is empty → renders `null`.
- Edge case: `playCelebration` called with unknown `kind` — dev-warns, does not push.
- Edge case: legacy event shape (existing `monsterCelebrations.queue` entries) renders correctly via the new layer.
- Error path: ack-storage write fails — celebration still advances, error is surfaced via `warnOnce` rather than blocking UI.
- Integration: dispatching `monster-celebration-dismiss` action through the existing app controller path advances the new layer just like today's overlay (covers the migration seam).

**Verification:**
- All scenarios pass.
- Manual smoke: trigger a spelling word mastery in a dev session, observe `caught` / `evolve` / `mega` celebration appearing and dismissing identically to today's behaviour.

---

- [ ] U4. **Port existing motion (`egg-breathe`, `monster-motion-float`) as the first two effects**

**Goal:** Move today's `eggBreatheStyle` and `monsterMotionStyle` (in `src/surfaces/home/data.js`) into effect modules so existing motion runs through the new pipeline. This proves the contract against real, deterministic, well-tested behaviour.

**Requirements:** R5

**Dependencies:** U1, U2

**Files:**
- Create: `src/platform/game/render/effects/egg-breathe.js`
- Create: `src/platform/game/render/effects/monster-motion-float.js`
- Modify: `src/surfaces/home/data.js` (export thin wrappers that delegate to the new effects, OR mark `eggBreatheStyle` / `monsterMotionStyle` deprecated re-exports)
- Modify: `src/surfaces/home/CodexCreature.jsx` (consume `<MonsterRender>` instead of inline `creatureMotionStyle()`)
- Test: `tests/render-effect-egg-breathe.test.js`
- Test: `tests/render-effect-monster-motion-float.test.js`

**Approach:**
- Each effect declares `lifecycle: 'continuous'`, `layer: 'base'`, `surfaces: ['*']`.
- `applyTransform()` returns the same CSS-variable map today's helpers produce — including the FNV-1a hash seeding (`hashString`), stage-tier profiles, and context sizing.
- Move `hashString` + `valueBetween` into `src/platform/game/render/seed.js` so multiple effects share them. Keep behaviour byte-identical.
- `data.js` either re-exports from the new modules (preferred, smallest blast radius) or is deleted once `CodexCreature.jsx` migrates.
- `CodexCreature.jsx`'s `creatureMotionStyle()` switch on `displayState` becomes: choose effect kind (`egg-breathe` for egg, `monster-motion-float` for monster), pass to `<MonsterRender>`.

**Execution note:** Characterisation tests first. The current motion is deterministic (seeded by `id:species:branch:stage:context`), so we can lock current output values into a fixture and assert byte-equality after the port.

**Patterns to follow:**
- Hash seeding pattern in `src/surfaces/home/data.js:200-280`.
- Keep CSS-variable names identical (`--egg-breathe-duration`, `--monster-float-pan-a`, etc.) so existing surface stylesheets continue to consume them unchanged.

**Test scenarios:**
- Happy path: for a known monster (`inklet`, stage 1, context `card`), the `monster-motion-float` effect produces the same CSS-variable values as today's `monsterMotionStyle({ id: 'inklet', stage: 1 }, 'card')`. Capture today's output as a fixture.
- Happy path: same fixture check across all 5 stages (egg, 1, 2, 3, 4) and all 3 contexts (`card`, `feature`, `preview`).
- Happy path: `egg-breathe` produces identical output for `displayState === 'egg'` cases.
- Edge case: missing `seed.id` — falls back gracefully exactly as today (joining whatever fields are present).
- Edge case: invalid `stage` (e.g. 99) clamps to `[1, 4]` like today's `Math.max(1, Math.min(4, ...))`.
- Integration: `<CodexCreature>` rendered with `<MonsterRender>` produces a DOM tree whose inline style includes every CSS variable today's component sets.

**Verification:**
- All fixture parity tests pass byte-identically.
- `tests/codex-view-model.test.js` continues to pass (or only benign assertion-shape updates).
- Visual smoke in dev: `/` (home) and codex render with no perceptible motion difference.

---

- [ ] U5. **Add the first three new overlay effects: `shiny`, `mega-aura`, `rare-glow`**

**Goal:** Concrete validation that the contract supports the brainstorm catalog. These effects can be mounted by callers but no caller in this plan triggers them automatically — they are exercised via tests and a dev playground story.

**Requirements:** R1, R2, R8

**Dependencies:** U1, U2

**Files:**
- Create: `src/platform/game/render/effects/shiny.js`
- Create: `src/platform/game/render/effects/mega-aura.js`
- Create: `src/platform/game/render/effects/rare-glow.js`
- Create: `src/platform/game/render/effects/effects.css` (or per-effect CSS file, decide during implementation)
- Test: `tests/render-effect-shiny.test.js`
- Test: `tests/render-effect-mega-aura.test.js`
- Test: `tests/render-effect-rare-glow.test.js`

**Approach:**
- `shiny`: persistent overlay, intensity-controlled sparkle layer using monster `accent` colour. `exclusiveGroup: 'rarity'`.
- `mega-aura`: persistent overlay, radiating rays + slow rotate using `accent` and `secondary`. No exclusive group (composes with `shiny`).
- `rare-glow`: persistent overlay, soft pulsing halo using `pale`. `exclusiveGroup: 'rarity'`.
- All three: `surfaces: ['codex', 'lightbox', 'home']` (excluded from `lesson` to avoid distraction during work). `reducedMotion: 'simplify'` (drop animation, keep static glow).
- Use CSS keyframes; no JS-driven animation (RAF) for these. Performance budget: each effect adds at most one DOM node and one CSS animation.

**Patterns to follow:**
- Existing surface CSS conventions (Fraunces aesthetic, paper feel). New effect CSS lives alongside its module.
- Colour use mirrors current accent/secondary/pale palette from `monsters.js`.

**Test scenarios:**
- Happy path: each effect renders a single overlay element with `aria-hidden="true"` and CSS variables sourced from `monster.accent` / `monster.secondary` / `monster.pale`.
- Happy path: `shiny` and `rare-glow` declared together — `rare-glow` (later in array) wins, `shiny` dev-warns.
- Happy path: `shiny` and `mega-aura` together — both render (no exclusive-group conflict).
- Edge case: `intensity` param out of range (e.g. `1.5`) — clamps to `[0, 1]`.
- Edge case: monster missing `pale` colour — `rare-glow` falls back to `accent` with a dev-warn (or to a neutral default; decide during implementation).
- Edge case: surface is `'lesson'` — all three effects are filtered out by the registry, no DOM rendered.
- Integration: with `prefers-reduced-motion`, animated elements are absent or replaced by a static variant per the effect's `reducedMotion: 'simplify'` policy.

**Verification:**
- All scenarios pass.
- Dev playground page (or one CodexCreatureLightbox usage) renders a monster with all three effects stacked and they look right (no overlap glitches, palette correct).

---

- [ ] U6. **Migrate `caught` / `evolve` / `mega` celebrations to `<CelebrationLayer>`**

**Goal:** Replace today's celebration overlay with the new layer + transient effect modules. Existing reward events (`type: 'reward.monster'`, `kind: 'caught' | 'evolve' | 'mega'`) flow through the new layer with no shape change.

**Requirements:** R3, R5, backward compatibility

**Dependencies:** U3

**Files:**
- Create: `src/platform/game/render/effects/caught.js`
- Create: `src/platform/game/render/effects/evolve.js`
- Create: `src/platform/game/render/effects/mega.js`
- Modify: `src/platform/app/create-app-controller.js` (event filtering still uses `isMonsterCelebrationEvent`; route through `<CelebrationLayer>` rather than legacy overlay component)
- Modify: wherever today's celebration overlay mounts (identify during implementation — likely under `src/surfaces/app/` or equivalent app shell)
- Delete (after migration verified): the legacy celebration overlay component, if it is no longer referenced
- Test: `tests/render-effect-caught.test.js`
- Test: `tests/render-effect-evolve.test.js`
- Test: `tests/render-effect-mega.test.js`
- Test: extend `tests/app-controller.test.js` for celebration routing (if existing structure supports inline assertions)

**Approach:**
- Each transient effect declares `lifecycle: 'transient'`, `durationMs`, `surfaces: ['lesson', 'home', 'codex']`. Reuse the visual pattern of today's `caught` / `evolve` / `mega` overlays.
- `<CelebrationLayer>` (from U3) reads `store.monsterCelebrations.queue[0]`, looks up the matching transient effect by `kind`, renders it with `monster` + `previous` + `next` from the event payload + `onComplete` callback.
- `monster-celebrations.js` keeps its `OVERLAY_KINDS` set and normalisers — no shape change. The new layer is only the consumer.
- Ack persistence stays via `acknowledgeMonsterCelebrationEvents` from `monster-celebration-acks.js`.
- App controller's `monster-celebration-dismiss` action still works as today; `<CelebrationLayer>` just dispatches it on `onComplete`.

**Patterns to follow:**
- Event normalisation idioms in `src/platform/game/monster-celebrations.js`.
- App-controller action pattern in `src/platform/app/create-app-controller.js`.

**Test scenarios:**
- Happy path: a `caught` reward event in the store queue renders the `caught` transient effect via `<CelebrationLayer>`.
- Happy path: `evolve` from stage 2 → 3 renders with `previous` and `next` data threaded into the effect.
- Happy path: dismissal calls `acknowledgeMonsterCelebrationEvents` and advances the queue.
- Edge case: queue contains both a deferred event (`shouldDelayMonsterCelebrations` true during a session) and a fresh one — only the appropriate one renders, ordering matches today's behaviour.
- Edge case: an event whose `kind` is not in `OVERLAY_KINDS` is filtered out before queue insert (existing guard in `isMonsterCelebrationEvent`); the layer never sees it.
- Integration: `tests/app-controller.test.js` continues to pass; the controller-side wiring for `monster-celebration-dismiss` still resolves to ack persistence.

**Verification:**
- Existing user-visible celebration behaviour is byte-identical (or as close as the visual port allows, with intentional design refinements documented).
- `tests/app-controller.test.js` and any legacy celebration tests pass.
- Manual smoke: complete a spelling cluster in a dev session; observe `caught` / `evolve` / `mega` overlays present and dismissable.

---

- [ ] U7. **Split mastery from render: extract `mastery/` module**

**Goal:** Move subject-facing mastery functions out of the visual library so `src/platform/game/render/` is purely visual. Subjects keep their public API surface unchanged.

**Requirements:** R4, R7

**Dependencies:** U1 (registry must be in place so render code does not need to import from mastery)

**Files:**
- Create: `src/platform/game/mastery/index.js` (re-exports the public mastery API)
- Create: `src/platform/game/mastery/spelling.js`
- Create: `src/platform/game/mastery/punctuation.js`
- Create: `src/platform/game/mastery/grammar.js`
- Create: `src/platform/game/mastery/phaeton.js`
- Modify: `src/platform/game/monster-system.js` (collapses to a thin re-export shim from `mastery/index.js`)
- Modify: `src/subjects/spelling/event-hooks.js` (update import path or leave shim in place)
- Modify: `src/subjects/punctuation/event-hooks.js` (same)
- Modify: `src/subjects/grammar/event-hooks.js` (same)
- Test: `tests/monster-system.test.js` continues to import from `src/platform/game/monster-system.js` (shim path preserves compatibility)

**Approach:**
- Section the existing 771-line file by subject. Each subject's mastery rules move to its own module under `mastery/`. Phaeton (the cross-pool aggregate) gets its own module.
- `monster-system.js` becomes ~5 lines: re-exports of the public API. This preserves test imports and subject hook imports verbatim.
- No behaviour change. This is a pure file-level move plus shim.
- After this unit, follow-up work can update subject hooks to import from `src/platform/game/mastery/` directly and delete the shim. Out of scope for this plan.

**Execution note:** Characterisation: do not modify any logic. Move-only. The shim's job is to make `tests/monster-system.test.js` continue to pass without edits.

**Patterns to follow:**
- Existing module shape in `src/platform/game/monster-system.js`.
- Existing test import style in `tests/monster-system.test.js`.

**Test scenarios:**
- All existing scenarios in `tests/monster-system.test.js` continue to pass with no edits — this is the primary verification.
- Edge case: if a subject hook imports a function not re-exported from the shim, the test would fail at import time. Confirm full list of shim re-exports covers: `derivePhaeton`, `ensureMonsterBranches`, `monsterIdForSpellingWord`, `monsterSummary`, `monsterSummaryFromSpellingAnalytics`, `progressForMonster`, `recordMonsterMastery`, plus any punctuation/grammar exports used by their event-hooks.

**Verification:**
- `node --test tests/monster-system.test.js` passes unchanged.
- All subject `event-hooks.js` files compile and the existing subject-rewards tests (`tests/punctuation-rewards.test.js`, `tests/grammar-rewards.test.js`) pass.
- `wc -l src/platform/game/monster-system.js` returns < 20 after the move (shim only).

---

## System-Wide Impact

- **Interaction graph:** App controller → store → `<CelebrationLayer>` (new) → effect module → ack storage. Subject hooks → mastery module (split from render) → reward event → store. Render path is independent of mastery.
- **Error propagation:** Effect registration failures dev-warn but never throw at render time — broken effect must never crash a learner's screen. `playCelebration()` validation failures dev-warn and drop the celebration rather than corrupt the queue.
- **State lifecycle risks:** Celebration ack storage (`localStorage` key `ks2-platform-v2.monster-celebration-acks`) shape is unchanged; existing acks remain valid across the migration.
- **API surface parity:** Public exports of `src/platform/game/monster-system.js` are preserved through the shim. No subject hook needs to change in this plan; future cleanup can update import paths.
- **Integration coverage:** `tests/app-controller.test.js` covers the celebration dismissal flow; that test must continue passing after U6.
- **Unchanged invariants:** Worker-side reward event shapes (`type: 'reward.monster'`, `kind` in `OVERLAY_KINDS`, payload fields) are unchanged. `worker/src/projections/monster-replays.js` is untouched. `monsters.js` data registry is untouched. CSS variable names emitted by `egg-breathe` and `monster-motion-float` effects match today's `--egg-breathe-*` and `--monster-float-*` exactly so existing surface stylesheets keep consuming them.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Visual regression — port of `eggBreatheStyle` / `monsterMotionStyle` introduces subtle CSS-variable drift | Fixture-based byte-equality tests in U4; manual smoke comparing home + codex pre/post |
| Celebration migration breaks existing pending events in the store | U3 + U6 read the same store slice and same event shape; no migration needed; `tests/app-controller.test.js` guards the seam |
| `monster-system.js` shim drifts out of sync with new `mastery/` exports, breaking subject hooks | U7's primary verification is the unmodified `tests/monster-system.test.js`; if the shim is incomplete the test fails at import time |
| Reduced-motion handling becomes inconsistent between effect modules | Centralise the policy in `composition.js`; each effect just declares its `reducedMotion` field; the renderer never branches on it |
| Effect catalog grows organically and stacking rules drift | Single source of truth for stacking is `composition.js`; effects only declare their `layer`, `zIndex`, and `exclusiveGroup`. Adding a new compositional rule means changing one file |

---

## Documentation / Operational Notes

- After the plan lands, update `docs/architecture.md` (or equivalent) to describe `src/platform/game/render/` and `src/platform/game/mastery/`.
- No rollout flag needed. Migration is internal — users see byte-identical motion + identical celebration overlays after U6.
- No monitoring impact; visual library has no telemetry.

---

## Sources & References

- Brainstorm conversation (this session): catalog scope, trigger-agnostic decision, layered-component approach (B), effect contract draft v0.
- Related code:
  - `src/platform/game/monsters.js`, `src/platform/game/monster-system.js`, `src/platform/game/monster-celebrations.js`, `src/platform/game/monster-celebration-acks.js`
  - `src/surfaces/home/data.js`, `src/surfaces/home/CodexCreature.jsx`, `src/surfaces/home/CodexCreatureLightbox.jsx`, `src/surfaces/home/MonsterMeadow.jsx`
  - `src/platform/app/create-app-controller.js`
  - `tests/monster-system.test.js`, `tests/app-controller.test.js`, `tests/codex-view-model.test.js`
- No external research sources.
