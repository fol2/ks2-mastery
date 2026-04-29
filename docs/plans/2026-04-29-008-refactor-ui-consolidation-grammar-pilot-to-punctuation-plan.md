---
title: "refactor: Consolidate Grammar-pilot UI primitives and extend to Punctuation"
type: refactor
status: active
date: 2026-04-29
deepened: 2026-04-29
---

# refactor: Consolidate Grammar-pilot UI primitives and extend to Punctuation

## Overview

Grammar's recently-landed setup alignment (PR #591, commit `a7ac090`) pioneered a
shared hero/setup engine (`HeroBackdrop`, `useSetupHeroContrast`, `hero-bg.js`,
`SetupMorePractice`, `.setup-grid` / `.setup-main` / `.setup-content` rhythm).
The pilot proved the extraction API shape but left three consolidation gaps:

1. The **slide-button length picker** still lives in two near-identical copies
   (`SpellingSetupScene.LengthPicker`, `GrammarSetupScene.RoundLengthPicker`);
   Punctuation has a third bespoke variant (`RoundLengthToggle`).
2. The **hero welcome-line copy** (`"Hi {name} — ready for a short round?"`) is
   duplicated inline in Grammar and Punctuation.
3. The **setup side panel shell** (`.ss-card` / `.ss-head` / `.ss-bank-link` /
   `.ss-codex-link`) is Spelling-origin and only reused by Grammar through
   brand-suffixed overrides; Punctuation lacks the shell entirely.

This plan canonicalises Grammar's pilot API into `src/platform/ui/`, has Spelling
adopt the platform primitives (so its original inline copies stop forking), and
then extends the consolidated engine into every Punctuation phase (Setup,
Session, Summary, Map). The target is parity with Grammar's setup rhythm and
visual engine without disturbing Punctuation's existing mission-dashboard content
model (progress row, monster meters, secondary drawer).

---

## Problem Frame

The Spelling subject matured first and its setup/session/summary patterns
evolved organically. Grammar was selected as the **pilot subject** for a
platform-level extraction so the refinements (prop-driven API shapes, attribute-
based luminance probe, optional class hooks on `HeroBackdrop`) could stabilise
against a real adopter before third-subject rollout. With Grammar now shipping
on `HeroBackdrop` / `useSetupHeroContrast` / `.setup-grid`, three follow-ups
are overdue:

- **Drift risk**: Spelling's inline `LengthPicker` / `YearPicker` and Grammar's
  inline `RoundLengthPicker` have identical DOM + class rhythm. A minor CSS or
  animation tweak landed in one will silently skip the other.
- **Copy drift risk**: Grammar and Punctuation both render the same welcome
  string; if the phrase changes (e.g. for internationalisation or tone), we
  currently need to remember two files.
- **Visual inconsistency**: Punctuation still paints hero artwork via a static
  `<img srcSet>` inside `.punctuation-strip` / `.punctuation-dashboard-hero`.
  Setup scenes across subjects now feel substantially different (cross-fade +
  slow pan in Grammar/Spelling, static image in Punctuation).

A reader opening the three subjects back-to-back sees the same visual grammar
on Spelling and Grammar and then an abruptly different surface on Punctuation.
Consolidating the pilot API and having Punctuation adopt it closes that gap
without changing Punctuation's dashboard information architecture (the mission
CTA ladder, progress strip, monster star meters, and secondary drawer all stay).

---

## Requirements Trace

- R1. Extract a single `LengthPicker` component to `src/platform/ui/` whose
  prop shape extends Grammar's pilot (`options`, `selectedValue`, `onChange`,
  `disabled`, `ariaLabel`, `unit`) AND carries `actionName` + `prefKey` +
  optional `valueAttr` props so the rendered `.length-option` buttons keep
  their `data-action` / `data-pref` / `data-value` attributes for Playwright
  and Admin Debug Bundle locators. Spelling adopts it for both the round-
  length AND the year-filter picker. Grammar adopts it for round-length.
  Punctuation adopts it for round-length (the existing `RoundLengthToggle`
  uses `data-value` rather than `data-pref`, so Punctuation's call-site
  passes `valueAttr: true` to preserve that attribute and omits `prefKey`).
- R2. Extract `heroWelcomeLine(name)` and `HeroWelcome` helper to
  `src/platform/ui/hero-copy.js` and `src/platform/ui/HeroWelcome.jsx`. Grammar
  and Punctuation render through the helper; a missing / empty name collapses
  the line entirely (no orphan "Hi — ready for a short round?").
- R3. Extract a platform `SetupSidePanel` shell that carries `.ss-card`,
  `.ss-head` (with optional `codex-link` slot), optional monster/meadow slot,
  body slot, optional footer link slot. Spelling wraps it with its existing
  child composition. Grammar wraps it and keeps `.grammar-setup-sidebar-*`
  brand overrides. **Punctuation does NOT adopt `SetupSidePanel` in this
  pass**. Introducing a new right-rail sidebar in the Punctuation mission
  dashboard is an IA change (the dashboard is currently single-column,
  vertically-stacked — hero → progress strip → monster row → map link →
  secondary drawer) and falls outside this plan's "chrome-only, not IA"
  scope boundary. Punctuation's Setup scene is wrapped in `.setup-grid`
  with ONLY `.setup-main` (no `.setup-side`). The mission-dashboard content
  stays in its current stacked form inside `.setup-main`. Extracting
  `SetupSidePanel` delivers consolidation value for Spelling + Grammar
  (two real consumers whose sidebars already share the structure);
  Punctuation adopting the sidebar is deferred until a real IA rethink
  warrants it.
- R4. `PunctuationSetupScene` renders `HeroBackdrop` + `useSetupHeroContrast` +
  the consolidated `LengthPicker` inside a `.setup-grid` / `.setup-main` /
  `.setup-content` structure. **`.setup-grid` collapses to a single column
  for Punctuation because there is no `.setup-side`** (see R3). All
  existing mission-dashboard content (progress strip, monster row, map
  link, secondary drawer) stays inside `.setup-main` / `.setup-content` in
  the same stacked order it has today. Every existing `data-section`
  landmark (`hero`, `progress-row`, `monster-row`, `map-link`, `secondary`)
  is preserved for the U9 journey spec.
- R5. `PunctuationSessionScene` paints all **three** `.punctuation-strip`
  call-sites via `HeroBackdrop`, not the static `<img>` — (a) the `active-item`
  branch at line 374, (b) the minimal-feedback / GPS early-return feedback
  branch at line 546, (c) the scored-feedback branch at line 603. The
  bellstorm scene URL remains driven by `bellstormSceneForPhase(phase)` and
  the helper's return shape stays `{ name, src, srcSet }` so existing contract
  tests pass unchanged. The new wrapper exposes a stable class anchor
  (`.punctuation-hero-backdrop`) so Playwright locators can be re-pointed.
- R6. `PunctuationSummaryScene` paints its hero via `HeroBackdrop` using
  `bellstormSceneForPhase('summary')`. Keeps the full summary information
  architecture (correct-count line, score chip row, skills-exercised row,
  monster-progress teaser, next-review hint, monster strip, GPS review,
  next-action row).
- R7. `PunctuationMapScene` paints its hero via `HeroBackdrop` using
  `bellstormSceneForPhase('map')`. The existing chrome element is
  `.punctuation-hero` (NOT `.punctuation-strip` — the Map uses a different
  class name than the Session / Summary scenes — `PunctuationMapScene.jsx:372`).
  The Map's browse-content model (cluster groups, filters, detail tabs) is
  untouched.
- R8. Every Playwright visual baseline, journey spec, and node:test locator
  that currently anchors on `.punctuation-strip` / `.punctuation-dashboard-hero`
  / `.punctuation-hero` is either preserved as a legacy alias on the new
  wrapper OR updated to the new canonical class — whichever is lower-risk per
  call-site. Zero test gets deleted; every assertion finds an equivalent. In
  particular `tests/playwright/shared.mjs:60-74`'s
  `SCREENSHOT_DETERMINISM_CSS` rule (currently hides `.punctuation-strip img`)
  must be extended to hide the new `HeroBackdrop` layer (e.g.
  `.punctuation-hero-backdrop [data-hero-layer="true"]`) so background-image
  paints do not leak into deterministic screenshot diffs.
- R9. Bellstorm hero selection keeps `bellstormSceneForPhase()` phase → fixed
  index behaviour (no per-learner hash upgrade this pass). The function's
  return shape and contract tests do not change.
- R10. Bundle byte budget (`tests/bundle-byte-budget.test.js` —
  `BUDGET_GZIP_BYTES = 227,000`, measured real-bundle gzip ≈ 217,934 B, so
  **headroom is ~9 KB**) is re-measured. The 227,630 B upper guard
  (`BASELINE_GZIP_BYTES × 1.105`) is the real constraint: any PR that
  raises `BUDGET_GZIP_BYTES` above that value must re-commit
  `BASELINE_GZIP_BYTES` in the same PR. A silent budget bump is disallowed
  by the test's upper-guard rule. Expected behaviour: small net decrease in
  Spelling and Grammar once duplicated pickers and inline copy are
  deduplicated; small net increase in Punctuation for the platform imports.
  Net target: within the existing budget without a bump. Contingency: if
  the real gzip delta clears +1 KB (headroom begins to feel tight), U7
  includes a concrete size-reduction task (e.g. dropping legacy
  `.punctuation-dashboard-hero` CSS early instead of deferring it).
- R11. Reduced-motion guarantee from `HeroBackdrop` continues to apply —
  `prefers-reduced-motion: reduce` disables the pan animation (existing
  `styles/app.css` rule near line 5594). Punctuation inherits this for free.
  The consequence of adopting `HeroBackdrop` on Punctuation is that learners
  *without* reduced-motion will now see a slow horizontal pan on every
  Punctuation scene backdrop (Setup, Session phases, Summary, Map) — a
  default-case motion change where the existing static `<img>` had none.
  This is accepted as an intentional visual alignment with Spelling/Grammar.
- R11b. **KS2 a11y parity for the round-length picker.** The current
  `.punctuation-length-toggle` carries a deliberate `min-height: 44px;
  min-width: 44px` (styles/app.css:10423-10439) and a Bellstorm-gold
  (`#B8873F`) `:focus-visible` ring. The shared `.length-option` class does
  NOT pin these properties. U4 adds Punctuation-specific augmentations to
  the shared picker rules so Punctuation's adoption preserves the KS2
  mobile tap-target floor and the gold focus ring: a
  `.punctuation-mission-dashboard .length-option` / `.punctuation-surface
  .length-option` selector (scoped narrowly so Spelling/Grammar don't
  inherit Bellstorm colours). If the cleanest path is to keep the
  `.punctuation-length-toggle` class on the platform picker as an extra
  class hook (passed via `className` prop), that is acceptable — either
  approach is fine so long as tests pin both properties.
- R11c. **Responsive image regression acknowledged.** `HeroBackdrop` paints
  via CSS `background-image`, not an `<img srcSet>` element, so the
  `640w / 1280w` responsive sources from `bellstormSceneForPhase` are
  dropped on adoption. Mobile devices unconditionally download the 1280px
  asset. This is a known LCP / data regression on cellular networks and is
  accepted as the cost of visual-engine alignment. If mobile LCP becomes
  a flagged regression, a follow-up PR can expose an `<img>`-mode path on
  `HeroBackdrop` — deferred until evidence of real impact.
- R12. Admin Debug Bundle and telemetry emissions on each Punctuation scene
  are unchanged. The three `useRef`-gated emits (`summary-reached`,
  `feedback-rendered`, `monster-progress-changed`, plus Setup's
  `card-opened`) fire with the same payload shape.

---

## Scope Boundaries

- **Not extracting** `Ribbon`, `AnimatedPromptCard`, `SummaryCards`, `CountUpValue`
  from `SpellingCommon.jsx`. Only Spelling consumes them today; the three
  subjects' summary shapes differ enough that extracting now would be
  premature abstraction.
- **Not extracting** `ToggleChip` (Spelling-only consumer) or `SetupMeadow`
  (Spelling post-Mega-specific).
- **Not touching** the Punctuation dashboard information architecture
  (progress row, monster meters, CTA resolution ladder, secondary drawer
  content). This is a *chrome* refactor, not an IA refactor.
- **Not removing** the legacy `.spelling-hero-*` / `.grammar-*` brand classes
  on `SpellingHeroBackdrop` / Grammar scene wrappers. The comments in those
  files pin them to mid-session tinting + Playwright mask-coverage probes that
  we are not rewriting in this pass.
- **Not upgrading** Bellstorm to per-learner hashed region/tone selection.
  (`bellstormSceneForPhase()` stays phase → index.)
- **Not changing** the Punctuation Map's filter behaviour, cluster groups, or
  detail tabs. Only the hero chrome at the top changes.
- **Not adopting** `SetupMorePractice`. Punctuation has no disclosed secondary
  mode tail today; its secondary drawer (`Wobbly Spots` + `GPS Check`) is
  rendered inline in the existing dashboard. Keep the inline layout.
- **Not refactoring** Grammar or Spelling scenes beyond swapping their inline
  `LengthPicker` / `YearPicker` / welcome line / sidebar shell for the platform
  equivalents. Every other Grammar-pilot decision stands.

### Deferred to Follow-Up Work

- Removing the `.spelling-hero-backdrop` / `.spelling-hero-layer` legacy alias
  classes once mid-session tinting is rewritten to target `.hero-layer` via
  `data-hero-layer`: **separate PR**, likely after Punctuation adoption proves
  the selector-agnostic path.
- Extracting the session scene animated prompt card / ribbon / feedback slot:
  **later stage**, only once two subjects have converged on the same shape.
- Punctuation Map adopting the full `.setup-grid` / `.setup-side` pairing for
  its filter rail: **later stage**, only if the Map IA moves closer to the
  Setup IA.
- Per-learner Bellstorm tone hash upgrade: **later stage**, evaluated against
  visual-continuity tests once the platform engine is on every phase.
- **Cross-scene hero cross-fade** (feedback → summary, summary → setup):
  not implemented this pass. `previousUrl` handoff only works within a
  single scene component (`active-item ↔ feedback` stays inside
  `PunctuationSessionScene`, so a scene-local ref is sufficient). Lifting a
  `previousHeroBgRef` into `PunctuationPracticeSurface` (as Spelling does at
  `SpellingPracticeSurface.jsx:152-157`) is a follow-up PR once the in-scene
  cross-fade lands cleanly.
- **Punctuation `SetupSidePanel` adoption**: deferred. Introducing a new
  right-rail in the Punctuation mission dashboard is a dashboard IA change,
  not a chrome swap. If a future product decision moves Punctuation to a
  two-column layout (e.g. for a Parent Hub cross-sell or a Bellstorm map
  thumbnail), that PR can adopt `SetupSidePanel` — the platform shell
  already exists.
- **`<img>` render mode for `HeroBackdrop`** to preserve `srcSet` on
  adoption: deferred. Accepting the mobile LCP regression as the cost of
  engine alignment. If mobile LCP becomes a flagged regression, a follow-up
  PR adds an `<img>`-mode path.
- **Punctuation Setup eyebrow string unification** (currently
  `PunctuationSetupScene.jsx:303` hardcodes `"Bellstorm Coast"` while
  `PunctuationMapScene.jsx:381` reads from `PUNCTUATION_DASHBOARD_HERO.eyebrow`
  constant). Pre-existing drift, not addressed this pass. Follow-up PR
  can unify.

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/ui/HeroBackdrop.jsx` — subject-agnostic backdrop with
  cross-fade + pan. Accepts `url`, `previousUrl`, `extraBackdropClassName`,
  `extraLayerClassName`. Layer elements carry `data-hero-layer="true"` for
  luminance probes.
- `src/platform/ui/useSetupHeroContrast.js` — selector-agnostic contrast hook.
  Accepts `staticContrastForBg`, `cardSelector`, `controlSelectors`,
  `observeSelectors`.
- `src/platform/ui/hero-bg.js` — `HERO_PAN_SECONDS`, `HERO_TRANSITION_MS`,
  `heroBgStyle(url)`, `heroPanDelayStyle()`.
- `src/platform/ui/luminance.js` — `probeHeroTextTones`, `resolveHeroLayer` by
  `[data-hero-layer]`.
- `src/platform/ui/SetupMorePractice.jsx` — disclosure shell; not a consumer
  this pass, but illustrates the "caller-supplied renderer" pattern used by
  the sidebar extraction in U3.
- `src/platform/core/utils.js` — `stableHash` shared across hero-bg view-models.
- `src/subjects/grammar/components/GrammarSetupScene.jsx:166-203` —
  `RoundLengthPicker` reference implementation (Grammar pilot API shape).
- `src/subjects/grammar/components/grammar-hero-bg.js` — subject hero-bg
  view-model template (regions / tones / contrast profile / preload list).
- `src/subjects/spelling/components/SpellingSetupScene.jsx:205-240,242-274` —
  `LengthPicker` + `YearPicker` inline implementations to be replaced.
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx` — current
  mission dashboard, to be wrapped in `.setup-grid` / `.setup-main`.
- `src/subjects/punctuation/components/punctuation-view-model.js:44-74` —
  `bellstormSceneForPhase()` + `SETUP_SCENES` / `SUMMARY_SCENES` constants.
  Function return shape stays stable.
- `tests/playwright/shared.mjs:68,349,356` and
  `tests/playwright/visual-baselines.playwright.test.mjs:238,264,958` —
  Playwright locators anchored on `.punctuation-strip`. Must be preserved or
  re-pointed without loss of coverage.
- `tests/punctuation-view-model.test.js:503-520` and
  `tests/react-punctuation-assets.test.js:15-28` — contract tests on
  `bellstormSceneForPhase`. Stay green unchanged.

### Institutional Learnings

- **Pioneer-then-pattern refactor** (pattern recurring across
  `docs/solutions/architecture-patterns/`): extract when there are 2+
  concrete consumers, not earlier. This plan's U1-U3 satisfy that gate
  (Spelling + Grammar both real consumers of the extraction).
- **DSL-as-normaliser pattern** (memory-linked): authoring-time expansion with
  zero runtime change; characterisation proofs. Applied analogously here —
  the platform `LengthPicker` must render byte-identical DOM to the current
  Grammar/Spelling inline copies so existing CSS selectors and test locators
  stay green.
- **Windows-on-Node pitfalls** (memory-linked): keep CRLF discipline when
  creating new `.jsx` / `.js` files under `src/platform/ui/`.
- **Rewards Presentation contract** (memory-linked): producer-agnostic
  queue — an informing precedent for the SetupSidePanel extraction which is
  also *consumer-slot* driven (caller renders what goes into `body`, `footer`,
  `head`).

### External References

- Not used. Local patterns are well-established (PR #591 is the canonical
  precedent); the Grammar-pilot API is the source of truth for U1-U3.

---

## Key Technical Decisions

- **Platform `LengthPicker` prop shape mirrors Grammar, not Spelling.** Grammar's
  `{options, selectedValue, onChange, disabled, ariaLabel, unit}` is more
  general than Spelling's `{prefs, actions, disabled}`. Making `onChange` the
  leaf callback pushes the `renderAction` / `actions.dispatch` dispatch up to
  the subject scene, which is where subject-specific action names (`spelling-
  set-pref`, `grammar-set-round-length`, `punctuation-set-round-length`)
  belong anyway. Spelling adopts by passing a `onChange` closure that calls
  `renderAction(..., 'spelling-set-pref', { pref: 'roundLength', value })`.
- **`LengthPicker` unit is a prop, not a class variant.** Grammar says
  `"questions"`, Spelling round-length says `"words"`, Spelling year says no
  unit, Punctuation says no unit. Pass `unit` (optional string) rather than
  branching CSS.
- **`SetupSidePanel` is slot-based, not model-based.** The sidebar's inner
  content (stats grid, codex link, bank link copy) differs sharply across
  subjects. The platform component provides the chrome (outer `.ss-card`,
  optional `.ss-head` row, body region) and nothing inside the slots is
  enforced. This avoids building a pseudo-framework around sidebar content.
- **Punctuation's bellstorm URL keeps the `phase → fixed index` contract.**
  We feed `scene.src` into `HeroBackdrop` and drop the `srcSet` / `sizes`
  attributes — `HeroBackdrop` paints via CSS `background-image`, not an `<img>`
  element. The same `bellstormSceneForPhase(phase)` still returns
  `{ name, src, srcSet }` so the two contract tests stay green (they assert
  `name` only).
- **Legacy class aliases on new Punctuation wrappers.** The platform
  `HeroBackdrop` accepts `extraBackdropClassName` — for Punctuation we pass
  `"punctuation-hero-backdrop"` so every new wrapper carries a subject-
  namespaced class alongside `.hero-backdrop`. This gives Playwright a stable
  re-point target (`.punctuation-hero-backdrop` instead of `.punctuation-strip`)
  without the test having to know about platform-level class names.
- **Positioning ancestor for `HeroBackdrop`.** `.hero-backdrop` is
  `position: absolute; inset: 0; overflow: hidden` (styles/app.css:5526-5532).
  On Setup scenes this works because `.setup-main` at styles/app.css:4588-4607
  already supplies `position: relative; overflow: hidden`. But
  `.punctuation-session-scene`, `.punctuation-map-scene`, and
  `.punctuation-surface` do NOT. Each scene's `styles/app.css` modification
  in U5/U6 must add `position: relative; overflow: hidden` (plus
  `border-radius: inherit` for rounded-card clipping) to the wrapping
  class so the absolute-positioned backdrop paints relative to the card
  frame, not the page root.
- **`.setup-main` defaults unsuitable for Punctuation's tall dashboard.**
  `.setup-main` carries `min-height: 610px; overflow: hidden;
  view-transition-name: spelling-hero-card` (app.css:4604-4607). Punctuation's
  content (hero + progress strip + monster meter row + map link + secondary
  drawer) is ~1,000-1,200 px and must not inherit the 610px min-height clip
  nor share the `spelling-hero-card` transition name (which would collide if
  Admin or another surface animates alongside). U4 adds a
  `.punctuation-setup-main { min-height: auto; overflow: visible;
  view-transition-name: none; }` override. If focus-ring clipping becomes a
  regression at monster-meter edges, the override extends to
  `overflow: visible` on the inner mission-dashboard container specifically.
- **The legacy `.punctuation-strip` / `.punctuation-dashboard-hero` classes
  stay in `styles/app.css` as dead selectors temporarily.** Removing them is a
  follow-up once all Playwright locators point at the new class. Keeping them
  for one release cycle makes the refactor rollbackable.
- **Every pre-existing `data-section` / `data-punctuation-phase` /
  `data-punctuation-cta` / `data-punctuation-summary` attribute on the
  Punctuation scenes stays. The platform wrapper wraps content; it does not
  move these attributes.**
- **Platform primitives do not take Punctuation's monster-bar CSS.** Punctuation
  keeps its bespoke `.punctuation-monster-meter` rules; those are IA-level,
  not chrome-level, and live outside scope.

---

## Open Questions

### Resolved During Planning

- _Which subject's API wins for `LengthPicker`?_ → **Grammar's pilot shape**
  (props drive options, onChange is leaf). Spelling's hardcoded-options
  version is deprecated to a consumer.
- _Is Punctuation adopting `SetupMorePractice`?_ → No. Punctuation's
  secondary drawer is already inline with the dashboard rhythm; wrapping it
  in a platform disclosure is not warranted this pass.
- _Does Bellstorm get a per-learner tone upgrade?_ → No. Phase → index stays.
- _Do we extract `Ribbon` / `AnimatedPromptCard` now?_ → No. Single-consumer
  extractions would be premature.
- _Do we keep or delete `.punctuation-strip` CSS?_ → Keep for one release
  cycle; follow-up PR removes after Playwright locators are re-pointed.
- _Hero welcome copy for missing learner name?_ → Collapse the line entirely;
  do not render `"Hi  — ready for a short round?"` or `"Hi friend"`.
- _Does Punctuation adopt `SetupSidePanel` in this pass?_ → **No**. Adding
  a right-rail to a single-column mission dashboard is an IA change. See R3.
- _Cross-scene `previousUrl` handoff (feedback → summary)?_ → Deferred to
  follow-up PR (see Scope Boundaries). Every scene-boundary transition in
  this pass will see a ~900 ms blank dissolve-in for the backdrop. Accepted
  as a known UX cost of the in-scene-only implementation.

### Deferred to Implementation

- Exact `SetupSidePanel` prop names (`head` / `body` / `footer` vs single
  `children` — both work; pick the one that reads cleanest against all three
  call-sites). Implementer picks during U3.
- Whether `LengthPicker` needs a `data-action` default vs always-required
  prop. Decide during U1 based on which side is easier to test.
- Exact Playwright locator updates — may be "re-point to new class" or "add
  `page.locator('.punctuation-strip, .punctuation-hero-backdrop')` OR-chain";
  implementer picks per call-site during U6 based on local test readability.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce.*

**Platform layer (after this plan)**

    src/platform/ui/
      HeroBackdrop.jsx          ← unchanged from Grammar pilot
      useSetupHeroContrast.js   ← unchanged
      hero-bg.js                ← unchanged
      SetupMorePractice.jsx     ← unchanged (no new consumer this pass)
      LengthPicker.jsx          ← NEW: canonical slide-button picker
      hero-copy.js              ← NEW: heroWelcomeLine(name)
      HeroWelcome.jsx           ← NEW: renders heroWelcomeLine or null
      SetupSidePanel.jsx        ← NEW: slot-based .ss-card shell
      (later: extract mid-session tinting, Ribbon, AnimatedPromptCard)

**Consumer graph (before → after)**

    SpellingSetupScene.LengthPicker  ──┐
    SpellingSetupScene.YearPicker    ──┼──→ src/platform/ui/LengthPicker.jsx
    GrammarSetupScene.RoundLengthPicker─┘

    GrammarSetupScene welcome <p>    ──┐
    PunctuationSetupScene welcome <p>──┴──→ src/platform/ui/HeroWelcome.jsx

    SpellingSetupScene .ss-card      ──┐
    GrammarSetupScene .grammar-setup-sidebar
                                       ┴──→ src/platform/ui/SetupSidePanel.jsx
    (Punctuation: no sidebar this pass — stays single-column)

**Punctuation scene shape (after U4-U7)**

    PunctuationSetupScene
      section.punctuation-surface.punctuation-mission-dashboard   ← preserved data-attrs
        div.setup-grid
          section.setup-main.punctuation-setup-main    ← position:relative; overflow:hidden
                                                         (min-height:auto override)
            HeroBackdrop url=bellstorm('setup').src extraBackdrop=punctuation-hero-backdrop
            div.setup-content data-section=hero
              p.eyebrow · h2.section-title · HeroWelcome
              div.punctuation-dashboard-cta-row (preserved)
              section.punctuation-progress-row   (preserved, data-section=progress-row)
              section.punctuation-monster-row    (preserved, data-section=monster-row)
              div[data-section=map-link]          (preserved)
              section.punctuation-secondary-drawer  (preserved, data-section=secondary)
                LengthPicker options=PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS …
          (no .setup-side — single-column layout, see R3)

    PunctuationSessionScene (active-item + feedback phases)
      section.card.punctuation-surface.punctuation-session-scene
        HeroBackdrop url=bellstorm(phase).src extraBackdrop=punctuation-hero-backdrop
        div.punctuation-session-hero-content  ← new stable anchor
          eyebrow + h2.section-title + subtitle
        (rest of scene unchanged)

    PunctuationSummaryScene   — identical shape, HeroBackdrop swap only
    PunctuationMapScene       — identical shape, HeroBackdrop swap only

---

## Implementation Units

- U1. **Extract platform `LengthPicker`**

**Goal:** Canonicalise Grammar's `RoundLengthPicker` + Spelling's `LengthPicker` /
`YearPicker` into a single `src/platform/ui/LengthPicker.jsx` with the Grammar-
pilot prop shape. Re-point all three consumers.

**Requirements:** R1, R10

**Dependencies:** None

**Files:**
- Create: `src/platform/ui/LengthPicker.jsx`
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (drop inline
  `RoundLengthPicker`, import platform version)
- Modify: `src/subjects/spelling/components/SpellingSetupScene.jsx` (drop inline
  `LengthPicker` + `YearPicker`, render platform version twice with different
  options / unit / onChange closures)
- Test: `tests/platform-length-picker.test.js` (new)
- Test: `tests/react-grammar-surface.test.js` (update if needed — the current
  assertions on `.length-picker` / `.length-option` must still pass)
- Test: `tests/spelling-setup-scene.test.js` (update if present, or the relevant
  file in the Spelling test slice)

**Approach:**
- Props: `{ options: Array<string | { value: string, label: string }>,
  selectedValue: string, onChange: (value, event?) => void,
  disabled?: boolean, ariaLabel?: string, unit?: string, className?: string,
  actionName?: string, prefKey?: string, valueAttr?: boolean }`
- `options` accepts both shapes. When an entry is a string, `value === label`.
  When an entry is `{value, label}`, the button's `value` attribute and
  internal selection comparison use `value`, while the rendered `<span>`
  text uses `label`. This preserves Spelling's `YearPicker` contract at
  `spelling-view-model.js:104-109` where options are
  `[{value: 'core', label: 'Core'}, {value: 'y3-4', label: 'Y3-4'}, ...]` —
  the visible text is "Y3-4" but the serialised preference is `'y3-4'`.
  Without this, Spelling's year-filter could not migrate.
- `onChange` signature carries `(value, event?)` — Grammar and Punctuation
  ignore the event; Spelling's closure uses it to call
  `renderAction(actions, event, 'spelling-set-pref', { pref, value })` so
  the existing `event.preventDefault()` / `event.stopPropagation()`
  semantics in `spelling-view-model.js:641-644` are preserved.
- Render the same DOM as Grammar's current `RoundLengthPicker`:
  `.length-control` wrapper (only when `unit` is passed), `.length-picker`
  radiogroup with `--option-count` / `--selected-index` CSS vars,
  `.length-slider`, per-option `.length-option` buttons, optional
  `.length-unit` span for the unit.
- Each option button carries `data-action={actionName}` when `actionName` is
  passed, `data-pref={prefKey}` when `prefKey` is passed, and
  `data-value={value}` when `valueAttr` is true. This preserves the three
  pre-existing attribute shapes:
  - Grammar: `actionName='grammar-set-round-length'`, `prefKey='roundLength'`
  - Spelling round-length: `actionName='spelling-set-pref'`, `prefKey='roundLength'`
  - Spelling year-filter: `actionName='spelling-set-pref'`, `prefKey='yearFilter'`
  - Punctuation round-length: `actionName='punctuation-set-round-length'`,
    `valueAttr=true` (no `prefKey`; the existing `RoundLengthToggle` at
    `PunctuationSetupScene.jsx:139` uses `data-value` instead)
- Callers pass their own `onChange` closure so subject-specific action
  dispatch (`spelling-set-pref`, `grammar-set-round-length`, `punctuation-
  set-round-length`) stays in the subject scene.

**Patterns to follow:**
- `src/subjects/grammar/components/GrammarSetupScene.jsx:166-203` — reference
  implementation.
- `src/platform/ui/SetupMorePractice.jsx` — same "platform shell, caller
  supplies closures" pattern.

**Test scenarios:**
- Happy path — Renders with 5 options, selected index matches, clicking
  option 3 calls `onChange('8')` exactly once (Grammar round-length use case).
- Happy path — Renders with unit prop — outer wrapper is `.length-control`,
  inner `.length-picker` + `.length-unit` spans exist.
- Happy path — `actionName='grammar-set-round-length'` + `prefKey='roundLength'`
  puts `data-action="grammar-set-round-length"` and `data-pref="roundLength"`
  on every `.length-option` button.
- Happy path — `valueAttr=true` puts `data-value={value}` on every button
  (Punctuation parity).
- Edge case — Omitting `actionName` / `prefKey` / `valueAttr` emits no
  `data-*` attributes beyond `role="radio"` / `aria-checked`.
- Happy path — `options=[{value:'y3-4',label:'Y3-4'}, {value:'extra',label:'Extra'}]`
  renders visible text `Y3-4` / `Extra` while `value` attribute + internal
  selected-index comparison use `y3-4` / `extra`. Selecting the second
  option calls `onChange('extra', event)` not `onChange('Extra', event)`.
- Happy path — `onChange` receives `(value, event)` — callers that pass
  event to `renderAction` observe `preventDefault`/`stopPropagation` side
  effects (spelling-specific test against the Spelling wrapper).
- Happy path — Renders without unit prop — outer wrapper IS `.length-picker`
  directly (no `.length-control` wrapper), no `.length-unit` span rendered
  (Spelling year-filter use case).
- Edge case — Zero-length options array renders an empty radiogroup with
  `--option-count: 0`, no crash, no selected option.
- Edge case — `selectedValue` not in options → selected index is 0, first
  option is `aria-checked="true"`.
- Edge case — `disabled=true` sets every button's `disabled` attribute and
  clicks do NOT fire `onChange`.
- Accessibility — `role="radiogroup"` on outer picker, `role="radio"` on
  every option, `aria-checked` tracks `selectedValue`, `ariaLabel` threads
  to the radiogroup's `aria-label`.

**Verification:**
- Grammar round-length picker renders identically (DOM + classes) to before.
- Spelling round-length + year-filter pickers render identically to before.
- CSS renders unchanged (no `.length-picker` rule edits needed in this unit).

---

- U2. **Extract platform `HeroWelcome`**

**Goal:** Canonicalise the `"Hi {name} — ready for a short round?"` copy into
`src/platform/ui/hero-copy.js` (string helper) + `src/platform/ui/HeroWelcome.jsx`
(thin component that renders the `<p>` or null).

**Requirements:** R2, R10

**Dependencies:** None

**Files:**
- Create: `src/platform/ui/hero-copy.js`
- Create: `src/platform/ui/HeroWelcome.jsx`
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (replace
  inline `<p className="grammar-hero-welcome">…</p>`)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
  (replace inline welcome line)
- Test: `tests/platform-hero-copy.test.js` (new)

**Approach:**
- `heroWelcomeLine(name)` returns `"Hi {trimmedName} — ready for a short round?"`
  when `name` is a non-empty string, otherwise `''`.
- `<HeroWelcome name={learner?.name} className="grammar-hero-welcome" />` renders
  a `<p>` with that class when the helper returns non-empty, otherwise null.
- Grammar passes `className="grammar-hero-welcome"` (preserves existing class);
  Punctuation passes `className="punctuation-hero-welcome"`.

**Patterns to follow:**
- `src/platform/core/utils.js` — pure helpers file precedent.
- `src/platform/ui/SetupMorePractice.jsx` — optional className prop pattern.

**Test scenarios:**
- Happy path — `heroWelcomeLine('James')` returns
  `"Hi James — ready for a short round?"`.
- Edge case — `heroWelcomeLine('')` returns `''`.
- Edge case — `heroWelcomeLine('  ')` returns `''` (whitespace-only).
- Edge case — `heroWelcomeLine(null)` and `heroWelcomeLine(undefined)` return
  `''`.
- Edge case — `heroWelcomeLine('  Ava  ')` returns
  `"Hi Ava — ready for a short round?"` (trimmed).
- Component — `<HeroWelcome name="James" />` renders a `<p>` with the line.
- Component — `<HeroWelcome name="" />` renders null (nothing in the tree).
- Component — `<HeroWelcome name="James" className="punctuation-hero-welcome" />`
  renders `<p class="punctuation-hero-welcome">…</p>`.

**Verification:**
- Grammar's rendered welcome line is byte-identical (`.grammar-hero-welcome`
  class preserved).
- Punctuation's rendered welcome line carries `.punctuation-hero-welcome`.
- No orphan "Hi — ready for a short round?" appears for anonymous sessions.

---

- U3. **Extract platform `SetupSidePanel`**

**Goal:** Lift `.ss-card` / `.ss-head` / `.ss-bank-link` shell into a platform
slot-based component. Spelling and Grammar adopt as wrappers. Punctuation
does NOT adopt in this pass (see R3) — the Punctuation dashboard stays
single-column inside `.setup-main` only.

**Requirements:** R3, R10

**Dependencies:** None (landable independently; U4 consumes it)

**Files:**
- Create: `src/platform/ui/SetupSidePanel.jsx`
- Modify: `src/subjects/spelling/components/SpellingSetupScene.jsx` (replace
  inline `<aside className="setup-side">` tree with `SetupSidePanel`)
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (replace
  inline `<aside className="setup-side grammar-setup-sidebar">`)
- Test: `tests/platform-setup-side-panel.test.js` (new)

**Approach:**
- Props: `{ head?: ReactNode, body: ReactNode, footer?: ReactNode,
  asideClassName?: string, cardClassName?: string, headClassName?: string,
  headTag?: 'div' | 'header', ariaLabel?: string }`
- Renders: `<aside className="setup-side {asideClassName}" aria-label={ariaLabel}>`
  containing `<div className="ss-card {cardClassName}">` with three optional
  slots: `<{headTag} className="ss-head {headClassName}">{head}</{headTag}>`,
  `{body}` bare, `{footer}` bare.
- **`headTag` default is `'div'`** to preserve Spelling's existing DOM
  (`SpellingSetupScene.jsx:546` uses `<div className="ss-head">`). Grammar
  passes `headTag='header'` to preserve its existing
  `<header className="ss-head grammar-setup-sidebar-head">` shape at
  `GrammarSetupScene.jsx:335`. This avoids silently changing the element
  tag at the Spelling call-site — important because the characterisation-
  proof discipline for this refactor is strict DOM-identity.
- Subject-specific classes (e.g. `grammar-setup-sidebar`,
  `grammar-setup-sidebar-card`, `grammar-setup-sidebar-head`) are passed
  via the className props; nothing about subject branding leaks into the
  platform component.

**Patterns to follow:**
- `src/platform/ui/SetupMorePractice.jsx` — slot-based shell with
  `disclosureClassName` / `gridClassName` props.
- `src/platform/ui/HeroBackdrop.jsx` — `extraBackdropClassName` pattern.

**Test scenarios:**
- Happy path — Renders with all three slots populated (head / body / footer).
- Happy path — Renders with only `body` — no `<header>` emitted, no footer.
- Happy path — `asideClassName="grammar-setup-sidebar"` appends to
  `setup-side` → final aside class = `"setup-side grammar-setup-sidebar"`.
- Happy path — `cardClassName="grammar-setup-sidebar-card"` appends to
  `ss-card`.
- Happy path — `ariaLabel="Where you stand"` threads to the `<aside
  aria-label>`.
- Edge case — `head=null` + `footer=null` still renders the card chrome.
- Edge case — A complex `body` (JSX subtree with its own nested sections) is
  passed through unchanged.

**Verification:**
- Spelling sidebar: rendered DOM equivalent to before (same classes, same
  inner composition), codex link + meadow + stat grid + bank link all render
  in the same slots.
- Grammar sidebar: monster strip + today cards + bank link render identically.
- No regression in existing Spelling / Grammar tests.

---

- U4. **Adopt platform primitives in `PunctuationSetupScene`**

**Goal:** Wrap the mission dashboard in `.setup-grid` / `.setup-main`, paint the
hero via `HeroBackdrop` + `useSetupHeroContrast`, consume `LengthPicker` +
`HeroWelcome`, and render the new sidebar via `SetupSidePanel`.

**Requirements:** R4, R8, R9, R10, R11, R12

**Dependencies:** U1, U2, U3

**Files:**
- Create: `src/subjects/punctuation/components/punctuation-hero-bg.js` —
  mirrors Grammar's `grammar-hero-bg.js` file layout. Hosts
  `heroContrastProfileForPunctuationBg(url)` and re-exports the existing
  `bellstormSceneForPhase`. Keeps chrome concerns OUT of
  `punctuation-view-model.js` per the precedent Grammar set. (Note: no
  `heroToneForPunctuationBg` helper is added — Punctuation has no tone axis,
  so there is no per-tone variant for the helper to decode.)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
  (main refactor — wrap in setup-grid, swap hero chrome, swap length toggle)
- Modify: `styles/app.css` (adjust `.punctuation-mission-dashboard` to play
  nicely inside `.setup-grid` / `.setup-main`; add Punctuation-specific hero
  backdrop aliases if needed; keep legacy `.punctuation-dashboard-hero` rules
  as dead selectors for one cycle)
- Test: `tests/react-punctuation-scene.test.js` (update)
- Test: `tests/punctuation-setup-hero-backdrop.test.js` (new)
- Test: existing setup-scene journey tests — update locators from
  `.punctuation-dashboard-hero img` → `.punctuation-hero-backdrop`

**Approach:**
- New helper `heroContrastProfileForPunctuationBg(url)` in the new
  `punctuation-hero-bg.js` returns a curated `{shell, controls, cards}`
  profile keyed on **bellstorm scene name** (not mode / tone — Punctuation
  has no tone axis; the URL pool is a flat 8-item list selected by
  `bellstormSceneForPhase`). Regex match on `bellstorm-coast-([a-e][12]|cover)`.
  Because every Bellstorm scene shares the same visual palette today
  ("dark ink on light gold"), the helper can return the same static profile
  for every URL. A single-row table is acceptable — the helper still earns
  its keep by acting as a probe short-circuit (no runtime luminance scan
  on Setup mount), which matters for Setup's first-paint. If Bellstorm adds
  a darker variant in future, this table grows. No `mode` parameter.
- **`useSetupHeroContrast` call-site configuration**: Punctuation passes
  `cardSelector: '.punctuation-dashboard-cta-row .btn'` (the single CTA
  button — Punctuation has no mode-card row). `controlSelectors` is
  `['.punctuation-round-label', '.punctuation-secondary-action']`.
  `observeSelectors` covers those plus `.punctuation-monster-meter-name`.
  The second argument to the hook is a constant `'setup'` string — mode
  does not affect Punctuation's bellstorm URL (phase does), so the hook's
  mode-keyed memo is a no-op by design.
- Pass the bellstorm URL (not srcSet) to `HeroBackdrop` via
  `bellstormSceneForPhase('setup').src`.
- The existing `scene.src` / `scene.srcSet` `<img>` is removed; `HeroBackdrop`
  paints via `background-image`.
- **`data-section="hero"` ownership**: in the current scene the attribute
  sits on `.punctuation-dashboard-hero` which wraps both the `<img>` and the
  eyebrow / section-title / CTA row. Under the new structure, `HeroBackdrop`
  paints the background; the eyebrow / section-title / welcome / CTA row
  collects inside `.setup-content`. **The new owner of `data-section="hero"`
  is the `.setup-content` wrapper** — it is the content block, matching the
  semantic intent of the existing journey-spec locator. `HeroBackdrop` itself
  does not carry `data-section`.
- **`data-hero-tone` and `data-controls-tone` on `.punctuation-setup-main`**.
  Grammar/Spelling set these data attributes on `.setup-main` so the CSS
  rules at `styles/app.css:4621-4632` swap `--setup-label-ink` and
  `--length-option-ink` when the backdrop's controls tone is light vs dark.
  U4 adds the same bindings on Punctuation's `.setup-main`:
  `data-hero-tone={heroContrast.contrast.tone || 'default'}` and
  `data-controls-tone={heroContrast.contrast.controls}`. Without them the
  secondary drawer's round-length label inherits dark-ink defaults regardless
  of what the probe decides.
- **`view-transition-name` override**. `.setup-main` carries
  `view-transition-name: spelling-hero-card` (app.css:4607). Grammar
  overrides to `grammar-hero-card` (app.css:11858). Punctuation's
  `.punctuation-setup-main` sets `view-transition-name: punctuation-hero-card`
  (or `none` if there is no Punctuation hero-card view-transition story
  today) to avoid a collision if Spelling and Punctuation setup shells are
  ever animating concurrently.
- Legacy `data-*` attributes (`data-punctuation-phase`, `data-punctuation-cta`,
  `data-section="progress-row"`, `data-section="monster-row"`,
  `data-section="map-link"`, `data-section="secondary"`) all move with the
  content they're attached to — nothing is renamed.
- One-shot prefs migration + telemetry card-opened emit stay exactly where
  they are (useEffect, same dependency arrays).

**Patterns to follow:**
- `src/subjects/grammar/components/GrammarSetupScene.jsx` — canonical example
  of a setup scene consuming all three platform primitives.
- `src/subjects/grammar/components/grammar-hero-bg.js` — template for
  `heroContrastProfileForPunctuationBg`.

**Test scenarios:**
- Happy path — Scene renders `.punctuation-hero-backdrop` (platform class) +
  legacy `data-section="hero"` landmark.
- Happy path — `LengthPicker` renders inside `.punctuation-secondary-drawer`
  with the same `PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS` content, selecting a
  new value dispatches `punctuation-set-round-length` with `{ value }`.
- Happy path — `HeroWelcome` renders with the learner name; anonymous learner
  collapses the welcome line.
- Integration — Setup scene mount still emits `card-opened` exactly once per
  mount with payload `{ cardId: 'smart' }`.
- Integration — Legacy cluster mode in prefs (`endmarks`) still triggers the
  one-shot prefs migration on useEffect → dispatches
  `punctuation-set-mode` with `{ value: 'smart' }` and `updateSubjectUi` with
  `{ prefsMigrated: true }`.
- Edge case — Learner name absent → no `.punctuation-hero-welcome` node.
- Edge case — `ui.starView` absent → dashboard renders with legacy
  `starDerivedStage` display fields, no crash.
- Reduced motion — With `prefers-reduced-motion: reduce`, hero-pan animation
  CSS does not apply (existing platform guarantee; the test is a sanity check
  on the Punctuation wrapper not overriding it).
- Locator parity — Playwright selectors targeting `hero` landmark and primary
  CTA (`[data-punctuation-cta]`) still hit.

**Verification:**
- Setup scene visual: Bellstorm vista paints via `HeroBackdrop` with
  cross-fade on mode transitions.
- Primary CTA row, progress strip, monster meter row, Map link, secondary
  drawer all render in the same visual order.
- `useSetupHeroContrast` probe tones the mode cards (or static profile
  decides) so headline reads cleanly on both lighter and darker bellstorm
  variants.

---

- U5. **Adopt platform primitives in `PunctuationSessionScene`**

**Goal:** Replace the static `.punctuation-strip` `<img>` hero in **all three**
call-sites (active-item branch at line 374, GPS early-return / minimal feedback
branch at line 546, scored feedback branch at line 603) with `HeroBackdrop`,
preserving every data-attribute and test anchor.

**Requirements:** R5, R8, R9, R10, R11, R12

**Dependencies:** U4 (defines the subject's hero URL + contrast idioms)

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
  (both phase branches' hero chunks)
- Modify: `styles/app.css` (add `.punctuation-session-hero-content` anchor;
  keep `.punctuation-strip` rules in place as dead selectors)
- Test: `tests/react-punctuation-session-scene.test.js` (update locators)
- Test: `tests/playwright/shared.mjs` and `visual-baselines.playwright.test.mjs`
  — re-point `.punctuation-strip` locators to the new anchor
- Test: `tests/punctuation-session-hero-backdrop.test.js` (new)

**Approach:**
- Active-item branch (line 374): wrap heading block in
  `.punctuation-session-hero-content` (stable anchor), render `HeroBackdrop`
  with `bellstormSceneForPhase('active-item').src`.
- Minimal-feedback / GPS early-return branch (line 546): same pattern;
  URL is `bellstormSceneForPhase('feedback').src`.
- Scored feedback branch (line 603): same pattern with the same `feedback`
  URL.
- The `<h2 className="section-title">` node stays — Playwright locator
  `.punctuation-strip .section-title` becomes
  `.punctuation-session-hero-content .section-title`.
- `previousUrl` handoff active-item → feedback: the ref lives at the
  `PunctuationSessionScene` level — the **phase-stable parent** that renders
  both the active-item JSX branch and the feedback JSX branch. Placing the
  ref inside a branch component would not work because
  `PunctuationSessionScene.jsx:699-705` branches between `<ActiveItemBranch>`
  and `<FeedbackBranch>` on `ui?.phase`; each branch mounts / unmounts as
  phase flips and loses its local refs. The ref lives on
  `PunctuationSessionScene`, captures the prior URL on render, and the
  current phase's URL is passed to each branch via prop; each branch
  forwards `url` and `previousUrl` to `HeroBackdrop`.
- **Declare the ref ABOVE any early return**. `PunctuationSessionScene`
  currently has early returns for missing session / missing current-item
  cases. `const previousHeroBgRef = React.useRef('')` must be declared at
  the top of the component before any conditional return — React's rules
  of hooks require unconditional hook ordering.
- This only covers phase transitions that stay within
  `PunctuationSessionScene`. Cross-scene handoff (feedback → summary) is
  explicitly deferred (see Scope Boundaries).
- `tests/playwright/shared.mjs:60-74`'s `SCREENSHOT_DETERMINISM_CSS` rule is
  extended to add `.punctuation-hero-backdrop [data-hero-layer="true"] { ... }`
  so `HeroBackdrop` background paints do not leak into deterministic
  screenshot diffs. The `.punctuation-strip img` rule stays in place as
  harmless legacy coverage.
- **`injectFixedPromptContent` secondary locator**.
  `tests/playwright/visual-baselines.playwright.test.mjs:260-266` includes
  `.punctuation-strip .section-title` in a `document.querySelectorAll`
  list that overwrites live prompt text with a deterministic pangram for
  screenshot stability. After U5 moves the `<h2 class="section-title">`
  into `.punctuation-session-hero-content`, the old selector no longer
  matches and the textContent-injection silently skips, re-introducing
  per-item prompt-text length variance into the baseline. U5 updates the
  selector list to include the new anchor
  (`.punctuation-session-hero-content .section-title` + retain the
  legacy selector for one release cycle as belt-and-braces).
- **`defaultMasks` mask-coverage audit**. `tests/playwright/shared.mjs:349,356`
  lists `.punctuation-strip .section-title` in a `defaultMasks` array used
  by the `>= 1 element` mask-coverage audit at
  `visual-baselines.playwright.test.mjs:903-959`. If that locator resolves
  to zero nodes on every surface, the audit fails. U5 either updates
  `defaultMasks` to the new anchor OR retains the legacy
  `.punctuation-strip` wrapper class on the new `.punctuation-session-hero-content`
  so the selector still resolves — implementer picks whichever is cleaner.

**Patterns to follow:**
- `src/subjects/spelling/components/SpellingSessionScene.jsx:240-241` —
  session scene hero pattern (SpellingHeroBackdrop with previousUrl).

**Test scenarios:**
- Happy path — Active-item phase renders `.punctuation-hero-backdrop` with
  the `active-item` bellstorm URL in its `--hero-bg` style; feedback phase
  renders with the `feedback` URL.
- Happy path — Transition from active-item → feedback threads the prior URL
  as `previousUrl`; the DOM renders two layers during the transition window.
- Happy path — `.punctuation-session-hero-content .section-title` locator
  resolves to the current item prompt (child-register overridden when needed).
- Integration — Child-register override still applied to `item.prompt`
  through `punctuationChildRegisterOverrideString`.
- Edge case — A session with no `currentItem` renders the fallback "Start a
  spelling round" branch unchanged (guarded early return).
- Edge case — `session.mode === 'gps'` still renders
  `GpsDelayedFeedbackChips` underneath the hero.
- Reduced motion — No pan animation; backdrop still paints statically.
- Playwright parity — `shared.mjs` session-scene mask coverage still probes
  the hero area; visual baseline snapshot still stable.

**Verification:**
- Session scene visual: bellstorm paints with cross-fade between `active-item`
  and `feedback` phases.
- Playwright session locators green.
- Telemetry `card-opened` / other session-scene events unchanged.

---

- U6. **Adopt platform primitives in `PunctuationSummaryScene` and `PunctuationMapScene`**

**Goal:** Swap the static hero `<img>` for `HeroBackdrop` on Summary
(`.punctuation-strip` at line 690) and Map (`.punctuation-hero` at line 372 —
NOTE: Map uses `.punctuation-hero`, not `.punctuation-strip`). No
information-architecture changes.

**Requirements:** R6, R7, R8, R9, R10, R11, R12

**Dependencies:** U4 (shared subject hero idioms)

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationSummaryScene.jsx`
- Modify: `src/subjects/punctuation/components/PunctuationMapScene.jsx`
- Modify: `styles/app.css` — add `.punctuation-summary-hero-content` +
  `.punctuation-map-hero-content` anchors
- Test: `tests/react-punctuation-summary-scene.test.js` (update if present)
- Test: `tests/react-punctuation-map-scene.test.js` (update if present)
- Test: existing Playwright specs — re-point
  `.punctuation-strip .section-title` as needed

**Approach:**
- Identical shape to U5: wrap the heading block in a stable anchor, render
  `HeroBackdrop` with the phase-specific bellstorm URL.
- Telemetry refs (`summaryReachedRef`, `feedbackRenderedRef`,
  `monsterProgressSignatureRef`) stay outside the hero swap.
- Map scene: keep every filter chip, cluster group, detail tab unchanged.

**Patterns to follow:**
- U4 / U5 patterns established in this plan.

**Test scenarios:**
- Happy path — Summary scene renders `.punctuation-hero-backdrop` with the
  `summary` bellstorm URL; `section-title` still reads `tonalHeadline`.
- Happy path — Map scene renders `.punctuation-hero-backdrop` with the
  `map` bellstorm URL; every cluster group + filter chip still present.
- Happy path — Telemetry `summary-reached` + `feedback-rendered` still fire
  exactly once per Summary mount.
- Integration — `monster-progress-changed` fires only on genuine stage
  transitions, still respects the signature-ref deduplication.
- Edge case — Summary with `summary.total === 0` still suppresses
  `CorrectCountLine` (preserved).
- Edge case — Map with empty cluster groups renders the empty-state card.
- Locator parity — all existing Summary / Map test anchors still resolve.

**Verification:**
- Summary + Map visuals: bellstorm paints via `HeroBackdrop` with
  cross-fade when the user navigates between phases.
- No telemetry event shape changes.
- No IA changes.

---

- U7. **Bundle + test sweep + cleanup pass**

**Goal:** Re-measure bundle bytes, confirm Spelling/Grammar parity, clean up
any leftover imports, ensure the Playwright + node:test suites are green, and
document the refactor in the PR body.

**Requirements:** R10

**Dependencies:** U1, U2, U3, U4, U5, U6

**Files:**
- Modify: `tests/bundle-byte-budget.test.js` — update byte ceilings if
  the net delta is non-trivial; include justification in the test update.
- Modify: `scripts/audit-client-bundle.mjs` (if new platform files need to be
  surfaced in the audit inputs graph)
- Test: `tests/client-bundle-audit.test.js` (if present — confirms inputs
  graph still covers the new platform files)

**Approach:**
- Run the full node:test suite and Playwright slice for Punctuation.
- If bundle byte deltas are non-trivial, update the budget + PR commit
  message justification.
- Verify the Admin Debug Bundle dump still includes Punctuation screens
  without extra noise.
- Ensure no stray imports from `spelling-view-model.js`'s
  `ROUND_LENGTH_OPTIONS` / `YEAR_FILTER_OPTIONS` leaked into other subjects.

**Test scenarios:**
- Integration — Full test slice green (spelling + grammar + punctuation +
  react-accessibility-contract + playwright golden-path + visual-baselines).
- Integration — Bundle byte budget test either passes unchanged or the
  updated ceiling is justified.

**Verification:**
- No test regression across the three subjects.
- No visual regression in Playwright baselines (allowed if the change is
  intentional and the baseline is re-snapshot with justification).
- Bundle audit inputs graph covers the new platform files.

---

## System-Wide Impact

- **Interaction graph:** Adopting `HeroBackdrop` on Punctuation adds a
  `useEffect`-driven state machine (layer cross-fade) to every Punctuation
  scene that previously rendered a static `<img>`. No new timers in session
  hot path; the hook's interval is 6s per the existing contract. Soft-lockout
  banner and TTS status hooks on Spelling/Grammar are untouched.
- **Error propagation:** `HeroBackdrop` is exception-free; a bad URL simply
  paints an empty layer. No new failure modes added.
- **State lifecycle risks:** `HeroBackdrop` layer state is scene-local; when a
  scene unmounts the layers are released. `useSetupHeroContrast` cancels its
  probe on unmount. No cross-scene leak.
- **API surface parity:** `bellstormSceneForPhase()` return shape is
  preserved; contract tests unchanged. The scene files' exported
  `PunctuationSetupScene` / `PunctuationSessionScene` / `PunctuationSummaryScene`
  / `PunctuationMapScene` prop contracts are unchanged.
- **Integration coverage:** Playwright visual baselines + journey spec +
  node:test `react-punctuation-*` tests together exercise the full
  hero-swap contract. Bundle byte budget test covers byte deltas.
- **Unchanged invariants:**
  - `bellstormSceneForPhase()` still returns `{name, src, srcSet}` — the two
    contract tests stay green unchanged.
  - Every `data-punctuation-*` / `data-section` attribute stays on the
    same node relative to its content.
  - `SpellingHeroBackdrop` + `.spelling-hero-*` class aliases stay
    (mid-session tinting CSS).
  - Grammar scene shape stays — U1-U3 only swap inline components for
    platform imports.
  - `useSetupHeroContrast` contract stays — selector-agnostic via options.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Playwright visual baselines diverge when bellstorm paints via `background-image` instead of `<img>` | Re-snapshot after U4-U6 with a PR-body justification; the `object-fit: cover` behaviour is achievable with `background-size: cover`. |
| `.punctuation-strip` locators break multiple Playwright specs silently | U5/U6 explicitly add new stable anchors and audit `tests/playwright/shared.mjs` + `visual-baselines.playwright.test.mjs` per-call-site. |
| Contrast probe regresses on tone variants where static profile is absent | Start with static profile matching current Punctuation colour ethos (Bellstorm gold on light panel-soft → dark ink); hook's runtime probe falls back when static returns null. |
| Bundle byte delta exceeds the budget | U7 re-measures; if delta >5KB, document the tradeoff and increase the budget with justification. |
| One-shot prefs migration regresses (legacy cluster modes stuck in prefs) | U4 preserves the `useEffect` call and the `legacyCluster` gate verbatim; test scenario in U4 explicitly covers the migration path. |
| Spelling year-filter picker regressions when `LengthPicker` consumed with no unit | U1 test scenarios explicitly cover the no-unit path; Spelling year-filter already renders without `.length-unit` in the current DOM — parity check is strict. |
| Admin / ops surfaces depending on `.punctuation-dashboard-hero` class | Keep the legacy class rules in `styles/app.css` for one release cycle (dead-selector bridge). |
| Telemetry emits double-fire if refactor duplicates a `useRef` guard | U5/U6 leave telemetry refs untouched; only the JSX around the refs changes. |
| `data-value` vs `data-pref` attribute divergence across the three current pickers breaks Admin Debug Bundle or Playwright locators | U1 prop contract explicitly supports all three attribute shapes (`actionName`, `prefKey`, `valueAttr`) with opt-in props. Spelling, Grammar, Punctuation each pass the combination that matches their CURRENT attribute footprint, so no test anchor breaks. |
| `.punctuation-strip img` is used by Playwright `SCREENSHOT_DETERMINISM_CSS` to hide `<img>` tags that would break deterministic screenshots. After the swap, background-image paints could leak into screenshot diffs | R8 + U5 explicitly extend the rule to cover `.punctuation-hero-backdrop [data-hero-layer="true"]`. |
| Bundle budget has ~700 B headroom over 227 KB ceiling; adding three new platform files could trip the gate | R10 + U7 include a contingency: if gzip delta clears +500 B, drop the legacy `.punctuation-dashboard-hero` CSS rules in this PR (not deferred) to reclaim bytes. If still over, re-commit `BASELINE_GZIP_BYTES` + `BUDGET_GZIP_BYTES` together per the test's upper-guard rule. |
| Cross-scene `previousUrl` handoff expectation (feedback → summary) would require lifting a ref to `PunctuationPracticeSurface.jsx`, which this plan does not touch | Cross-scene cross-fade is explicitly deferred. In-scene cross-fade (active-item ↔ feedback, both inside `PunctuationSessionScene`) is the only variant this plan implements. Declared in Scope Boundaries. |
| `heroContrastProfileForPunctuationBg` keyed on the wrong axis (plan initially sketched `(url, mode)` — Grammar's shape — but Punctuation has no tone axis) | U4 creates `punctuation-hero-bg.js` with a single-argument helper that keys on bellstorm scene name only; no `mode` parameter. |

---

## Documentation / Operational Notes

- PR body should call out the "Grammar pilot → platform canonical" direction
  explicitly so reviewers understand why Spelling now consumes primitives that
  nominally originated from its own scene.
- Post-merge: follow-up issue to remove the legacy
  `.punctuation-strip` / `.punctuation-dashboard-hero` rules from
  `styles/app.css` once one release cycle confirms no dependent locators
  remain.
- No user-visible telemetry payload changes; no schema bumps; no migration.
- No env vars, no CI changes; bundle byte budget may tick up or down slightly.
- Visual QA (manual): the three subjects should feel stylistically unified on
  setup, session, summary phases. A Playwright visual baseline re-snapshot is
  the objective gate.

---

## Sources & References

- Origin pilot PR: #591 — "feat(grammar): align setup with Spelling — shared
  hero engine, slide-button picker, setup-grid layout" (commit `a7ac090`)
- Related code:
  - `src/platform/ui/HeroBackdrop.jsx`
  - `src/platform/ui/useSetupHeroContrast.js`
  - `src/platform/ui/hero-bg.js`
  - `src/platform/ui/SetupMorePractice.jsx`
  - `src/subjects/grammar/components/GrammarSetupScene.jsx:166-203`
  - `src/subjects/grammar/components/grammar-hero-bg.js`
  - `src/subjects/spelling/components/SpellingSetupScene.jsx:205-274`
  - `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
  - `src/subjects/punctuation/components/punctuation-view-model.js:44-74`
- Related tests:
  - `tests/punctuation-view-model.test.js:503-520`
  - `tests/react-punctuation-assets.test.js:15-28`
  - `tests/playwright/shared.mjs:68,349,356`
  - `tests/playwright/visual-baselines.playwright.test.mjs:238,264,958`
- Institutional memory:
  - `MEMORY.md` → "Rewards Presentation contract" (slot-based shell precedent)
  - `MEMORY.md` → "DSL-as-normaliser pattern" (characterisation-proof
    discipline for zero runtime change)
  - `MEMORY.md` → "Windows-on-Node pitfalls" (CRLF / newline discipline)
