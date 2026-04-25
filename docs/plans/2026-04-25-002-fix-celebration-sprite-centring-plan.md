---
title: "fix: Re-centre celebration sprite during evolve / caught / mega animations"
type: fix
status: active
date: 2026-04-25
---

# fix: Re-centre celebration sprite during evolve / caught / mega animations

## Overview

When a monster evolves (stage 1 → 2, 2 → 3, 3 → 4), hatches (stage 0 → 1), is caught, or reaches mega form, the sprite / egg art renders off-axis inside the circular halo — the halo stays centred but the monster drifts outside the light burst. PR #119 (`46d32c8` — "feat: add monster visual config centre") restructured the celebration DOM from a flat `<img class="monster-celebration-art">` centred by its own transform into a nested wrapper (`.monster-celebration-visual > .monster-celebration-art`) where the wrapper carries the `monster-visual-config` transform and the inner `<img>` sits at `inset: 0`. Hotfix #141 (`3c0946b`) correctly wired `CelebrationShell` to emit the wrapper structure, and `f337334` unrelatedly corrected `MonsterRender`'s `useMemo` deps. Commit `6f7acd6` on main — headed "correct celebration sprite alignment" — only added a planning doc; no code was changed, so the bug is still present on main.

The real offender is in `styles/app.css`: six `@keyframes` blocks on `.monster-celebration-art.before / .after` (plus their `.egg-crack` and `.mega` variants) still animate `transform: translate(-50%, -50%) scale(...)` — a centring translate that was correct only when the `<img>` was positioned at `top: 50%; left: 50%` (the pre-PR-119 DOM). Now the `<img>` is `inset: 0` inside the 180–540 px wrapper, so `translate(-50%, -50%)` shifts the image half its own width and height out of the wrapper on every animation frame, stomping on the per-monster `offsetX / offsetY / scale / anchor` values that the wrapper already applies correctly.

Fix: rewrite those six keyframes to drop `translate(-50%, -50%)` (the inner `<img>` is already aligned to the wrapper via `inset: 0`) and animate only the delta — `scale`, the small Y-offset on entrances, and the rotation / stretch used by the egg-crack and mega variants. The wrapper's var-driven transform stays untouched, so per-monster offset / anchor / scale from `monster-visual-config` finally survive every frame. No JSX change, no admin-preview risk, no contract change.

---

## Problem Frame

`MonsterCelebrationOverlay.jsx` (the shell component) and `celebration-shell.js` (the transient-effect factory behind evolve / caught / mega) both emit:

```
<span class="monster-celebration-visual {before|after}"
      data-stage="{0..4}"
      style="{--visual-offset-x, --visual-offset-y, --visual-scale,
              --visual-anchor-x, --visual-anchor-y, --visual-face,
              --visual-tilt, --visual-bob, --visual-shadow-*, --mc-*}">
  <span class="monster-celebration-shadow" />
  <img class="monster-celebration-art {before|after}" src=... />
</span>
```

CSS expects:

- `.monster-celebration-visual` — absolutely positioned at the stage centre (`top:50%; left:50%`), sized per `[data-stage]` (180 → 540 px), carries the var-driven transform `translate(calc(-50% + var(--visual-offset-x)), calc(-50% + var(--visual-offset-y) - var(--visual-bob))) rotate(...) scaleX(--visual-face) scale(--visual-scale)` and `transform-origin: var(--visual-anchor-x) var(--visual-anchor-y)`.
- `.monster-celebration-art` — `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain` inside the wrapper. Only the per-frame animation `transform` (scale + small Y offset) should run here.

The six keyframes that still contain `translate(-50%, -50%)` were carried over from the pre-PR-119 design when the `<img>` itself was at `top: 50%; left: 50%`. In the new design, `translate(-50%, -50%)` is measured against the `<img>`'s own `100% × 100%` box inside the wrapper — so instead of no-op centring, it shifts the image half a wrapper-width left and half a wrapper-height up. Result: sprite visually floats to the upper-left of the halo regardless of the wrapper's perfectly-computed centre. Because the wrapper `transform` is still in place, any per-monster `offsetX` / `offsetY` arithmetic is also invisibly displaced by the same amount.

The learner-facing symptom: during every celebration other than reduced-motion mode, the monster / egg drifts off-axis; the halo, white flash, and particle emitters look correct because their CSS elements are still explicitly `top: 50%; left: 50%` (they were not restructured). The drift is most obvious on stage-1 → stage-2 evolutions because the wrapper is 300 × 300 px — a ~150 px shift is immediate.

This plan fixes only the keyframe transform stack. The wrapper transform contract, JSX, config resolver, and `monsterVisualCelebrationStyle()` emitter are all correct as of hotfix #141 and stay untouched.

---

## Requirements Trace

- R1. Across every celebration kind (caught, evolve default, evolve egg-crack, evolve mega), the sprite must remain visually centred within the halo in non-reduced-motion playback, with per-monster `offsetX / offsetY / scale` from `monster-visual-config` (context `celebrationOverlay`) still applied via the wrapper.
- R2. Stage transitions on already-caught monsters (1 → 2, 2 → 3, 3 → 4) must show both before and after stages centred at each keyframe phase (anticipation hold, crossfade, landing).
- R3. Egg hatch (stage 0 → 1) must preserve the wobble and pop choreography visually, only without the `-50%, -50%` shift — the wobble rotation and small Y offset must still read as "shaking" and "popping up", not as "centred but still".
- R4. Mega celebrations (stage 3 → 4) must preserve the breathing hold, the shake on the stage, and the final-form landing, with the same centring correctness.
- R5. Reduced-motion mode (`prefers-reduced-motion: reduce`) must continue to hide `.before` / halo / shine / white / particles and show `.after` at the static wrapper-driven position — unchanged from today's behaviour.
- R6. Admin preview (`src/surfaces/hubs/MonsterVisualPreviewGrid.jsx`) and all other surfaces that consume `monster-visual-config` — meadow, codex card, codex feature, lightbox, toast portrait — must render identically before and after the fix (they do not share these keyframes; verification-only).
- R7. Existing celebration DOM tests (`tests/render-effect-evolve.test.js`, `tests/render-effect-caught.test.js`, `tests/render-effect-mega.test.js`, `tests/render-celebration-layer.test.js`, `tests/react-shared-surfaces.test.js`, `tests/monster-visual-renderers.test.js`) must keep passing with no assertion churn.
- R8. A new regression assertion must pin the keyframe contract so the specific class of collision ("inner animation transform assumes self-centring") cannot silently reappear.

---

## Scope Boundaries

- Do not restructure `CelebrationShell` or `MonsterCelebrationOverlay` JSX — hotfix #141's wrapper structure is correct.
- Do not change `monster-visual-config.js`, `monster-visual-style.js`, or the `useMonsterVisualConfig` context. Emitted CSS vars and resolver output are untouched.
- Do not change the wrapper keyframes (`.monster-celebration-halo`, `.monster-celebration-white`, `.monster-celebration-shine`, `.monster-celebration-parts`, stage shake). Those elements are still `top:50%; left:50%` and their `translate(-50%, -50%)` is correct for them.
- Do not introduce a new CSS variable namespace; the fix operates purely within the existing `monster-celebration-*` selectors.
- Do not retune animation curves, durations, or timing percentages — only the transform stack on the six `.monster-celebration-art` keyframes changes.
- Do not close the secondary latent `transform-origin` anchor-propagation gap. In-scope: preserve the two existing rule-level `transform-origin: 50% 80%` declarations on `.egg-crack .monster-celebration-art.before` (app.css:1554) and `.egg-crack .monster-celebration-art.after` (app.css:1583) — these are load-bearing for the wobble and pop choreography. Out-of-scope: propagate `var(--visual-anchor-x) var(--visual-anchor-y)` onto `.monster-celebration-art` for the non-egg-crack variants. All current `celebrationOverlay` configs use the default `anchorX=0.5 / anchorY=1`, so today's art renders identically; the propagation only becomes visible once the admin centre publishes a non-default anchor.

### Deferred to Follow-Up Work

- Propagate `transform-origin: var(--visual-anchor-x) var(--visual-anchor-y)` onto `.monster-celebration-art` so non-centre anchors pivot animations the same way the wrapper does: deferred until the admin config centre actually publishes a non-default `celebrationOverlay` anchor — at that point the mismatch would become visible; today every asset uses the default centre anchor, so the fix here is complete on its own.
- Visual regression snapshots for the six keyframe variants: deferred until a screenshot or playwright harness is adopted for this codebase. The plan's computed-style assertion (Unit U3) is a cheaper pin that catches the specific regression class without a snapshot pipeline.

---

## Context & Research

### Relevant Code and Patterns

- `styles/app.css:1210–1297` — wrapper + art base rules, per-stage sizing. This block is correct as of PR #119 and must not change shape.
- `styles/app.css:1303–1332` — `.monster-celebration-art.before` / `.after` + the two keyframes `monster-celebration-before`, `monster-celebration-after` (shared across evolve default and caught `.after`).
- `styles/app.css:1553–1601` — `.monster-celebration-overlay.egg-crack .monster-celebration-art.before` / `.after` + keyframes `monster-celebration-egg-wobble`, `monster-celebration-monster-pop`.
- `styles/app.css:1670–1701` — `.monster-celebration-overlay.mega .monster-celebration-art.before` / `.after` + keyframes `monster-celebration-mega-before`, `monster-celebration-mega-after`.
- `styles/app.css:1821–1848` — reduced-motion block (must remain unchanged).
- `src/platform/game/render/effects/celebration-shell.js` — reference for JSX wrapper structure (no edit).
- `src/surfaces/shell/MonsterCelebrationOverlay.jsx` — second emitter of the same wrapper markup (no edit).
- `src/platform/game/monster-visual-style.js` — `monsterVisualCelebrationStyle()` — documents the full CSS-variable contract the wrapper consumes (no edit).
- `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` — admin preview uses a completely separate DOM + CSS (`.monster-visual-frame`, `.monster-visual-preview-img`) and its own inline transform in `previewStyle()`; parity with learner overlays is not affected by this fix.
- `tests/helpers/react-render.js:253–265` — fixture that seeds `celebrationOverlay` offsets / anchors / shadows for `tests/monster-visual-renderers.test.js`. Reusable for the new keyframe assertion.

### Institutional Learnings

- Commit `3c0946b` (hotfix #141) codified: celebration shell must resolve through `useMonsterVisualConfig` + `resolveMonsterVisual({context: 'celebrationOverlay'})` for both before and after stages, and wrap the `<img>` in `.monster-celebration-visual` with `monsterVisualCelebrationStyle(visual)`. This plan preserves that contract.
- `monster-visual-config` CSS variables (`--visual-offset-x/y`, `--visual-scale`, `--visual-face`, `--visual-anchor-x/y`, `--visual-bob`, `--visual-tilt`, `--visual-shadow-*`) are a shared cross-surface contract used by meadow (`.meadow-monster`), codex creature (`.codex-creature-visual`), and the spelling egg. Any fix must not invent celebration-specific aliases.
- Runtime fallback in `monster-visual-config.js` is silent — a misconfigured `celebrationOverlay` entry does not throw. Therefore regression tests must pin the actual resolved visual / computed style rather than rely on console or runtime errors.
- No `docs/solutions/` entry exists for this bug class (inner-animation-transform vs var-driven wrapper). Recommend capturing it via `/ce-compound` after landing; note it as a reusable learning for any pattern with nested var-driven wrapper + absolute-positioned animated child.

### External References

No external research was run. This is a closed-loop CSS fix inside the repo's own styling system, with adjacent patterns (meadow, codex, admin preview) providing sufficient local grounding.

---

## Key Technical Decisions

- **Fix CSS only, keep JSX untouched.** The hotfix #141 wrapper structure is the contract. Reverting to a flat `<img>` layout would conflict with the meadow / codex / toast surfaces that depend on the same wrapper+config pattern and would undo the cross-surface parity the visual config centre was designed around.
- **Drop `translate(-50%, -50%)` from the six animation keyframes.** The inner `<img>` is `inset: 0` so it is already exactly aligned with the wrapper's interior. Any centring is the wrapper's responsibility.
- **Preserve entrance Y offsets and egg-wobble / pop deltas.** The pre-animation drop-from-above on `.before` (`translate(-50%, calc(-50% + 24px))` becomes just `translateY(24px)`) is intentional choreography — keep the vertical deltas relative to the img's natural position.
- **Rotation in egg-wobble must stay scoped to the img.** The wrapper's transform already applies monster-level tilt via `--visual-tilt`; the keyframe's ±3° wobble is an additional per-phase rotation. Expressed as `rotate(...)` alone (without the centring translate), it composes cleanly on top of the wrapper transform.
- **Non-uniform scale on egg-crack pop is intentional and unchanged in shape.** `scale(0.7, 0.55)` / `scale(0.95, 1.18)` / `scale(1.14, 0.90)` stay, only the leading translate is dropped.
- **Keep the mega stage shake unchanged.** `monster-celebration-mega-shake` animates `.monster-celebration-stage` (the outer container), not the art. Nothing to change there.
- **Computed-style regression test, not a visual snapshot.** The specific bug class — an animation rule that stomps on a wrapper-level transform — is catchable by asserting the emitted keyframe transform does not start with `translate(-50%` on `.monster-celebration-art`. This is far cheaper than a screenshot harness and pins exactly the shape of the regression.

---

## Open Questions

### Resolved During Planning

- **Structural vs CSS-only fix?** — CSS-only (user confirmed). Matches the cross-surface wrapper contract; minimal diff.
- **Should we also propagate `transform-origin` onto `.monster-celebration-art` for anchor correctness?** — Deferred (see Scope Boundaries). All current `celebrationOverlay` configs use the default centre anchor, so this fix is complete alone. The propagation is a one-liner when the admin centre eventually publishes a non-default anchor and the mismatch becomes visible.
- **Does the recent `6f7acd6` commit actually fix anything?** — No. It only added `docs/plans/james/punctuation/punctuation-p2.md`; `styles/app.css` and every render file in that commit are unchanged. Title is misleading; no revert needed, but worth noting in the PR description.

### Deferred to Implementation

- Exact per-keyframe transform text after dropping `translate(-50%, -50%)`. The Approach section below specifies the transforms but the implementer should eyeball each of the six keyframes against the running app to confirm the choreography reads identically. The test in U3 pins only the "no `translate(-50%`" invariant, not animation aesthetics — aesthetic parity is a manual QA check.
- Whether to consolidate the duplicate `CelebrationVisual` helper between `src/platform/game/render/effects/celebration-shell.js` and `src/surfaces/shell/MonsterCelebrationOverlay.jsx`. Out of scope for this fix.

---

## High-Level Technical Design

> *This illustrates the intended transform stack and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

The key invariant to preserve:

```
┌ .monster-celebration-stage (grid, place-items:center) ─────────────┐
│                                                                    │
│   ┌ .monster-celebration-visual (absolute, top/left:50%) ──────┐   │
│   │   transform = translate(calc(-50% + offsetX),               │   │
│   │                         calc(-50% + offsetY - bob))         │   │
│   │               rotate(tilt) scaleX(face) scale(scale)        │   │
│   │   transform-origin = anchorX anchorY                        │   │
│   │                                                             │   │
│   │   ┌ .monster-celebration-shadow (absolute, bottom:7%) ──┐   │   │
│   │   └──────────────────────────────────────────────────┘   │   │
│   │   ┌ .monster-celebration-art (absolute, inset:0) ─────┐   │   │
│   │   │   transform = <animated>                          │   │   │
│   │   │     CURRENT (wrong): translate(-50%,-50%) scale   │   │   │
│   │   │     FIXED:           scale (+ optional translateY │   │   │
│   │   │                       or rotate for choreography) │   │   │
│   │   └──────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

Rule the fix obeys: only the **wrapper** applies positioning (translate + anchor); only the **art** applies the per-phase animation delta (scale and, where the choreography needs it, a small `translateY` or `rotate`). The two transforms compose instead of colliding.

---

## Implementation Units

- U1. **Rewrite the six `.monster-celebration-art` keyframe transforms to drop self-centring translate**

**Goal:** Remove `translate(-50%, -50%)` from every frame of `monster-celebration-before`, `monster-celebration-after`, `monster-celebration-egg-wobble`, `monster-celebration-monster-pop`, `monster-celebration-mega-before`, `monster-celebration-mega-after`, so the inner `<img>` no longer stomps on the wrapper transform that carries `monster-visual-config` offset / scale / anchor.

**Requirements:** R1, R2, R3, R4.

**Dependencies:** None.

**Files:**
- Modify: `styles/app.css` (keyframe blocks at lines 1308–1318, 1326–1332, 1558–1576, 1587–1601, 1674–1685, 1695–1701)

**Approach:**
- `monster-celebration-before`: replace `translate(-50%, calc(-50% + 24px)) scale(0.9)` at 0% with `translateY(24px) scale(0.9)`; every subsequent `translate(-50%, -50%) scale(X)` becomes just `scale(X)`. Entry still drops in from 24 px above the wrapper centre, subsequent breathing pulses read identically.
- `monster-celebration-after`: every `translate(-50%, -50%) scale(X)` becomes `scale(X)`. No entry offset (the element fades in from a small scale).
- `monster-celebration-egg-wobble` (egg-crack before): replace `translate(-50%, calc(-50% + 18px)) rotate(0deg) scale(0.9)` at 0% with `translateY(18px) rotate(0deg) scale(0.9)`; every mid-phase `translate(-50%, -50%) rotate(Xdeg) scale(...)` becomes `rotate(Xdeg) scale(...)`. The rule-level `transform-origin: 50% 80%` on `.egg-crack .monster-celebration-art.before` (app.css:1554) is preserved — wobble still pivots from the egg base.
- `monster-celebration-monster-pop` (egg-crack after): `translate(-50%, calc(-50% + 30px)) scale(0.3, 0.3)` at 0% → `translateY(30px) scale(0.3, 0.3)`; `translate(-50%, calc(-50% + 10px)) scale(0.7, 0.55)` → `translateY(10px) scale(0.7, 0.55)`; `translate(-50%, calc(-50% - 12px)) scale(0.95, 1.18)` → `translateY(-12px) scale(0.95, 1.18)`; every `translate(-50%, -50%) scale(A, B)` becomes `scale(A, B)`. The rule-level `transform-origin: 50% 80%` on `.egg-crack .monster-celebration-art.after` (app.css:1583) is preserved so the squash-and-stretch pivots on the foot.
- `monster-celebration-mega-before`: `translate(-50%, calc(-50% + 32px)) scale(0.86)` → `translateY(32px) scale(0.86)`; every other `translate(-50%, -50%) scale(X)` → `scale(X)`.
- `monster-celebration-mega-after`: every `translate(-50%, -50%) scale(X)` → `scale(X)`.

All transforms remain GPU-compositable (no layout-affecting properties), so the reduced-motion exemption continues to behave.

**Patterns to follow:**
- `.monster-celebration-halo` / `.monster-celebration-white` / `.monster-celebration-shine` keyframes — these correctly keep `translate(-50%, -50%)` because their base rules place them at `top:50%; left:50%` (not `inset: 0`). Do not touch them.
- `.monster-celebration-overlay.mega .monster-celebration-stage` shake keyframe — animates the outer stage container, separate concern; do not touch.

**Test scenarios:**
- *Happy path*: load the running app, trigger an evolve stage 1 → 2, visually confirm the monster sprite sits centred inside the halo throughout anticipation-hold, crossfade, and landing phases (**Covers R1, R2**).
- *Happy path*: trigger an egg hatch (stage 0 → 1), confirm the egg wobbles in place (no upper-left drift) and the monster pops up from the bottom of the wrapper centred (**Covers R3**).
- *Happy path*: trigger a mega evolution (stage 3 → 4), confirm the before-form hold breathes centred, the stage shake continues to read, and the final form lands centred with the gold wash (**Covers R4**).
- *Happy path*: trigger a caught celebration, confirm the sprite enters from below, lands centred, particles burst outward from the same centre (**Covers R1**).
- *Integration*: in `tests/monster-visual-renderers.test.js`, the existing fixture that sets `celebrationOverlay.offsetX = 18` on `inklet-b1-2` should continue to pass — the wrapper still carries `--visual-offset-x: 18.00px` and the art no longer stomps it. No assertion change.

**Verification:**
- In the browser, the sprite is visibly centred in the halo during every phase of caught / evolve (default) / evolve (egg-crack) / mega celebrations at stages 0 → 1, 1 → 2, 2 → 3, 3 → 4.
- No visual regression in reduced-motion mode (still hides `.before` / halo / flash, shows `.after` statically centred).
- `npm test -- tests/render-effect-evolve.test.js tests/render-effect-caught.test.js tests/render-effect-mega.test.js tests/render-celebration-layer.test.js tests/react-shared-surfaces.test.js tests/monster-visual-renderers.test.js` all pass without edits.

---

- U2. **Pin the keyframe contract with a CSS parser-level regression test**

**Goal:** Prevent the specific regression class — "an animation rule on `.monster-celebration-art` re-applies `translate(-50%, …)` as if self-centring" — from silently creeping back.

**Requirements:** R7, R8.

**Dependencies:** U1.

**Files:**
- Create: `tests/celebration-keyframe-contract.test.js`

**Approach:**
- Read `styles/app.css` from disk at test time with Node's `fs.readFileSync`. This is the first CSS-file read in the test suite — no existing pattern to follow; keep the helper small and inline inside the test file (no shared helper under `tests/helpers/`).
- Extract each of the six keyframe blocks by name: `monster-celebration-before`, `monster-celebration-after`, `monster-celebration-egg-wobble`, `monster-celebration-monster-pop`, `monster-celebration-mega-before`, `monster-celebration-mega-after`.
- Assert every `transform:` value inside those blocks does **not** contain the literal substring `translate(-50%`.
- As a positive assertion, verify the wrapper rule `.monster-celebration-visual { ... transform: ... translate(calc(-50% + var(--visual-offset-x` is still present, so the fix does not accidentally delete the wrapper centring contract.
- As a sanity assertion, verify the self-centring halo / white / burst keyframes (`monster-celebration-halo-anim`, `monster-celebration-white-anim`, `monster-celebration-egg-halo`, `monster-celebration-egg-white`, `monster-celebration-mega-halo`, `monster-celebration-mega-white`) still each contain `translate(-50%, -50%)` — these elements are positioned at `top:50%;left:50%` and their self-centring contract is deliberately opposite to the art's. `monster-celebration-mega-shine` is intentionally excluded from this list because it animates only `translateX(...)` (no self-centring translate); do not add it to the positive-assertion set.

**Patterns to follow:**
- `tests/react-shared-surfaces.test.js` for fs-based repo-file reads in tests.
- `tests/monster-visual-renderers.test.js` for fixture-driven single-file asserts.

**Test scenarios:**
- *Happy path*: all six art keyframes are parsed and none of their transforms contain `translate(-50%`.
- *Happy path*: `.monster-celebration-visual` rule still contains the var-driven translate contract.
- *Happy path*: halo / white / shine / mega-shine keyframes still contain `translate(-50%, -50%)` — prevents an over-eager future refactor from breaking the self-centred peripheral elements.
- *Edge case*: enumerate the six keyframes explicitly in the test and add a clear TODO comment noting that the enumeration is load-bearing — if a new `.monster-celebration-art` keyframe is ever added (e.g. a stage-4-only variant), that keyframe's name must be appended here. A dynamic scan across `@keyframes monster-celebration-*` is avoided intentionally: the six names are known today, a seventh does not exist, and an auto-discovery regex would be speculative complexity.

**Verification:**
- `npm test -- tests/celebration-keyframe-contract.test.js` passes.
- Deliberately re-introducing `translate(-50%, -50%)` into `monster-celebration-after` makes the test fail with a readable assertion message.

---

- U3. **Document the fix and the diagnostic trail**

**Goal:** Record why the bug was not closed by hotfix #141 or commit `6f7acd6` so future visual regressions in this area start from the correct mental model, and so `ce-compound` has a clean source to draft a learning from.

**Requirements:** supports R1–R8 by compounding institutional knowledge.

**Dependencies:** U1, U2.

**Files:**
- Modify: `docs/monster-visual-config.md` — append a short "Celebration overlay nested-wrapper contract" subsection noting: wrapper carries var-driven transform, art is `inset: 0`, art keyframes must animate only scale and choreography deltas (never a self-centring translate).

(The PR description for this change should additionally note that `6f7acd6`'s title was aspirational — it only added a planning doc, not a code fix — so no revert is needed. That note is PR-scoped, not a versioned repo artefact, so it is not listed as an implementation file above.)

**Approach:**
- Keep the doc addition compact (≤15 lines). Link back to this plan.
- Do not create a new file; the existing `docs/monster-visual-config.md` is the right home.

**Patterns to follow:**
- Existing style of `docs/monster-visual-config.md`: short, example-led, with exact selector names.

**Test expectation:** none — documentation-only unit.

**Verification:**
- `docs/monster-visual-config.md` renders cleanly in a Markdown preview.
- The PR description references both hotfix #141 and commit `6f7acd6` so reviewers can trace the full history.

---

## System-Wide Impact

- **Interaction graph:** `CelebrationLayer → lookupEffect(kind) → effect.render → CelebrationShell → CelebrationVisual` path produces the same DOM as `MonsterCelebrationOverlay`. Both emit `.monster-celebration-visual > .monster-celebration-art`. Both are affected by the CSS fix; neither needs JSX changes.
- **Error propagation:** If `resolveMonsterVisual({context:'celebrationOverlay'})` returns `null`, `CelebrationVisual` early-returns and no `<img>` renders. The fix does not change this path; null-visual behaviour is unchanged.
- **State lifecycle risks:** None — CSS keyframe changes have no state footprint. Animation duration / delay / reduced-motion gates are unchanged.
- **API surface parity:** Wrapper CSS variable contract (`--visual-offset-*`, `--visual-scale`, `--visual-anchor-*`, `--visual-face`, `--visual-tilt`, `--visual-bob`, `--visual-shadow-*`, `--mc-duration`, `--mc-art-delay`) is unchanged. Admin preview, meadow, codex card / feature, lightbox, toast portrait — all consume the same vars via separate CSS rules and separate DOM structures; none depend on `.monster-celebration-art` keyframes.
- **Integration coverage:** The integration gap — no test today asserts that the animated img's transform does not collide with the wrapper — is closed by U2. The existing `monster-visual-renderers.test.js` check that a `celebrationOverlay.offsetX` override survives on the wrapper continues to pass with the fix.
- **Unchanged invariants:**
  - `CelebrationShell` / `MonsterCelebrationOverlay` JSX output — unchanged.
  - `monsterVisualCelebrationStyle()` emitted CSS-variable set — unchanged.
  - `resolveMonsterVisual()` output shape and bundled-fallback behaviour — unchanged.
  - Reduced-motion selector `@media (prefers-reduced-motion: reduce)` block — unchanged.
  - Halo / white / shine / particle keyframes — unchanged.
  - Admin preview (`MonsterVisualPreviewGrid`) — unchanged (separate DOM + CSS).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Dropping `translate(-50%, -50%)` changes the apparent choreography of one of the six keyframes in a way that is subjectively worse (e.g. the egg pop no longer reads as "pop up"). | Manual QA for each of caught / evolve-default (1 → 2, 2 → 3, 3 → 4) / evolve-egg-crack (0 → 1) / mega (3 → 4), in both desktop and mobile breakpoints. If any variant reads wrong, the Y offsets in U1's approach can be tuned without reintroducing the self-centring translate — the contract in U2 prevents only the specific collision pattern. |
| A future CSS refactor introduces a seventh `.monster-celebration-art` keyframe and forgets to add it to the U2 test's enumeration. | U2 uses a scan of `@keyframes monster-celebration-*` that are referenced by `.monster-celebration-art` selectors, not a hand-enumerated list. If a scan-miss is judged acceptable for simplicity, the test file carries an explicit TODO. |
| The wrapper `transform-origin` uses `anchorY=1` (foot-anchored) which means celebration scale now pivots on the wrapper's bottom edge. Previously the wrong `translate(-50%, -50%)` translated the scale off-centre enough that the foot pivot was obscured. Once the art is correctly centred, if any monster has a hand-tuned `anchorY` other than `1` for `celebrationOverlay`, the scale will visibly pivot from there. | All current `celebrationOverlay` entries use the default `anchorY=1`, confirmed in `monster-visual-config.js:DEFAULT_CONTEXT_VALUES` and the bundled seed. A non-default anchor would be published by the admin visual-config centre only after U1 / U2 ship, and the deferred follow-up (propagate `transform-origin` onto `.monster-celebration-art`) closes that gap when it becomes relevant. |
| `6f7acd6` on main claims to fix this and is the most recent commit — a reviewer might assume the bug is already closed. | U3 captures this explicitly in the PR description and in `docs/monster-visual-config.md`. |

---

## Documentation / Operational Notes

- No deploy / rollout / migration concerns. CSS-only change; invalidates CSS cache on next deploy automatically.
- No feature flag. The bug is user-visible enough that a staged rollout would delay correct behaviour without benefit.
- Monitoring: none required. Reduced-motion users are unaffected. If Sentry or browser error logs were set up around celebration render, none should newly trigger.
- After landing, recommend running `/ce-compound` against this plan + the resulting diff to capture the "inner animation transform stomping on var-driven wrapper transform" pattern as a `docs/solutions/` learning.

---

## Sources & References

- Related PRs/commits: `46d32c8` (PR #119 — introduced wrapper restructure and the keyframe mismatch), `3c0946b` (PR #141 — correctly rewired `CelebrationShell` JSX but left the keyframes alone), `f337334` (ultrareview findings in PR #119 — fixed `MonsterRender` useMemo deps, unrelated to this bug), `6f7acd6` (planning-doc-only, misleading commit title).
- Related code:
  - `styles/app.css:1210–1848` (celebration overlay block)
  - `src/platform/game/render/effects/celebration-shell.js`
  - `src/surfaces/shell/MonsterCelebrationOverlay.jsx`
  - `src/platform/game/monster-visual-config.js`
  - `src/platform/game/monster-visual-style.js`
  - `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` (admin preview — unaffected)
- Related tests:
  - `tests/render-effect-evolve.test.js`
  - `tests/render-effect-caught.test.js`
  - `tests/render-effect-mega.test.js`
  - `tests/render-celebration-layer.test.js`
  - `tests/react-shared-surfaces.test.js`
  - `tests/monster-visual-renderers.test.js`
  - `tests/helpers/react-render.js`
- Related docs:
  - `docs/monster-visual-config.md`
  - `docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md` (parent plan establishing the wrapper contract)
