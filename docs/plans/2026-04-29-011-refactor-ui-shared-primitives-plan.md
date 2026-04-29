---
title: "refactor: UI Refactor P2 — Shared Interaction and Surface Contract"
type: refactor
status: active
date: 2026-04-29
origin: docs/plans/james/ui-refactor/ui-refactor-p2.md
---

# refactor: UI Refactor P2 — Shared Interaction and Surface Contract

## Overview

Convert the P1 UI foundation into a small, opinionated set of shared platform primitives — `Button`, `Card`, `SectionHeader`, `ProgressMeter`, `StatCard`, plus a narrow `SegmentedControl` extraction — and migrate selected child + adult surfaces onto them. The goal is one approved primitive per repeated UI choice, one CSS/token contract for changed files, and one parser-test oracle.

This is a **convergence pass, not a redesign.** Subject identity stays in content, artwork, accent, and copy; interaction mechanics ("start", "continue", "more practice", "filter", "round length", "progress") become the shared product surface.

The plan is built from repository ground-truth at 2026-04-29, not the origin's "supplied bundle" view. Several U-units have moved or shrunk because P1 already shipped more than the origin doc records (see Problem Frame).

---

## Problem Frame

The origin contract (`docs/plans/james/ui-refactor/ui-refactor-p2.md`) was authored against a snapshot that did **not** include the P1 completion report. In the live tree:

- `LengthPicker.jsx` is already the shared round-length primitive across **all three** subjects (Spelling round + year, Grammar, Punctuation) — so origin §5.4 / U4 is already done at the round-length layer.
- `PunctuationSetupScene.jsx:312` already renders via `HeroBackdrop` with `useSetupHeroContrast` and `SetupSidePanel` — so origin §5.5 / U6 is largely done at the hero layer.
- The P1 completion report exists at `docs/plans/james/ui-refactor/2026-04-29-completion-report.md` (118 B of 227,000 B bundle headroom remaining at end of P1).

Remaining real work, after reconciling against repo state:

1. There is **no shared `Button`** — surfaces still hand-build `<button className="btn primary xl">`, with ~114 call sites across `src/surfaces/` alone. Action hierarchy enforcement is informal.
2. `HeroQuestCard.jsx` empty/error branches and `AdminPanelFrame.jsx` default loading/empty slots are still hand-rolled — explicit P2 migration targets per origin §5.2 / U5.
3. Punctuation setup carries inline `#B8873F` accent on `borderTopColor` (line 302) and `--btn-accent` (line 328); `--punctuation-accent` token does not exist (only Grammar follows the `--<subject>-accent` pattern). Inline progress widths (`monster-meter` line 159) violate the CSP inline-style budget pattern.
4. No shared `Card`, `SectionHeader`, `ProgressMeter`, or `StatCard` primitive exists. Adult panels and Home subject cards each re-author the rhythm.
5. Bundle ceiling is **227,000 B gzip with ~116 B headroom** (`tests/bundle-byte-budget.test.js`). Every primitive must be net-zero or net-negative in bytes.

P2 must therefore: (a) ratify P1 as-shipped; (b) introduce the missing primitives; (c) migrate the still-bespoke surfaces; (d) tighten the token contract on **changed files only**; (e) report exact evidence without overclaiming.

---

## Requirements Trace

- R1. Every child-facing landing surface exposes exactly **one** above-the-fold primary action via the shared `Button` primitive (origin §5.1).
- R2. Empty, loading, and error states use shared primitives with the canonical three-part copy pattern unless a surface has a documented exception (origin §5.2).
- R3. Progress bars and stat readouts use shared semantics with subject accent flowing via CSS custom property — no new raw colour literals on changed files (origin §5.3, §6.8).
- R4. Filter/segmented controls share `role="radiogroup"` semantics, keyboard behaviour, and locator-preservation hooks (`actionName` / `prefKey` / `includeDataValue`) (origin §5.4, learnings).
- R5. Punctuation setup no longer carries bespoke primary-action / accent code that diverges from Grammar/Spelling without a documented exception (origin §5.5, §9.3).
- R6. Adult surfaces (Parent Hub, AdminPanelFrame default slots) share state, card, and header primitives with child surfaces (origin §5.6).
- R7. The shared `Button` is adopted by primary CTAs on Home, Hero Quest, Spelling setup, Grammar setup, Punctuation setup, plus at least one adult refresh/back action (origin §9.2).
- R8. Targeted UI parser tests pass; full repository verification is either green or honestly reported as blocked, with Node version and command evidence (origin §8, §9.9).
- R9. Bundle byte-budget test passes after each primitive lands; no broad barrel imports added (origin risk row, learnings).
- R10. Migrated components do not subscribe to `useAppState` directly — values are passed via props from screen components (learnings: React port flicker contract).
- R11. Reduced-motion, focus-visible, `aria-busy`, and radio semantics are preserved or improved on every migrated surface (origin §6.9).
- R12. The completion report avoids global claims like "the design system is finished" / "all colours tokenised" / "full verification passed" without exact command evidence (origin §11).

---

## Scope Boundaries

- No change to subject learning engines, marking, scheduling, Worker command authority, reward evidence, Star semantics, Hero economy, content generation, authentication, or persistence.
- No third-party UI framework, CSS-in-JS library, component generator, design-token build pipeline, or Storybook dependency. The repo is intentionally light on framework machinery.
- No whole-repo visual rewrite. Migration targets are listed per-unit; specialist surfaces (game canvases, monster render registry, content-driven panels) are explicitly out of scope.
- No claim of full design-system completion.

### Deferred to Follow-Up Work

- Whole-repo raw-hex-literal purge (top offenders: `GrammarCalibrationPanel.css` 18, `AdminProductionEvidencePanel.jsx` 15, `AuthSurface.jsx` 8): out-of-scope for P2; gated to changed files only. Captured in a follow-up token-purge plan.
- `SegmentedControl` extraction beyond round-length: depends on identifying ≥2 filter-chip consumers + 1 about-to-adopt — see U4 fork.
- `--spelling-accent` token introduction: tracked but only landed if Spelling setup is migrated in U6 alongside Punctuation.
- `BASELINE_GZIP_BYTES` refresh in `tests/bundle-byte-budget.test.js` (currently stale at 206_000 B vs actual 226,884 B): batched with `BUDGET` refresh once P2 stabilises, not in this plan.
- AdminPanelFrame full SSR characterisation suite expansion beyond default slots: future admin-section plan.

---

## Context & Research

### Relevant Code and Patterns

**Existing platform primitives** (do not re-author):
- `src/platform/ui/EmptyState.jsx`, `ErrorCard.jsx`, `LoadingSkeleton.jsx` — state primitives with `role="status"`, canonical three-part copy, reduced-motion carve-out.
- `src/platform/ui/HeroBackdrop.jsx` + `useSetupHeroContrast.js` + `luminance.js` + `hero-bg.js` — hero painter and contrast probe (cross-fade, slow-pan, contrast-driven shell/tone/cards/controls).
- `src/platform/ui/LengthPicker.jsx` — canonical slide-button `radiogroup` with `actionName` / `prefKey` / `includeDataValue` opt-in locator hooks. **Already adopted by all three subjects.**
- `src/platform/ui/SetupSidePanel.jsx`, `SetupMorePractice.jsx`, `HeroWelcome.jsx` — setup-surface scaffolds.
- `src/platform/react/use-submit-lock.js` — existing busy-state hook for Button to reuse.
- `src/platform/react/use-modal-focus-trap.js` and `use-focus-restore.js` — canonical focus utilities; primitives reuse, never re-author.

**Token system** (`styles/app.css:1-138`): `--bg`, `--panel`, `--ink`, `--line`, semantic `--good`/`--warn`/`--bad` triplets, brand `--brand`/`--brand-ink`/`--brand-soft`, shape `--radius-xs..xl`, elevation `--shadow*`, typography `--font-display` (Fraunces) / `--font-sans` / `--font-serif` / `--font-mono`, motion `--ease-*` / `--dur-*`. Subject accent pattern at line 11831+: Grammar defines `--grammar-accent` (+ ink/soft/border/dark-mode), then remaps `--accent` and `--btn-accent` via `:where(.grammar-...) { ... }`.

**`.btn` modifiers** (`styles/app.css:503-524`, `6171-6213`): base `.btn`; variants `primary`/`secondary`/`ghost`/`good`/`warn`/`bad`; sizes `sm`/`lg`/`xl`; shape `icon`/`icon.lg`; state `is-loading`/`[disabled]`/`:focus-visible`/`primary:focus-visible`. Accent override: `--btn-accent`.

**Test infrastructure**:
- `tests/empty-state-primitive.test.js` — SSR with esbuild + `renderToStaticMarkup` via `execFileSync`; regex on output HTML; also asserts reduced-motion in `styles/app.css`. **The mirror for net-new primitive tests.**
- `tests/empty-state-parity.test.js` — parser regex on import shape + render call + canonical copy + closed allowlist (`EMPTY_STATE_CONSUMERS` ≥6, `ERROR_CARD_CONSUMERS` ≥2). **Adoption is load-bearing.**
- `tests/empty-state-consumer-integration.test.js` — SSR integration with action handlers.
- `tests/platform-length-picker.test.js` — characterisation pin on `class="length-option selected"`, slide CSS vars.
- `tests/bundle-byte-budget.test.js` — drives `runClientBundleAudit()` from `scripts/audit-client-bundle.mjs`; ceiling 227,000 B; failure prefix `bundle-budget-exceeded:`.
- `tests/csp-inline-style-budget.test.js` — grep-counted inline style budget; PunctuationSessionScene 27, SpellingSetupScene 7, GrammarSetupScene 2, SubjectRuntimeFallback 1.
- Runner: `scripts/run-node-tests.mjs` (forwarded by `npm test`); Node 22 (`.nvmrc`).

**Surface migration targets** (counts of `<button className="btn ...">` from `src/surfaces/`):
- `HeroQuestCard.jsx` 5, `HeroCampPanel.jsx` 3, `HomeSurface.jsx` 2; setup scenes 1 primary CTA each; `ParentHubSurface.jsx` 1 (+ many in sub-panels); `AdminPanelFrame.jsx` 1 ("Refresh now" stale CTA).
- `HeroQuestCard.jsx` empty branch lines 240–247 (`hero-quest-card--empty` div), loading branch line 25 (returns `null`).
- `AdminPanelFrame.jsx` default slots lines 96–108 (`<p class="small muted admin-panel-frame-placeholder">`); custom-slot `emptyState`/`loadingSkeleton` props supported.
- `PunctuationSetupScene.jsx` line 302 (`borderTopColor: '#B8873F'`), line 328 (`--btn-accent: '#B8873F'`), line 159 (monster-meter inline width).

### Institutional Learnings

- **UI consolidation pioneer-then-pattern** (`docs/solutions/architecture-patterns/ui-consolidation-pioneer-then-pattern-2026-04-29.md`): Grammar is the canonical shape source; Spelling is the third-consumer falsifier; do not extract until 2 concrete consumers + 1 about-to-adopt. **Apply:** Validate Button/Card/ProgressMeter/StatCard against Grammar first, Punctuation second, Spelling third.
- **P1 completion report** (`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`): Characterisation-proof discipline + opt-in locator preservers shipped LengthPicker / HeroWelcome / SetupSidePanel / Punctuation HeroBackdrop in one day with `# fail 0`. **Apply:** Reuse the `actionName` / `prefKey` / `includeDataValue` opt-in pattern. Lift `previousHeroBgRef` into the practice surface above any phase early returns when adopting `HeroBackdrop`. Default `headTag='div'` when wrapping Spelling-origin shells.
- **CSP inline-style budget** (`docs/hardening/csp-inline-style-inventory.md`): every `style={...}` site is grep-counted; dynamic CSS-variable values from server data must be numeric-clamped, allowlisted, or `CSS.escape`-wrapped (see `monsterVisualFrameStyle`). **Apply:** ProgressMeter/StatCard accept dynamic accents through `--subject-accent` / `--progress-value` only via the sanitisation pattern. Do not silently inflate inline-style counts.
- **React port flicker-elimination contract** (`docs/superpowers/specs/2026-04-22-react-port-flicker-elimination-design.md`): `useAppState(selector)` returns primitives or stable refs; `store.batch(fn)` coalesces; Button/Card/ProgressMeter/StatCard pass values via props, never subscribe. **Apply:** Primitives are stateless; reuse `useModalFocusTrap` / `useFocusRestore` rather than rolling new traps. `tests/flicker/session-card-render-count.test.js` ≤2-commits-per-question budget protects against new wrappers leaking re-renders.
- **Admin console SSR characterisation** (`docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md`): SSR characterisation tests pin every panel before extraction (14 tests caught 13 regressions). Pure-function dirty-state guards are testable; `confirm()`-based ones are not. **Apply:** Capture SSR characterisation of AdminPanelFrame default loading/empty/error rendering before U5 migration. Slot composition over model-based prop trees.
- **Punctuation Phase 7 hardening** (`docs/plans/2026-04-27-003-feat-punctuation-phase7-qol-debuggability-hardening-plan.md`): Punctuation has a documented concurrent-mode footgun where `PunctuationSetupScene` emits telemetry and dispatches prefs migration during render; `.punctuation-hero` (Map) vs `.punctuation-strip` (Session/Summary) dual-class trap. **Apply:** Preserve every `data-section`/`data-action` hook on U6; do not introduce render-time effects in shared primitives consumed by Punctuation; add parser tests **before** migration; three-reviewer convergence on hero-class scope.
- **Empty-state allowlist convention**: `tests/empty-state-parity.test.js` enforces a closed allowlist; adoption is load-bearing. **Apply:** U5's HeroQuestCard + AdminPanelFrame migrations update the allowlist atomically with the call-site change.
- **Bundle ceiling at 116 B** (P1 completion report): the predecessor finished with 116 B of 227,000 B headroom. **Apply:** run `tests/bundle-byte-budget.test.js` after every primitive lands; expect to refactor away dead CSS in the same PR.

### External References

External research deliberately skipped — codebase has strong local patterns (12 platform primitives + paper aesthetic + Fraunces tokens + `.btn` system + 4 dedicated test conventions), origin doc cites best practices, and the work is convergence not greenfield.

---

## Key Technical Decisions

- **Button renders existing `.btn` class family first; no new visual language.** Centralise behaviour (props, busy/disabled, locator-forwarding) before changing appearance. Rationale: bundle ceiling, paper-aesthetic continuity, parser-test mirror simplicity.
- **No `index.js` barrel export for `src/platform/ui/`.** Direct imports match repo style and avoid bundler tree-shaking surprises that could push past 227,000 B. The single `ui-contract.js` file is a flat re-export of named primitives only when bundle test proves it does not increase main-bundle bytes; otherwise it stays as documentation.
- **Subject accent flows via `--<subject>-accent` CSS variable, scoped under `:where(.<subject>-...)` remap of `--accent`/`--btn-accent`.** Mirrors the existing Grammar pattern at `styles/app.css:11831`. Punctuation gets `--punctuation-accent` in U6; Spelling deferred unless touched.
- **`SegmentedControl` is a narrow extraction, not a generalisation.** LengthPicker stays canonical; `SegmentedControl` only lands if a third consumer (filter chips) is identified during the unit, otherwise the unit becomes a documentation-only ratification. Pioneer-then-pattern: don't abstract past two consumers.
- **Primitives are stateless; values flow as props.** No `useAppState` calls inside `src/platform/ui/*.jsx`. Reuse `useModalFocusTrap` and `useFocusRestore` for primitives that need them.
- **Locator preservation via opt-in props (`actionName`, `dataAction`, `dataValue`, `dataSection`).** Mirrors LengthPicker's `actionName`/`prefKey`/`includeDataValue`. Forward arbitrary `data-*` so existing Playwright + Admin Debug Bundle selectors survive byte-identical.
- **Token contract gated on changed files only.** `tests/ui-token-contract.test.js` scans changed-file diffs for new raw hex literals outside token definitions, subject metadata fixtures, and tests. Whole-repo purge is deferred.
- **Punctuation `#B8873F` removal is intentional theme unification, not a regression.** Dropping themed inline hex into `var(--btn-accent)` class is **not** pixel-identical in dark mode — document with an inline CSS comment in `styles/app.css` near the Punctuation accent definition.
- **CRLF noise on `monster-asset-manifest.js` is pre-empted with `git checkout --` discipline before commit.** Predecessor's U4 worker touched it despite a generic "don't touch main" directive; explicitly listed in U7 anti-patterns.

---

## Open Questions

### Resolved During Planning

- **Is U6 a hero-image migration?** No — Punctuation already uses `HeroBackdrop`. U6 reframed to: introduce `--punctuation-accent` token, remove inline `#B8873F`, migrate the monster-meter inline-width pattern to `--progress-value`, add documented Punctuation contrast profile, no production subject command/scheduling change.
- **Is U4 a round-length consolidation?** No — LengthPicker already covers all three subjects. U4 reframed to: identify whether a third consumer (filter chips in Hub/Admin) justifies extracting `SegmentedControl` from LengthPicker now, or defers it.
- **Where does the plan file live?** Standard repo path `docs/plans/YYYY-MM-DD-NNN-...` for ce-plan format; origin remains at `docs/plans/james/ui-refactor/ui-refactor-p2.md` as the product contract.
- **Should the Button primitive ship with new visual styling?** No — render-existing-`.btn` first; centralise behaviour. Style changes are a separate plan.

### Deferred to Implementation

- Whether `ui-contract.js` re-export module survives the bundle-byte-budget test or stays as inline documentation only — known after U1 lands.
- Exact filter-chip consumers (Hub / Admin) for U4 SegmentedControl extraction — surface during U4 scoping; if <2 found, U4 collapses to a deferral note in completion report.
- Whether Spelling setup primary CTA migration needs a thin adapter or is direct — known when the Button primitive's `dataAction` forwarding is verified against Spelling's existing parser tests.
- Whether `--spelling-accent` is introduced in U6 — depends on whether Spelling primary CTA migration in U1 surfaces an inline accent that justifies it.
- Final dead-CSS sweep targets to recover bundle bytes — known after U7's bundle-byte-budget run; predecessor recovered ~24 B from `.punctuation-strip`/`.punctuation-hero` removal, similar opportunities likely.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
src/platform/ui/                          existing
  EmptyState.jsx          ◄─── widened adoption (HeroQuestCard, AdminPanelFrame)
  ErrorCard.jsx           ◄─── widened adoption (HeroQuestCard error)
  LoadingSkeleton.jsx     ◄─── widened adoption (AdminPanelFrame default)
  HeroBackdrop.jsx               (already adopted by all 3 subjects)
  LengthPicker.jsx               (already adopted by all 3 subjects)
  SetupSidePanel.jsx
                                  net-new in P2 ──┐
  Button.jsx              ◄────────────────────────┤  U1
  Card.jsx                ◄────────────────────────┤  U2
  SectionHeader.jsx       ◄────────────────────────┤  U2
  ProgressMeter.jsx       ◄────────────────────────┤  U3
  StatCard.jsx            ◄────────────────────────┤  U3
  SegmentedControl.jsx    ◄────────────────────────┘  U4 (conditional)

styles/app.css
  :root tokens (1-138)            preserved
  .btn family (503-524)           Button reuses; no new variants
  --grammar-accent (11831+)       pattern source
  --punctuation-accent            net-new (U6)
  Punctuation theme remap         net-new :where() rules (U6)

Migration vectors:
  HeroQuestCard.jsx  ──► Button (primary)        U1
                     ──► EmptyState / ErrorCard  U5
  AdminPanelFrame.jsx ─► Button (refresh)        U1
                     ──► LoadingSkeleton         U5
                     ──► EmptyState              U5
  Home subject card  ──► ProgressMeter           U3
                     ──► Card / SectionHeader    U2
  Punctuation setup  ──► Button (primary)        U1
                     ──► ProgressMeter (monster) U3
                     ──► --punctuation-accent    U6
  Grammar setup      ──► Button (primary)        U1
  Spelling setup     ──► Button (primary)        U1 (third-consumer falsifier)

Test oracles:
  tests/ui-button-primitive.test.js          (U1, mirrors empty-state-primitive.test.js)
  tests/ui-component-adoption.test.js        (U7, allowlist parity)
  tests/ui-token-contract.test.js            (U7, changed-file scan)
  tests/ui-primary-action-contract.test.js   (U7, one-primary-action rule)
  tests/empty-state-parity.test.js           (existing, allowlist updated U5)
  tests/bundle-byte-budget.test.js           (existing, runs after every unit)
  tests/csp-inline-style-budget.test.js      (existing, runs after U3/U6)
```

---

## Implementation Units

- U0. **Restore P1 evidence and adoption map**

**Goal:** Reconcile origin §2 with repo reality, then publish a P1 evidence addendum documenting what shipped, what tests ran, and what gaps P2 owns. This unblocks every subsequent claim that depends on "post-P1 state".

**Requirements:** R8, R12

**Dependencies:** None.

**Files:**
- Create: `docs/plans/james/ui-refactor/2026-04-29-p1-validation-addendum.md`
- Reference (read-only): `docs/plans/james/ui-refactor/2026-04-29-completion-report.md`, `docs/plans/james/ui-refactor/ui-refactor-p2.md`

**Approach:**
- Acknowledge that the predecessor completion report exists at `docs/plans/james/ui-refactor/2026-04-29-completion-report.md` (origin §2's "missing" view was from a partial bundle).
- List exact commands run during P1 verification, Node version (22 from `.nvmrc`), pass/fail counts, and `node_modules` install state.
- Snapshot current `src/platform/ui/` inventory (12 files with one-line purpose each).
- Adoption map: per-surface table of state-primitive adoption (Hero Mode, Spelling, Grammar, Punctuation, Parent Hub, AdminPanelFrame).
- Known gaps that P2 owns (Button absent, HeroQuestCard hand-rolled empty/error, AdminPanelFrame hand-rolled defaults, Punctuation inline `#B8873F`, no `--punctuation-accent` token).
- Bundle headroom snapshot (116 B / 227,000 B at end of P1; baseline `BASELINE_GZIP_BYTES=206_000` is stale).

**Patterns to follow:**
- Tone matches `docs/plans/james/ui-refactor/2026-04-29-completion-report.md` — claim-safe, evidence-first, list explicit non-claims.

**Test scenarios:**
- *Test expectation: none — this is a documentation artefact. Verification is human review of evidence accuracy against the live tree.*

**Verification:**
- Document exists at the named path with each section populated.
- Every primitive listed under "current inventory" actually exists in `src/platform/ui/` at the documented commit.
- Every "known gap" matches a P2 implementation unit below or an explicit deferral.
- No claim of full design-system completion or unverified test passes.

---

- U1. **Shared `Button` primitive + 5 high-signal CTA migrations**

**Goal:** Net-new `Button.jsx` that wraps the existing `.btn` class family, centralises busy/disabled/locator behaviour, and migrates 5 high-signal primary actions without changing visual hierarchy or copy.

**Requirements:** R1, R7, R9, R10, R11

**Dependencies:** U0 (so adoption map exists before counting Button consumers).

**Files:**
- Create: `src/platform/ui/Button.jsx`
- Modify: `src/surfaces/home/HeroQuestCard.jsx`, `src/surfaces/home/HomeSurface.jsx`, `src/subjects/grammar/components/GrammarSetupScene.jsx`, `src/subjects/punctuation/components/PunctuationSetupScene.jsx`, `src/surfaces/hubs/AdminPanelFrame.jsx`
- Test: `tests/ui-button-primitive.test.js` (net-new), `tests/ui-component-adoption.test.js` (net-new — partial, completed in U7)

**Approach:**
- Props: `variant` (`primary`/`secondary`/`ghost`/`good`/`warn`/`bad`), `size` (`sm`/`md`/`lg`/`xl` with `md` default rendering as base `.btn`), `busy`, `disabled`, `dataAction`, `dataValue`, `startIcon`, `endIcon`, plus arbitrary `data-*` forward via rest props.
- `type="button"` default; visible label required unless `aria-label` is supplied (asserted in primitive test).
- Busy state sets `aria-busy="true"` and `disabled` together; reuses `src/platform/react/use-submit-lock.js` if the consumer opts in.
- Renders existing `.btn` classes only — no new CSS in this unit.
- Migration order: Grammar setup primary CTA first (canonical shape source per pioneer-then-pattern); HeroQuestCard primary; Punctuation setup primary; Home hero primary/ghost; AdminPanelFrame "Refresh now" stale CTA. Spelling setup primary deferred to U7's third-consumer falsifier pass.
- No copy changes. No visual hierarchy changes.

**Execution note:** Add the parser/SSR primitive test (`tests/ui-button-primitive.test.js`) **before** the first migration call site, so the test fails loudly if `Button.jsx` is missing or violates the contract.

**Technical design:** *Directional only.*

```
<Button
  variant="primary"
  size="xl"
  busy={isStarting}
  dataAction="grammar-start"
  onClick={handleStart}
>
  Start round
</Button>

renders →

<button
  type="button"
  className="btn primary xl"
  aria-busy={isStarting ? 'true' : undefined}
  disabled={isStarting}
  data-action="grammar-start"
  onClick={handleStart}
>
  Start round
</button>
```

**Patterns to follow:**
- Locator preservation via opt-in props mirrors `src/platform/ui/LengthPicker.jsx` (`actionName`/`prefKey`/`includeDataValue`).
- Primitive test mirrors `tests/empty-state-primitive.test.js` (esbuild + `renderToStaticMarkup` via `execFileSync` + regex on output HTML).
- Existing busy/disabled pairing visible at `src/surfaces/home/HeroQuestCard.jsx:228-229`, `src/surfaces/hubs/AdminPanelFrame.jsx:96`, `src/subjects/spelling/components/SpellingSessionScene.jsx:318,330`.

**Test scenarios:**
- *Happy path:* Renders `<button>` with `type="button"`, declared variant/size as `.btn` classes, and the children text. Covers AE for one-primary-action visibility.
- *Happy path:* Forwards `data-action`, `data-value`, and arbitrary `data-*` attributes byte-identical to a hand-rolled equivalent.
- *Edge case:* When `busy` is true, output has `aria-busy="true"` and `disabled` set together; the click handler is not invoked while busy (integration scenario).
- *Edge case:* When `disabled` is true without `busy`, output has `disabled` but not `aria-busy`.
- *Edge case:* `startIcon` and `endIcon` slots render in the correct DOM order; missing slot produces no whitespace artefact.
- *Error path:* Missing both visible children and `aria-label` triggers a parser-test assertion failure (developer ergonomics; not a runtime throw).
- *Integration:* HeroQuestCard primary action dispatches the same `data-action="hero-start"` selector that existing Playwright tests rely on; selector survives byte-identical.
- *Integration:* AdminPanelFrame "Refresh now" CTA, when migrated, still triggers the existing stale-data refresh handler with the same telemetry shape.
- *Integration:* `aria-busy` toggling under `useSubmitLock` does not introduce extra render cycles beyond the existing baseline (verified via `tests/flicker/session-card-render-count.test.js` if the surface is covered, else via component-level render-count assertion).

**Verification:**
- `node --test tests/ui-button-primitive.test.js` passes.
- `node --test tests/bundle-byte-budget.test.js` passes — bundle still under 227,000 B.
- All 5 migrated surfaces render byte-identical `data-action` selectors and visual hierarchy via manual diff or existing parser tests.
- No new `useAppState` import inside `src/platform/ui/Button.jsx`.

---

- U2. **`Card` and `SectionHeader` primitives + low-risk wrapper migrations**

**Goal:** Net-new `Card.jsx` and `SectionHeader.jsx` that wrap the existing `.card`/`.soft`/`border-top` and section-heading conventions; migrate 2–3 low-risk wrapper sites to prove the slot-composition shape without disturbing dense content surfaces.

**Requirements:** R3, R6, R10

**Dependencies:** U1 (so primitive testing rhythm is established).

**Files:**
- Create: `src/platform/ui/Card.jsx`, `src/platform/ui/SectionHeader.jsx`
- Modify: `src/surfaces/subject/SubjectRuntimeFallback.jsx`, `src/surfaces/hubs/AccessDeniedCard.jsx`, optionally one Home card surface (e.g., `src/surfaces/home/HomeSurface.jsx` subject card frame) if low risk
- Test: `tests/ui-component-adoption.test.js` (extend net-new), `tests/empty-state-primitive.test.js` (extend with Card SSR coverage if convenient)

**Approach:**
- `Card` props: `tone` (`default`/`soft`/`warning`/`error`), `accent` (CSS custom property string, e.g., `"var(--punctuation-accent)"` — passed as `style={{ '--card-accent': accent }}`), `as` element override (`section`/`article`/`div`), and slot composition via children (no heavy DSL).
- `SectionHeader` props: `eyebrow`, `title`, `subtitle`, `trailingAction` (slot, often a `Button`), `statusChip` (slot). Heading element via `as`/`level` (`h2` default).
- Move dynamic `borderTopColor` from `style={{ borderTopColor: '#B8873F' }}` to `style={{ '--card-accent': 'var(--punctuation-accent)' }}` + a CSS rule using `--card-accent`. The CSS rule is co-located in `styles/app.css` near the existing `.card` definitions. **U6 lands the actual `--punctuation-accent` token; U2 only uses Grammar's `--grammar-accent` as a working test case.**
- No prop-tree DSL. No visual regression — Card renders existing `.card` classes.

**Patterns to follow:**
- Slot composition mirrors AdminPanelFrame's existing slot props (`emptyState`/`loadingSkeleton`).
- SSR test mirrors `tests/empty-state-primitive.test.js`.

**Test scenarios:**
- *Happy path:* `Card` renders existing `.card` class with declared `tone` modifier and the children content.
- *Happy path:* `SectionHeader` renders eyebrow / title / subtitle / trailingAction in the expected DOM order with semantic landmarks (`<header>` + heading element).
- *Edge case:* `Card` with no `accent` does not emit a `--card-accent` CSS variable.
- *Edge case:* `Card` with `as="article"` produces an `<article>` element while preserving `.card` class.
- *Integration:* `SubjectRuntimeFallback` post-migration still renders an `ErrorCard` inside the `Card` wrapper without changing the existing accessibility tree (semantic structure preserved).
- *Integration:* `SectionHeader`'s `trailingAction` slot accepts a `Button` and forwards focus visibility (focus ring still visible on tab).

**Verification:**
- `node --test tests/ui-component-adoption.test.js` passes (extended).
- `node --test tests/bundle-byte-budget.test.js` passes — bundle still under 227,000 B.
- Migrated surfaces preserve all existing `data-section` / `aria-label` / heading-level landmarks.

---

- U3. **`ProgressMeter` and `StatCard` primitives + Punctuation monster meter + Home subject-card meter**

**Goal:** Net-new `ProgressMeter.jsx` and `StatCard.jsx`; migrate Punctuation monster meters and Home subject-card progress to use them; Punctuation setup progress row migrates to StatCard. No subject engine derives progress from the UI.

**Requirements:** R3, R10, R11

**Dependencies:** U2 (for `Card` composition where StatCard wraps a Card).

**Files:**
- Create: `src/platform/ui/ProgressMeter.jsx`, `src/platform/ui/StatCard.jsx`
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx` (monster meter + progress row), `src/surfaces/home/HomeSurface.jsx` (subject-card meters), `styles/app.css` (introduce `--progress-value` CSS custom property and the rule that drives `width: calc(var(--progress-value) * 1%)` or transform scale)
- Test: `tests/ui-component-adoption.test.js` (extend), `tests/csp-inline-style-budget.test.js` (regression check: PunctuationSetupScene inline-style count must not increase)

**Approach:**
- `ProgressMeter` props: `value` (numeric, clamped to `[0, max]` inside the primitive), `max` (default 100), `label` (accessible name; required unless `aria-labelledby` supplied), `showValueText` (boolean), `accent` (CSS variable name as string, e.g., `'var(--subject-accent)'`), `variant` (`bar` default; `star` and `percentage` for parity with existing meters).
- `StatCard` props: `label`, `value`, `caption`, optional `tone`, optional `progress` (renders embedded `ProgressMeter`). Display-only — no derivation.
- Dynamic width via `style={{ '--progress-value': clampedNumeric }}` (a numeric value, not `width: ${pct}%`). The CSS rule lives in `styles/app.css` and reads `--progress-value` to drive width or transform. **This is the CSP inline-style sanitisation pattern — value is numeric-clamped inside the primitive, not interpolated from server data.**
- Migration sites:
  - `PunctuationSetupScene.jsx:159` (monster meter inline width) → `<ProgressMeter value={clampedPct} accent="var(--punctuation-accent)" label="..." />`. **Punctuation accent token lands in U6**; U3 uses `--subject-accent` fallback or `--brand`.
  - `PunctuationSetupScene.jsx` progress row → `StatCard` × 3 ("Due today" / "Wobbly" / "Grand Stars" or equivalent — copy preserved verbatim).
  - `HomeSurface.jsx` subject-card meter (per `src/surfaces/home/data.js`) → `ProgressMeter`.
- Grammar today-cards: evaluate but migrate only if it does not disturb existing tests; default is "evaluate then defer to follow-up plan".
- Spelling progress: do not touch unless trivial.

**Execution note:** Add `tests/csp-inline-style-budget.test.js` regression assertion **before** modifying `PunctuationSetupScene.jsx` so any inadvertent inline-style inflation fails fast.

**Patterns to follow:**
- Numeric clamping pattern: see `monsterVisualFrameStyle` (referenced in `docs/hardening/csp-inline-style-inventory.md`).
- Existing `--star-fill` / Star meter visual rhythm — preserve in `variant="star"`.
- Reduced-motion: any animated fill reuses `prefers-reduced-motion` rules already in `styles/app.css` (lines 140, 1074, 1370, 2065, 2520, 3252, 3913, 5224, 5297).

**Test scenarios:**
- *Happy path:* `ProgressMeter` with `value=37` renders a numeric `--progress-value: 37` in the inline style and the accessible `aria-valuenow="37"` / `aria-valuemax="100"` ARIA contract.
- *Happy path:* `StatCard` with `progress` slot embeds `ProgressMeter` and preserves the label/value/caption hierarchy.
- *Edge case:* `value > max` clamps to `max`; `value < 0` clamps to 0; non-numeric `value` falls back to 0 without throwing.
- *Edge case:* `value = max` produces `aria-valuenow === aria-valuemax`; visual fill saturates without overflow.
- *Edge case:* `prefers-reduced-motion: reduce` cancels the fill transition (CSS rule asserted via `styles/app.css` regex in the primitive test).
- *Error path:* Missing `label` and `aria-labelledby` together triggers a parser-test failure (developer ergonomics; not a runtime throw).
- *Integration:* Punctuation monster meter migration does not change the visible width rendered for any value in the range `[0, 100]` (visual diff via SSR snapshot or manual review).
- *Integration:* `tests/csp-inline-style-budget.test.js` PunctuationSetupScene count is **less than or equal to** pre-migration count (the migration removes inline `width: ${pct}%` in favour of a numeric `--progress-value`).
- *Integration:* `tests/flicker/session-card-render-count.test.js` (or equivalent) shows no extra renders introduced by `ProgressMeter` consumers.

**Verification:**
- `node --test tests/ui-component-adoption.test.js` passes.
- `node --test tests/csp-inline-style-budget.test.js` passes; PunctuationSetupScene count stable or reduced.
- `node --test tests/bundle-byte-budget.test.js` passes — bundle still under 227,000 B.
- Manual visual diff: Punctuation monster meter and Home subject-card meter unchanged at representative values (0, 25, 50, 75, 100).

---

- U4. **`SegmentedControl` extraction (conditional)**

**Goal:** Identify whether ≥2 filter-chip / segmented-control consumers (beyond the round-length pickers already covered by `LengthPicker`) exist. If yes, extract a thin shared `SegmentedControl.jsx`; if no, ratify LengthPicker as canonical and defer extraction to a future plan.

**Requirements:** R4

**Dependencies:** None on plan-internal units; depends on a scoping pass through `src/surfaces/hubs/` and `src/surfaces/home/`.

**Files:**
- Scoping pass: read `src/surfaces/hubs/AdminPanelFrame.jsx`, `src/surfaces/hubs/AdminSectionTabs.jsx`, `src/surfaces/hubs/ParentHubSurface.jsx`, plus any status-filter chip groups under `src/surfaces/hubs/Admin*Section.jsx`.
- If extraction proceeds: Create `src/platform/ui/SegmentedControl.jsx`; migrate identified consumers; refactor `src/platform/ui/LengthPicker.jsx` to consume `SegmentedControl` internally **only if** byte-identical SSR output is provable (predecessor test `tests/platform-length-picker.test.js` must remain green).
- If extraction defers: append a "deferred" note to the U0 addendum and the U7 completion report.
- Test: `tests/ui-segmented-control.test.js` (only if extraction proceeds, mirrors `tests/platform-length-picker.test.js`).

**Approach:**
- Scoping criteria for "is this a segmented control?": role is choice between mutually exclusive options that are co-located, displayed inline, and dispatch immediately on selection (no submit step). Status filter chip groups in Hub/Admin sections likely qualify; pure dropdowns and tabs do not.
- If extracting: `SegmentedControl` semantics are `role="radiogroup"`, `role="radio"` per option, `aria-checked`, arrow-key navigation if implemented (else native button focus order documented). Disabled state. Selected slider CSS variable (mirrors LengthPicker's `--option-count` / `--selected-index`). Caller-owned dispatch and telemetry. **Locator preservation via opt-in `actionName`/`prefKey`/`includeDataValue` props matching LengthPicker.**
- If `LengthPicker` is refactored to consume `SegmentedControl`, `tests/platform-length-picker.test.js` must produce **identical SSR output** before and after — verified by running the existing test before any change.
- Pioneer-then-pattern: do not extract until 2 concrete consumers + 1 about-to-adopt are identified. If only 0–1 found, defer.

**Execution note:** Run the existing `tests/platform-length-picker.test.js` baseline **before** any LengthPicker refactor; capture the SSR string output to disk for byte-identical comparison post-refactor.

**Patterns to follow:**
- Radio-group semantics in `src/platform/ui/LengthPicker.jsx`.
- Locator preservation pattern from LengthPicker (`actionName`/`prefKey`/`includeDataValue`).

**Test scenarios:**
- *Scoping (this unit's deliverable, even if extraction defers):* Document of identified candidate sites with file paths and one-line reason for include / exclude.
- *If extraction proceeds — happy path:* `SegmentedControl` renders `role="radiogroup"` with each option as `role="radio"` and the selected option carries `aria-checked="true"`.
- *If extraction proceeds — edge case:* Disabled state disables all options and removes them from the focus tab order; `aria-disabled="true"` on the radiogroup.
- *If extraction proceeds — integration:* `LengthPicker` SSR output is byte-identical pre/post refactor (test captures pre-refactor output, asserts post-refactor matches).
- *If extraction proceeds — integration:* Migrated filter-chip consumers preserve their existing `data-action` / `data-pref` / `data-value` Playwright + Admin Debug Bundle locators.
- *If extraction defers:* No test changes; the deferral is documented in U7's completion report.

**Verification:**
- Scoping pass produces a numbered list of candidate sites with disposition.
- If extraction proceeds: `node --test tests/ui-segmented-control.test.js` and `node --test tests/platform-length-picker.test.js` both pass.
- If extraction defers: U7 completion report includes the deferral with reason.

---

- U5. **Widen `EmptyState` / `ErrorCard` / `LoadingSkeleton` adoption**

**Goal:** Migrate HeroQuestCard empty/error branches to `EmptyState` / `ErrorCard`, AdminPanelFrame default loading to `LoadingSkeleton`, and AdminPanelFrame default empty to `EmptyState`. Update the closed allowlist in `tests/empty-state-parity.test.js` so adoption becomes load-bearing.

**Requirements:** R2, R6, R9

**Dependencies:** U2 (so `Card` slot composition is available where AdminPanelFrame default slots wrap state primitives in cards). U1 not strictly required but the Refresh CTA migration in U1 reduces churn on the same file.

**Files:**
- Modify: `src/surfaces/home/HeroQuestCard.jsx` (replace `hero-quest-card--empty` div lines 240–247 with `EmptyState`; add error branch using `ErrorCard`), `src/surfaces/hubs/AdminPanelFrame.jsx` (replace default `<p class="small muted admin-panel-frame-placeholder">` lines 96–108 with `LoadingSkeleton` and `EmptyState`)
- Modify: `tests/empty-state-parity.test.js` (extend `EMPTY_STATE_CONSUMERS` and `ERROR_CARD_CONSUMERS` allowlists with new entries + canonical-copy regex per consumer)
- Reference: `tests/empty-state-consumer-integration.test.js` (extend if action-handler wiring is added)

**Approach:**
- HeroQuestCard empty branch: replace bespoke `.hero-quest-card--empty` with `<EmptyState title="..." body="..." />`. Copy follows the canonical three-part pattern: what happened (no launchable task), whether progress is safe (it is), what action is available (start a subject from below).
- HeroQuestCard error branch: net-new (currently returns early); add `<ErrorCard data-error-code="hero-quest-load" onRetry={...} />` when the data fetch fails.
- AdminPanelFrame default loading slot: replace `<p>Loading panel data...</p>` with `<LoadingSkeleton rows={3} />`. Custom-slot override (`loadingSkeleton` prop) still wins.
- AdminPanelFrame default empty slot: replace `<p>No data available.</p>` with `<EmptyState title="..." body="..." />`. Custom-slot override (`emptyState` prop) still wins.
- Canonical copy decided per-consumer in the allowlist test; copy itself written in the source file.
- **SSR characterisation:** capture AdminPanelFrame default loading/empty/error rendering before migration via a regex scan in a temporary script; assert post-migration output preserves the same DOM shape (sans the migrated branch). This mirrors the admin SSR characterisation pattern.

**Execution note:** Extend `tests/empty-state-parity.test.js` allowlist and copy regex **first** (failing); then migrate; then verify it passes. This is the "characterisation-proof" discipline from the P1 completion report.

**Patterns to follow:**
- `src/surfaces/hubs/ParentHubSurface.jsx` (already adopted `EmptyState` at lines 90, 102) is the canonical adopter.
- `src/subjects/spelling/components/SpellingWordBankScene.jsx:337` shows `EmptyState` with action wiring.
- Canonical copy regex pattern from `tests/empty-state-parity.test.js` existing entries (e.g., `/No words yet/`, `/Your progress is saved/`).

**Test scenarios:**
- *Happy path:* HeroQuestCard with no launchable task renders `<EmptyState>` with the canonical title/body/(optional CTA) and preserves `role="status"`.
- *Happy path:* HeroQuestCard error branch renders `<ErrorCard data-error-code="hero-quest-load">` when the data hook surfaces an error.
- *Happy path:* AdminPanelFrame default loading slot renders `<LoadingSkeleton>` with `prefers-reduced-motion` carve-out preserved.
- *Happy path:* AdminPanelFrame default empty slot renders `<EmptyState>` with canonical copy.
- *Edge case:* AdminPanelFrame consumer that supplies a custom `emptyState` prop still uses the custom node (default is overridden, not always rendered).
- *Edge case:* HeroQuestCard during loading still returns `null` (or migrates to `<LoadingSkeleton>` if low risk; decide during implementation).
- *Integration:* `tests/empty-state-parity.test.js` allowlist now includes HeroQuestCard and AdminPanelFrame entries; the test fails if a future commit removes the import or render call.
- *Integration:* `tests/empty-state-consumer-integration.test.js` extended to cover HeroQuestCard error retry handler if one is added.

**Verification:**
- `node --test tests/empty-state-parity.test.js` passes with the extended allowlist.
- `node --test tests/empty-state-primitive.test.js` passes (existing primitive tests unchanged).
- `node --test tests/bundle-byte-budget.test.js` passes — bundle still under 227,000 B.
- Manual SSR verification: AdminPanelFrame default rendering matches captured baseline (or differs only in the migrated branch).

---

- U6. **Punctuation token unification + accent removal**

**Goal:** Introduce `--punctuation-accent` (+ ink/soft/border/dark-mode) following the Grammar pattern; remove inline `#B8873F` from `PunctuationSetupScene.jsx`; document the dark-mode visual change as intentional theme unification, not a regression. Preserve every `data-section`/`data-action` hook and the existing journey tests.

**Requirements:** R3, R5, R11, R12

**Dependencies:** U1 (Punctuation primary CTA already migrated to `Button`, so the inline `--btn-accent` is on a `Button` consumer — clean removal). U2 (`Card` composition so `borderTopColor` migration uses `--card-accent`). U3 (`ProgressMeter` consuming `--subject-accent` is already in place for the monster meter).

**Files:**
- Modify: `styles/app.css` (add `--punctuation-accent`, `--punctuation-accent-ink`, `--punctuation-accent-soft`, `--punctuation-accent-border` plus `:where(.punctuation-...) { --accent: ...; --btn-accent: ...; --card-accent: ...; --subject-accent: ... }` remap; mirror Grammar at line 11831; add dark-mode pair)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx` (remove `style={{ borderTopColor: '#B8873F' }}` line 302; remove `style={{ '--btn-accent': '#B8873F' }}` line 328; ensure outer wrapper carries the `.punctuation-...` class for the `:where()` remap to apply)
- Modify (if needed for hero-class trap): inspect Punctuation Map / Session / Summary scenes for `.punctuation-hero` vs `.punctuation-strip` dual-class usage; document any cleanup
- Reference: `styles/app.css:11831-11900` (Grammar accent pattern)

**Approach:**
- Pick a Punctuation accent value matching the existing visual brand (`#B8873F` is the current inline; verify against the design tokens — if `#B8873F` is "correct", that's the value).
- Define `--punctuation-accent` (+ -ink/-soft/-border) in `:root` and a dark-mode counterpart in the existing dark scheme block.
- Add `:where(.punctuation-..., .punctuation-...) { --accent: var(--punctuation-accent); --btn-accent: var(--punctuation-accent); --card-accent: var(--punctuation-accent); --subject-accent: var(--punctuation-accent); }` near the Grammar block.
- Remove inline `#B8873F` from `PunctuationSetupScene.jsx`. Verify the outer wrapper carries the `.punctuation-...` class needed for the remap.
- **Three-reviewer convergence on hero-class scope:** before declaring U6 complete, three independent reviewers (or three independent passes) must confirm `.punctuation-hero` (Map scene) vs `.punctuation-strip` (Session/Summary) are correctly scoped — the predecessor caught this dual-class trap, and U6 must not regress it.
- Inline CSS comment near the Punctuation accent block: documents the intentional theme unification (drops themed inline hex, value flows via token; dark mode now follows the dark-mode token pair, not the original inline hex — by design).

**Execution note:** Add a parser test in `tests/ui-token-contract.test.js` (extended in U7) that asserts no raw `#B8873F` remains in `src/subjects/punctuation/**/*.jsx`. Run it **before** the source change so the failing test gates the migration.

**Patterns to follow:**
- Grammar accent block at `styles/app.css:11831-11900`.
- `:where(...) { --accent: ... }` remap pattern.
- Dark-mode token pair convention.

**Test scenarios:**
- *Happy path:* `styles/app.css` contains `--punctuation-accent` and the `:where(.punctuation-...)` remap; CSS regex test passes.
- *Happy path:* `src/subjects/punctuation/components/PunctuationSetupScene.jsx` contains zero raw `#B8873F` literals (parser test).
- *Happy path:* The migrated outer section's `borderTopColor` now flows from `var(--card-accent)` (or equivalent), not an inline hex.
- *Edge case:* Dark-mode rendering uses the dark-mode token pair; light-mode uses the light pair. Documented inline CSS comment confirms intentionality.
- *Integration:* All existing Punctuation journey tests (`tests/punctuation-*.test.js`) pass without modification.
- *Integration:* `tests/csp-inline-style-budget.test.js` PunctuationSetupScene count drops by ≥2 (the two removed inline hex sites).
- *Integration:* No `data-section` / `data-action` hook on PunctuationSetupScene is renamed or removed (parser test asserts the existing list is preserved).
- *Integration:* `.punctuation-hero` and `.punctuation-strip` class usage matches the documented Map vs Session/Summary scoping; three-reviewer pass logs are recorded in U7 completion report.

**Verification:**
- `node --test tests/ui-token-contract.test.js` passes.
- `node --test tests/csp-inline-style-budget.test.js` passes; Punctuation count reduced.
- `node --test tests/bundle-byte-budget.test.js` passes — bundle still under 227,000 B (CSS additions plus source removals should be ~net-zero or net-negative).
- Manual visual diff: Punctuation setup hero / primary CTA / monster meter render with the same accent in light mode as before; dark mode follows the new token pair.
- Three-reviewer convergence log entry in U7 completion report.

---

- U7. **Guardrails, completion report, and dead-CSS sweep**

**Goal:** Land the four parser-level guardrails (`tests/ui-button-primitive.test.js`, `tests/ui-component-adoption.test.js`, `tests/ui-token-contract.test.js`, `tests/ui-primary-action-contract.test.js`); execute the third-consumer falsifier pass (Spelling setup primary CTA migration to `Button`); sweep dead CSS to recover bundle bytes; write the completion report.

**Requirements:** R1, R7, R8, R9, R12

**Dependencies:** U1, U2, U3, U5, U6 (U4 if extracted, otherwise its deferral note is referenced).

**Files:**
- Create: `tests/ui-button-primitive.test.js` (finalised), `tests/ui-component-adoption.test.js` (finalised), `tests/ui-token-contract.test.js`, `tests/ui-primary-action-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSetupScene.jsx` (migrate primary CTA to `Button` — third-consumer falsifier)
- Modify: `styles/app.css` (sweep dead CSS uncovered by the migrations — predecessor recovered ~24 B from `.punctuation-strip`/`.punctuation-hero` removal; similar opportunities likely)
- Create: `docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`

**Approach:**
- `tests/ui-primary-action-contract.test.js`: parser regex asserts each named surface (Home / Hero Quest / Spelling setup / Grammar setup / Punctuation setup) renders exactly one element with `<Button variant="primary" size="xl"` (or the canonical primary signature) above-the-fold. Allowlist of surfaces, regex of the primary signature.
- `tests/ui-token-contract.test.js`: parser regex on changed-file diffs (or a curated list of `src/platform/ui/**` + `src/subjects/punctuation/**` + `src/surfaces/home/**`) asserts no new raw hex literals outside token definitions, subject metadata fixtures, and tests. Whole-repo purge is **not** asserted.
- `tests/ui-button-primitive.test.js`: SSR + esbuild + `renderToStaticMarkup` mirror of `tests/empty-state-primitive.test.js`. Asserts variant/size class composition, busy/disabled/aria-busy contract, locator forwarding, missing-label warning.
- `tests/ui-component-adoption.test.js`: closed allowlist of `Button` / `Card` / `SectionHeader` / `ProgressMeter` / `StatCard` consumers + import-shape regex per consumer. Adoption is load-bearing.
- Spelling third-consumer migration: migrate the primary CTA in `SpellingSetupScene.jsx` to `Button`. This is the falsifier — if the Button API has gaps, Spelling will surface them. Roll back to the current shape if migration breaks `tests/spelling-*.test.js`.
- Dead CSS sweep: grep `styles/app.css` for class names no longer used after U2/U6 migrations (e.g., `.hero-quest-card--empty` if the U5 EmptyState migration retired it; `.admin-panel-frame-placeholder`; any Punctuation classes superseded by tokens). Remove them. Run `tests/bundle-byte-budget.test.js` after each removal.
- Completion report (`docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`): changed-file table; primitive adoption table; before/after risk notes; exact command output summary; known non-migrated surfaces; screenshots or visual QA notes when available; explicit statement of what P2 does **not** claim. Tone matches `docs/plans/james/ui-refactor/2026-04-29-completion-report.md`.

**Execution note:** Run `tests/bundle-byte-budget.test.js` **after every single migration commit**, not only at the end. The 116 B headroom from P1 will be exhausted quickly without continuous attention.

**Patterns to follow:**
- `tests/empty-state-parity.test.js` for closed-allowlist + canonical-copy parser style.
- `tests/empty-state-primitive.test.js` for SSR primitive coverage.
- `docs/plans/james/ui-refactor/2026-04-29-completion-report.md` for completion report tone.

**Test scenarios:**
- *Happy path:* `tests/ui-primary-action-contract.test.js` passes — every named surface has exactly one primary CTA rendered via `Button`.
- *Happy path:* `tests/ui-token-contract.test.js` passes — no new raw hex literals on changed files.
- *Happy path:* `tests/ui-component-adoption.test.js` passes — every primitive has at least one declared consumer; allowlist regex matches.
- *Edge case:* A subsequent commit that re-introduces `<button className="btn primary xl">` on a covered surface fails `tests/ui-primary-action-contract.test.js`.
- *Edge case:* A commit that adds a raw hex literal to a covered file fails `tests/ui-token-contract.test.js`.
- *Integration:* Spelling setup primary CTA migration to `Button` — `tests/spelling-*.test.js` and Spelling parser tests pass; if they don't, rollback is documented in the completion report (third-consumer falsifier surfacing real gaps).
- *Integration:* `npm test` passes locally (Node 22, `node_modules` installed).
- *Integration:* `npm run build` passes.
- *Integration:* `npm run audit:client` passes.
- *Integration:* `node --test tests/bundle-byte-budget.test.js` passes — final bundle still under 227,000 B.
- *Covers AE for §11 (completion report wording guard):* report does not contain forbidden claims ("the design system is finished", "all colours and inline styles are tokenised", "full verification passed" without command evidence).

**Verification:**
- All four net-new guardrail tests pass.
- Spelling third-consumer migration is either landed (with all Spelling tests green) or documented as rolled back.
- `node --test tests/bundle-byte-budget.test.js` passes — final bundle byte count recorded in the completion report.
- `npm test`, `npm run build`, `npm run audit:client`, `npm run check` all run; pass/fail recorded with Node version and `node_modules` install state.
- Completion report at the named path includes every required section.
- Three-reviewer convergence log for U6 hero-class scope is recorded.
- Pre-commit `git checkout --` discipline executed on `src/subjects/monsters/monster-asset-manifest.js` to pre-empt CRLF noise.

---

## System-Wide Impact

- **Interaction graph:** Net-new primitives are leaves of the import graph (consumed by surfaces/subjects, not consumers of them). No store subscriptions inside primitives — values flow as props from screen components. `Button`'s busy state may opt into `useSubmitLock`, which is the canonical existing busy hook; this does not introduce a new lock surface. State primitives (`EmptyState` / `ErrorCard` / `LoadingSkeleton`) keep their existing `role="status"` and reduced-motion semantics; the migration in U5 only changes the wrapping markup, not the primitive contracts.
- **Error propagation:** HeroQuestCard error branch is net-new. Error data flows through the existing data hook; the migration adds an `ErrorCard` render path for the failure state that previously rendered nothing. AdminPanelFrame consumers that supply their own `emptyState`/`loadingSkeleton` prop are unaffected; only the default fallback changes.
- **State lifecycle risks:** None inside primitives (they are stateless). Migration sites that wrap existing busy/disabled/loading state must preserve the original useEffect sequencing — particularly PunctuationSetupScene, which has a documented concurrent-mode footgun where it emits telemetry and dispatches prefs migration during render. **U6 must not introduce render-time effects in shared primitives that PunctuationSetupScene consumes.**
- **API surface parity:** `Button`'s `data-action` / `data-value` / arbitrary `data-*` forwarding preserves Playwright + Admin Debug Bundle locators byte-identical. `LengthPicker`'s existing API is preserved entirely; if U4 extracts `SegmentedControl`, LengthPicker becomes a thin adapter with byte-identical SSR output.
- **Integration coverage:** SSR characterisation tests for AdminPanelFrame default branches (captured before U5 migration) catch regressions that primitive-level tests miss. The `tests/flicker/session-card-render-count.test.js` ≤2-commits-per-question budget protects against new wrappers leaking re-renders. The `tests/csp-inline-style-budget.test.js` ratchet catches inline-style inflation.
- **Unchanged invariants:**
  - All existing `data-section` / `data-action` / `data-value` selectors on migrated surfaces.
  - Existing `EmptyState` / `ErrorCard` / `LoadingSkeleton` / `HeroBackdrop` / `LengthPicker` / `SetupSidePanel` APIs.
  - `useAppState` / `store.batch` / `useSubmitLock` / `useModalFocusTrap` / `useFocusRestore` contracts.
  - Subject engine, marking, scheduling, Worker command authority.
  - Star semantics, Hero economy, content generation, authentication, persistence.
  - Paper aesthetic (Fraunces, `--font-display`, `--bg`/`--panel`/`--line` palette).
  - Existing reduced-motion carve-outs in `styles/app.css`.

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Bundle exceeds 227,000 B during migration | High | High | Run `tests/bundle-byte-budget.test.js` after every commit. Sweep dead CSS in U7 (predecessor recovered ~24 B from `.punctuation-strip`/`.punctuation-hero`). Avoid broad barrel imports in `ui-contract.js`. Direct imports only. |
| Spelling parity regression (third-consumer falsifier) | Med | High | Spelling migrates last in U7. If `tests/spelling-*.test.js` fails, roll back the Spelling migration; document as Button API gap; log in completion report rather than pretending the Button covers all consumers. |
| Punctuation journey regression (recent UX hardening) | Med | High | Preserve every `data-section` / `data-action` hook (parser test in U7). Add Punctuation parser tests **before** U6 token migration. Three-reviewer convergence on `.punctuation-hero` vs `.punctuation-strip` scope. No render-time effects in shared primitives consumed by Punctuation. |
| AdminPanelFrame default-slot consumers regress | Med | Med | Capture SSR characterisation of default loading/empty/error branches **before** U5 migration. Custom-slot override (`emptyState`/`loadingSkeleton` props) preserved as the override-wins contract. Slot composition over model-based prop trees. |
| LengthPicker SSR diverges if U4 extracts `SegmentedControl` | Low | High | Run `tests/platform-length-picker.test.js` **before** any LengthPicker refactor; capture SSR string; assert byte-identical post-refactor. If divergence, defer extraction to a future plan. |
| Token false confidence (whole-repo claim) | Med | Low | `tests/ui-token-contract.test.js` gates **changed files only**. Completion report explicitly says whole-repo token purity is **not** claimed. Top hex-literal offenders (`GrammarCalibrationPanel.css` 18, `AdminProductionEvidencePanel.jsx` 15) are out of scope. |
| Dark-mode visual change in Punctuation (intentional, but reads as regression) | Med | Low | Document inline CSS comment near `--punctuation-accent` definition. Note in completion report: dropping themed inline hex into token-driven theme is intentional theme unification, **not** pixel-identical. |
| `monster-asset-manifest.js` CRLF noise on commit | High | Low | Predecessor's U7 anti-pattern. Pre-commit `git checkout --` on the file. Listed in U7 verification checklist. |
| Concurrent-mode footgun in PunctuationSetupScene re-triggered | Low | Med | No render-time effects in any new primitive Punctuation consumes. Migration code paths inspected against the Punctuation Phase 7 hardening doc. |
| `ui-contract.js` barrel pulls adult code into main bundle | Med | Med | Run `tests/bundle-byte-budget.test.js` and `npm run audit:client` after introducing the file. If bundle grows, drop the barrel and use direct imports. |
| P1 evidence reconciliation surfaces new gaps | Med | Low | U0 produces an addendum that lists gaps explicitly. If gaps exceed the P2 scope, completion report defers them with reasons. |

---

## Phased Delivery

### Phase A — Foundation (no migrations yet)

- U0 — P1 evidence addendum
- U1 — Button primitive + 5 high-signal CTAs (Grammar first as canonical shape source)

Bundle check after each commit. Phase A deliberately keeps Spelling untouched.

### Phase B — Composition primitives + state widening

- U2 — Card + SectionHeader + low-risk wrappers
- U5 — EmptyState / ErrorCard / LoadingSkeleton adoption widened
- U3 — ProgressMeter + StatCard + Punctuation monster meter + Home subject-card meter

Phase B introduces the bulk of the visible product change. SSR characterisation captured before U5.

### Phase C — Token unification + segmented control + guardrails

- U6 — Punctuation token unification + accent removal
- U4 — SegmentedControl extraction (conditional; deferral path documented)
- U7 — Guardrails + Spelling third-consumer falsifier + dead-CSS sweep + completion report

Phase C lands the contracts and finalises the third-consumer falsifier pass. Three-reviewer convergence on Punctuation hero-class scope happens here.

---

## Documentation Plan

- U0 addendum: `docs/plans/james/ui-refactor/2026-04-29-p1-validation-addendum.md`.
- U7 completion report: `docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`.
- Inline CSS comment near `--punctuation-accent` in `styles/app.css` documenting the intentional theme unification.
- No README updates planned — the plan and completion report are the durable artefacts.
- `docs/solutions/architecture-patterns/ui-consolidation-pioneer-then-pattern-2026-04-29.md` will be referenced in U7 completion report as the methodological precedent; no edit required.

---

## Operational / Rollout Notes

- No feature flag required. Primitives are net-new; migrations are byte-identical (or documented intentional changes for U6 dark mode).
- No database migration, Worker change, or persistence change.
- No Worker deployment required. Client-only changes.
- Verification cascade per origin §8: targeted tests → `npm test` → `npm run build` → `npm run audit:client` → `npm run check`. Completion report records pass/fail per command with Node version and `node_modules` install state. If any command cannot run, the report says **why** and does **not** claim it passed.

---

## Sources & References

- **Origin document:** [docs/plans/james/ui-refactor/ui-refactor-p2.md](docs/plans/james/ui-refactor/ui-refactor-p2.md)
- **Predecessor completion report:** [docs/plans/james/ui-refactor/2026-04-29-completion-report.md](docs/plans/james/ui-refactor/2026-04-29-completion-report.md)
- **Pioneer-then-pattern learning:** [docs/solutions/architecture-patterns/ui-consolidation-pioneer-then-pattern-2026-04-29.md](docs/solutions/architecture-patterns/ui-consolidation-pioneer-then-pattern-2026-04-29.md)
- **CSP inline-style inventory:** [docs/hardening/csp-inline-style-inventory.md](docs/hardening/csp-inline-style-inventory.md)
- **React port flicker contract:** [docs/superpowers/specs/2026-04-22-react-port-flicker-elimination-design.md](docs/superpowers/specs/2026-04-22-react-port-flicker-elimination-design.md)
- **Admin SSR characterisation pattern:** [docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md](docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md)
- **Punctuation Phase 7 hardening:** [docs/plans/2026-04-27-003-feat-punctuation-phase7-qol-debuggability-hardening-plan.md](docs/plans/2026-04-27-003-feat-punctuation-phase7-qol-debuggability-hardening-plan.md)
- **Token system:** `styles/app.css:1-138` (root tokens), `styles/app.css:503-524` (.btn family), `styles/app.css:11831+` (Grammar accent pattern)
- **Test runner:** `scripts/run-node-tests.mjs`, `.nvmrc` (Node 22)
- **Frontend-design skill:** invoked at planning time; Module C discipline applied (match existing visual language, inherit tokens, focus on interaction quality and state coverage).
