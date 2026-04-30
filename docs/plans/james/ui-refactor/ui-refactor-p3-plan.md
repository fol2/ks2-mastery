---
title: "UI Refactor P3 — Visual Interaction Engine Implementation Plan"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/ui-refactor/ui-refactor-p3.md
---

# UI Refactor P3 — Visual Interaction Engine Implementation Plan

## Overview

Transform the P2 shared-primitive foundation into a unified visual interaction engine across Spelling, Grammar, and Punctuation. This plan delivers: a subject theme token contract, shared session HUD, expanded action engine, shared summary frame, setup companion panel, practice stage shell, home dashboard perspective engine, admin diagnostics, and parser-level guardrails — while keeping production stable and bundle size within ceiling.

Unit IDs (U0–U9) match the contract's delivery unit numbering. Execution order follows the contract's §8 suggestion: U0 → U1 → U3 → U2 → U6 → U5 → U4 → U7 → U8 → U9.

---

## Problem Frame

P2 established 6 production-adopted primitives (Button, Card, ProgressMeter, StatCard, EmptyState, ErrorCard) but the three ready subjects still feel like separate products. Session progress, setup companions, summary outcomes, and background stages are all subject-specific implementations. The child experiences three unrelated apps rather than one learning world with subject-specific identity.

The production app has 182 raw `.btn` buttons, only Punctuation has a full CSS token chain, Spelling still uses inline `--btn-accent` threading, and session/summary/companion UX varies completely across subjects.

---

## Requirements Trace

- R1. Spelling, Grammar, and Punctuation use the same subject theme contract for learner-facing setup/session/summary surfaces
- R2. Punctuation setup, map, session, and summary no longer depend on raw `#B8873F` in executable JSX
- R3. Spelling setup no longer needs bespoke inline `--btn-accent` threading
- R4. Shared answered/left progress HUD in Spelling, Grammar, and Punctuation sessions
- R5. At least one shared summary frame adopted by all three ready subjects
- R6. At least one shared setup companion panel adopted by all three ready subjects
- R7. Raw learner-facing `.btn` inventory materially lower than P2 baseline with narrower allowlist
- R8. `SectionHeader` has 3+ real adopters OR completion report explicitly downgrades it to "available primitive"
- R9. Reduced-motion support tested for every newly animated stage/scroller
- R10. Inline-style inventory does not increase above P2 snapshot (245) without documented exception
- R11. Bundle size remains within committed budget (227,500 B gzip) or re-baseline approved
- R12. No subject mastery, reward, Star, Mega, or Worker-command semantics change

---

## Scope Boundaries

- Hero Coins, Hero economy, loot, shop mechanics, or new reward rules
- Item-level Hero scheduling
- Worker-owned subject command replacement
- Spelling, Grammar, or Punctuation learning logic rewrites
- Production certification without live smoke evidence
- Every admin table, debug surface, or legacy helper being visually perfect
- Reading, Reasoning, Arithmetic learning engine implementation (theme placeholders only)

### Deferred to Follow-Up Work

- Production smoke tests against live environment (DEFERRED: requires human — deployment credentials and live URL access)
- Screenshot approval of visual changes (DEFERRED: requires human — P3 owner review)
- Bundle re-baseline approval if ceiling exceeded (DEFERRED: requires human)

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/ui/Button.jsx` — shared action primitive with `dataAction`, `dataValue`, icon slot forwarding
- `src/platform/ui/ProgressMeter.jsx` — CSS `--progress-value` + ARIA progressbar pattern
- `src/platform/ui/StatCard.jsx` — `dl/dt/dd` semantic label-value pattern
- `src/platform/ui/HeroBackdrop.jsx` — layer lifecycle with cross-fade, luminance probing, `prefers-reduced-motion` awareness
- `src/platform/ui/SetupSidePanel.jsx` — Grammar setup side panel (41 lines)
- `src/surfaces/home/data.js` — centralized subject metadata: names, monster nouns, gradient accents, power ranks
- `styles/app.css` — CSS variable chain: `--punctuation-accent` → `--btn-accent` / `--card-accent` / `--subject-accent` via `:where()` scoping
- Token remap pattern (P2 U6): `:where(.punctuation-surface, ...) { --accent: var(--punctuation-accent, var(--brand)); }`
- Pioneer-then-pattern discipline: primitive not generic until 2 real consumers prove the API

### Institutional Learnings

- Bundle headroom is extremely tight: 227,078 B / 227,500 B ceiling (422 B remaining)
- Inline-style budget: POST_MIGRATION_TOTAL = 245 (ratchet gate blocks regressions)
- Platform extraction pilot-reversal pattern: pilot subject's refined API wins as canonical
- P2 guardrails are parser-level (esbuild + SSR render + regex assertion)

### External References

- Contract engineering notes: shallow adapters over deep rewrites, static/registry-derived tokens, stable data locators, order-agnostic test assertions

---

## Key Technical Decisions

- **Subject theme via CSS-only scope classes** (not runtime JS computation): Static `.subject-theme[data-subject="X"]` selectors in `styles/app.css` provide all token remaps. Zero runtime DOM mutation after first render. Rationale: contract mandates deterministic/testable, CSP-friendly, no dynamic colour computation in render paths.
- **ActionRow as layout primitive** (not behavioural): `ActionRow` standardises spacing/wrapping/hierarchy only. No command dispatch logic. Rationale: preserve existing `data-action` + handler chains without coupling layout to dispatch.
- **SessionHUD consumes view-model props** (not internal state): Each subject passes counts from its existing session controller. HUD never infers learning state from UI clicks. Rationale: contract principle #2 (visual engine consumes read models).
- **PracticeStage extends HeroBackdrop direction** (not parallel system): Reuses cross-fade, luminance probe, reduced-motion patterns already proven. Rationale: contract mandates building from existing direction, not separate visual language.
- **SubjectCompanionPanel is display-only**: Receives monster/stats/focus data from subject adapters. No mastery mutation. Rationale: contract principle #2.
- **SectionHeader adoption opportunistic**: Use in companion panel, summary frame, and admin diagnostics to meet 3-adopter gate OR explicitly downgrade in completion report. The U9 guardrail test enforces the binary resolution.
- **Bundle discipline**: Each unit must pass `bundle-byte-budget.test.js`. If a unit would breach ceiling, split into smaller PR or request human-approved re-baseline. If cumulative impact exceeds 350 B, tree-shake unused Button variants or defer HomeHeroScene to P3b. Rationale: 422 B headroom demands per-PR vigilance.
- **Forbidden learner-copy pattern enforcement**: All new learner-facing components (SessionHUD, SessionSummaryFrame, SubjectCompanionPanel) are tested against the Section 11 forbidden-pattern list at render time. Rationale: adapters pass copy-bearing props that could accidentally violate child-safe language rules.
- **Visual change audit trail**: Completion report must contain an "Approved Visual Changes" section (may be empty). Any Playwright snapshot update must be named in this section. This converts the human screenshot-approval gate from silent to auditable.

---

## Open Questions

### Resolved During Planning

- **Where do future-subject tokens live?** Resolution: Same `styles/app.css` `.subject-theme[data-subject="reading|reasoning|arithmetic"]` rules with placeholder accent values. They are dormant until a learning engine sets `data-subject`.
- **How to migrate Spelling inline accent?** Resolution: Add `.subject-theme[data-subject="spelling"]` rule that maps `--subject-accent` → `--btn-accent`. Remove inline `style={{ --btn-accent }}` from SpellingSetupScene.
- **SessionHUD vs per-subject progress components?** Resolution: One `SessionHUD` with subject-specific adapters that translate existing view-model state into the shared prop contract.
- **Execution order vs dependencies**: The contract's §8 suggests U3 before U2. This works because U3 (SessionHUD) and U2 (ActionEngine) both depend only on U1 (theme tokens), not on each other. Doing U3 first proves the adapter pattern that U2 then extends to buttons.

### Deferred to Implementation

- **Exact accent hex values for Reading, Reasoning, Arithmetic**: Currently in `data.js` as gradients. Implementation will extract a single accent from the gradient start or choose a representative solid.
- **SectionHeader 3-adopter viability**: If natural adoption points (companion panel header, summary section headers, admin section headers) feel forced, the completion report will downgrade rather than forcing adoption. The guardrail test enforces binary resolution.
- **Bundle byte impact of new components**: Must be measured per-PR. If cumulative impact exceeds headroom, later units may need tree-shaking or code-splitting.

---

## Implementation Units

Execution order follows contract §8: U0 → U1 → U3 → U2 → U6 → U5 → U4 → U7 → U8 → U9.

- U0. **P3 Evidence Map and Visual Inventory**

**Goal:** Create a checked-in evidence map documenting the exact starting state before any product code changes.

**Requirements:** R1–R12 baseline (provides the "before" for all success criteria)

**Dependencies:** None

**Files:**
- Create: `docs/plans/james/ui-refactor/ui-refactor-p3-evidence-map.md`

**Approach:**
- Record current git ref (HEAD SHA) as starting point
- Document P2 report path and content hash
- Inventory all files in `src/platform/ui/` with adoption status
- Grep all raw `.btn` occurrences by surface/file, categorised as learner-facing vs admin vs shell
- Grep all raw hex colour literals (`#B8873F`, `#3E6FA8`, `#C06B3E`, etc.) by surface
- Record current POST_MIGRATION_TOTAL (245) and BUDGET_GZIP_BYTES (227,500)
- Map setup/session/summary components per subject
- Document subject metadata sources (`data.js`, per-subject view-models)
- Document monster/status surfaces
- Run `node scripts/audit-client-bundle.mjs` and record measured gzip size
- Separate evidence into: Git evidence, local-run evidence. Explicitly state "production evidence: not gathered"

**Test scenarios:**
- Test expectation: none — documentation-only unit, no product code changes

**Verification:**
- Evidence map exists at specified path
- Separates evidence categories (Git, local-run, production)
- Explicitly states what was not verified
- Contains all required inventory sections from contract

---

- U1. **Subject Theme Token Contract**

**Goal:** Create a unified subject theme token system where Spelling, Grammar, Punctuation (and future subjects) declare identity through CSS variables, eliminating raw hex literals from executable JSX.

**Requirements:** R1, R2, R3, R10, R11, R12

**Dependencies:** U0

**Files:**
- Modify: `styles/app.css` (add `.subject-theme[data-subject="X"]` rule blocks)
- Create: `src/platform/ui/SubjectThemeScope.jsx` (thin wrapper that applies `data-subject` + className)
- Create: `src/platform/ui/subject-themes.js` (registry of SubjectTheme objects for JS consumers)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx` (consume subject scope)
- Modify: `src/subjects/punctuation/components/PunctuationSessionScene.jsx` (remove raw `#B8873F`)
- Modify: `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` (remove raw `#B8873F`)
- Modify: `src/subjects/punctuation/components/PunctuationMapScene.jsx` (remove raw `#B8873F`)
- Modify: `src/subjects/spelling/components/SpellingSetupScene.jsx` (remove inline `--btn-accent` threading)
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (verify accent consumption preserved)
- Modify: `src/surfaces/home/data.js` (export accent metadata compatible with token system)
- Create: `tests/ui-subject-theme-contract.test.js`

**Approach:**
- Define `.subject-theme[data-subject="spelling|grammar|punctuation|reading|reasoning|arithmetic"]` in `styles/app.css`
- Each subject block maps: `--subject-accent`, `--subject-accent-ink`, `--subject-accent-soft`, `--subject-accent-border` → `--btn-accent`, `--card-accent`, `--progress-accent`
- `SubjectThemeScope` is a zero-runtime-cost wrapper: renders a `<div class="subject-theme" data-subject={subjectId}>` around children
- Replace all raw Punctuation hex in JSX with `var(--subject-accent)` references or className consumption
- Replace Spelling inline `style={{ '--btn-accent': accent }}` with `SubjectThemeScope` wrapping
- Preserve Grammar's existing remap (additive, no regression)
- Future subjects (reading, reasoning, arithmetic) get placeholder accent values derived from `data.js` gradients

**Patterns to follow:**
- P2 U6 Punctuation remap pattern: `:where(.punctuation-surface, ...) { --accent: var(--punctuation-accent); }`
- Token test pattern from `tests/ui-token-contract.test.js`

**Test scenarios:**
- Happy path: Punctuation setup renders with accent from CSS variable (not inline hex)
- Happy path: Spelling setup CTA gets accent without inline style prop
- Happy path: Grammar setup accent unchanged (regression check)
- Edge case: Subject theme scope with unknown `subjectId` renders without error
- Edge case: Dark-mode tokens for all three ready subjects resolve correctly
- Integration: `Button`, `Card`, `ProgressMeter` all consume `--btn-accent`/`--card-accent`/`--progress-accent` from subject scope
- Ratchet: Zero raw `#B8873F` in Punctuation setup/map/session/summary JSX
- Ratchet: Zero inline `--btn-accent` in Spelling setup JSX
- Ratchet: `data-*` journey selectors preserved
- Budget: Inline-style count <= 245 (or documented exception)

**Verification:**
- `grep -r "#B8873F" src/subjects/punctuation/` returns zero hits in JSX files
- Spelling setup no longer passes `--btn-accent` via inline style
- All existing subject session/setup Playwright snapshots pass without visual diff
- `tests/ui-subject-theme-contract.test.js` passes
- `tests/ui-token-contract.test.js` still passes
- `tests/csp-inline-style-budget.test.js` passes

---

- U3. **Session HUD and Question Progress Engine**

**Goal:** Create a shared `SessionHUD` component adopted by all three ready subjects, showing answered/left progress in child-safe language.

**Requirements:** R4, R9, R11, R12

**Dependencies:** U1

**Files:**
- Create: `src/platform/ui/SessionHUD.jsx`
- Create: `tests/ui-session-hud-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSessionScene.jsx` (adopt SessionHUD)
- Modify: `src/subjects/grammar/components/GrammarSessionScene.jsx` (adopt SessionHUD)
- Modify: `src/subjects/punctuation/components/PunctuationSessionScene.jsx` (adopt SessionHUD)
- Modify: `tests/spelling-session-ui.test.js` (verify HUD integration)
- Modify: `tests/punctuation-session-ui.test.js` (verify HUD integration)

**Approach:**
- `SessionHUD` accepts: `subjectId`, `title`, `answeredCount`, `totalCount`, `remainingCount`, `currentIndex`, `modeLabel`, `supportState`, `progressLabel`, `accent`
- Renders: accessible `ProgressMeter` (reuse existing primitive) + text status line
- Each subject creates a thin adapter function that maps its existing session view-model into SessionHUD props
- Spelling adapter: maps from its existing progress state (answered/total from session controller)
- Grammar adapter: preserves feedback/support state labels
- Punctuation adapter: preserves telemetry-specific copy
- `prefers-reduced-motion`: disable any progress bar animation, show static fill
- ARIA: `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`

**Patterns to follow:**
- `src/platform/ui/ProgressMeter.jsx` — CSS `--progress-value` + ARIA pattern
- Session copy pattern from `tests/spelling-session-ui.test.js`
- Stateless guarantee: no store subscription in SessionHUD (R10 analogue)

**Test scenarios:**
- Happy path: HUD renders "You have answered 6 of 10" with correct ARIA attributes
- Happy path: Progress bar at 60% when 6/10 answered
- Edge case: `totalCount = 0` renders safe fallback text, not NaN or division by zero
- Edge case: `remainingCount` cannot be negative (clamp to 0)
- Edge case: progress percentage never exceeds 100% (clamp answeredCount to totalCount)
- Accessibility: `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax` present
- Accessibility: Accessible label describes progress in plain language
- Reduced motion: `prefers-reduced-motion: reduce` produces static (non-animated) progress bar
- Forbidden copy: Rendered output does not match Section 11 forbidden patterns (streak pressure, coin earning, failure language)
- Integration: Spelling session renders SessionHUD with existing dispatch/marking still working
- Integration: Grammar session renders SessionHUD preserving support state and feedback
- Integration: Punctuation session renders SessionHUD preserving telemetry hooks

**Verification:**
- All three subject session scenes render `<SessionHUD>` with correct prop mapping
- `tests/ui-session-hud-contract.test.js` passes all scenarios
- Existing `tests/spelling-session-ui.test.js` passes (no copy regression)
- Existing `tests/punctuation-session-ui.test.js` passes (no dispatch regression)
- Existing `tests/subject-command-actions.test.js` passes (no command changes)
- No Worker route changes introduced

**Merge note:** This unit modifies session scene files (SpellingSessionScene, GrammarSessionScene, PunctuationSessionScene) that U2 also modifies. U3 must merge before U2 to avoid conflicts.

---

- U2. **Action Engine Pass 1**

**Goal:** Retire at least 20 raw `.btn` call sites from learner-facing surfaces by expanding `<Button>` adoption and introducing `ActionRow` for layout hierarchy.

**Requirements:** R7, R8, R10, R11, R12

**Dependencies:** U1, U3 (U3 must merge first — shared session scene files)

**Files:**
- Create: `src/platform/ui/ActionRow.jsx`
- Create: `tests/ui-action-engine-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSessionScene.jsx` (migrate raw buttons)
- Modify: `src/subjects/grammar/components/GrammarSessionScene.jsx` (migrate raw buttons)
- Modify: `src/subjects/punctuation/components/PunctuationSessionScene.jsx` (migrate raw buttons)
- Modify: `src/subjects/spelling/components/SpellingSummaryScene.jsx` (migrate raw buttons)
- Modify: `src/subjects/grammar/components/GrammarSummaryScene.jsx` (migrate raw buttons)
- Modify: `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` (migrate raw buttons)
- Modify: `src/surfaces/home/HomeSurface.jsx` (shell/profile actions if learner-visible)
- Modify: `tests/ui-component-adoption.test.js` (expand Button allowlist)
- Modify: `tests/ui-primary-action-contract.test.js` (expand coverage to session/summary)

**Approach:**
- `ActionRow` accepts: `primary`, `secondary`, `tertiary` (all optional Button slots), `align` (start|centre|end|split)
- `ActionRow` is layout-only: flexbox wrapper with gap, wrap, and alignment. No dispatch logic
- Migration priority: session actions first (30 raw `.btn` across 3 subjects), then summaries (10), then shell/profile (if learner-visible)
- Each migrated button preserves: `data-action`, `data-value`, `disabled`, `aria-label`, `type`, `onClick` handler
- Admin-only tables remain raw but get inventoried in evidence map for future pass
- `SectionHeader` adoption: use as section divider in summary scenes if natural (counts toward 3-adopter gate)

**Patterns to follow:**
- `src/platform/ui/Button.jsx` — `dataAction`, `dataValue` prop forwarding
- P2 primary-action contract: at-most-one `variant="primary"` per decision branch
- `tests/ui-primary-action-contract.test.js` assertion pattern

**Test scenarios:**
- Happy path: ActionRow renders primary + secondary with correct spacing and alignment
- Happy path: Migrated session buttons preserve `data-action` selectors byte-identical
- Edge case: ActionRow with only `primary` (no secondary/tertiary) renders without error
- Edge case: ActionRow with `align="split"` spaces primary left, secondary right
- Ratchet: Raw `.btn` count in learner surfaces is >= 20 fewer than P2 baseline
- Accessibility: Disabled buttons show visible disabled state + `aria-disabled`
- Accessibility: Busy buttons show loading indicator + `aria-busy="true"`
- Integration: Form submit behaviour preserved (type="submit" buttons still submit)
- Integration: Keyboard navigation (Tab, Enter, Space) unchanged
- Integration: `data-action` selectors survive migration (journey tests pass)
- Contract: At-most-one primary action per setup/session/summary/home decision branch

**Verification:**
- Raw `.btn` count in learner-facing surfaces reduced by >= 20 from P2 baseline
- `tests/ui-action-engine-contract.test.js` passes
- `tests/ui-primary-action-contract.test.js` passes with expanded coverage
- `tests/ui-component-adoption.test.js` passes with updated allowlist
- `tests/subject-command-actions.test.js` passes (no dispatch change)
- All journey tests pass (data-action selectors preserved)

---

- U6. **Shared Summary Engine**

**Goal:** Create a shared `SessionSummaryFrame` adopted by all three ready subjects, presenting outcomes without claiming unearned mastery.

**Requirements:** R5, R9, R11, R12

**Dependencies:** U1, U2

**Files:**
- Create: `src/platform/ui/SessionSummaryFrame.jsx`
- Create: `tests/ui-summary-engine-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSummaryScene.jsx` (adopt frame)
- Modify: `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` (adopt frame)
- Modify: `src/subjects/grammar/components/GrammarSummaryScene.jsx` (adopt frame)

**Approach:**
- `SessionSummaryFrame` accepts: `subjectId`, `outcome` (secure|improving|needs-practice|review-complete), `title`, `highlights`, `misconceptions`, `progressDelta`, `nextPrimaryAction`, `secondaryActions`
- Frame renders: outcome header, highlight list, misconception list (if non-empty), progress change indicators, primary action CTA, secondary action row
- Each subject creates an adapter that maps its existing summary view-model into frame props
- Subject-specific copy preserved: adapter passes through existing result text/labels
- `progressDelta` cannot show unearned mastery: frame validates delta against passed data (display-only, no computation)
- `SectionHeader` adoption: use for "What went well" / "Try again" sections (counts toward 3-adopter gate)

**Patterns to follow:**
- `src/platform/ui/Button.jsx` + `ActionRow` for summary actions
- Summary scene existing patterns (copy, routes, next-action dispatch)
- `StatCard` for progress delta display (if appropriate)

**Test scenarios:**
- Happy path: Summary frame renders outcome title + highlights + primary action
- Happy path: Spelling summary preserves existing feedback copy through adapter
- Edge case: Empty misconceptions array renders section hidden (not empty list)
- Edge case: Empty progressDelta renders no progress section (not zeros)
- Contract: Exactly one primary summary action per render
- Contract: progressDelta cannot show mastery change not present in subject result model
- Forbidden copy: Rendered output does not match Section 11 forbidden patterns
- Integration: Subject-specific next-action routes still dispatch correctly (click primary → correct route)
- Integration: Punctuation summary preserves telemetry event emission
- Accessibility: Summary sections have semantic headings for screen readers

**Verification:**
- All three subject summaries render `<SessionSummaryFrame>` with subject-specific content
- `tests/ui-summary-engine-contract.test.js` passes
- Existing summary-related tests pass without regression
- No reward, Star, or mastery semantics changed

---

- U5. **Setup Companion Panel and Monster/Status Engine**

**Goal:** Create a shared `SubjectCompanionPanel` adopted by all three ready subjects, displaying owned monsters, stats, and next focus without mutating mastery.

**Requirements:** R6, R11, R12

**Dependencies:** U1

**Files:**
- Create: `src/platform/ui/SubjectCompanionPanel.jsx`
- Create: `tests/ui-companion-panel-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSetupScene.jsx` (adopt panel)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx` (adopt panel)
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (adopt panel)

**Approach:**
- `SubjectCompanionPanel` accepts: `subjectId`, `learnerName`, `monsters` (array), `stats` (array of {label, value, tone}), `nextFocus`, `emptyState`
- Panel renders: monster display section (or empty state), stats as `dl/dt/dd` semantic markup (reuse StatCard pattern), next-focus recommendation
- Display-only: no ownership creation, no monster progress mutation, no reward changes
- Each subject creates adapter: Spelling maps creature language, Punctuation maps progress row stats, Grammar maps concept bank status
- Future subjects render empty state without crashing
- Mobile 360px: vertical stack, no horizontal overflow
- `SectionHeader` adoption: use as panel section headers (counts toward 3-adopter gate)

**Patterns to follow:**
- `src/platform/ui/StatCard.jsx` — `dl/dt/dd` semantic label-value pattern
- `src/platform/ui/SetupSidePanel.jsx` — existing side panel wrapper
- Monster rendering from `tests/monster-visual-renderers.test.js` — CSS variable injection pattern

**Test scenarios:**
- Happy path: Panel renders monsters + stats + next focus for Spelling
- Happy path: Panel renders Punctuation progress stats (due/wobbly/secure)
- Edge case: Empty monsters array renders `emptyState` message
- Edge case: Zero stats renders panel without stats section
- Edge case: Unknown `subjectId` (e.g., "reading") renders empty state without crash
- Forbidden copy: Rendered output does not match Section 11 forbidden patterns
- Accessibility: Stat values announced through semantic `dl/dt/dd` markup
- Accessibility: Monster images have alt text or `aria-hidden` if decorative
- Layout: Mobile 360px viewport does not overflow horizontally
- Contract: No subject mastery mutation (display-only assertion)

**Verification:**
- All three setup scenes render `<SubjectCompanionPanel>`
- Future-subject placeholder renders without crash
- `tests/ui-companion-panel-contract.test.js` passes
- No mastery/reward/Star changes introduced
- Mobile viewport test passes

---

- U4. **Practice Stage and Background Scroller Engine**

**Goal:** Create a shared `PracticeStage` shell supporting decorative background motion with mandatory reduced-motion fallback.

**Requirements:** R9, R11, R12

**Dependencies:** U1

**Files:**
- Create: `src/platform/ui/PracticeStage.jsx`
- Create: `tests/ui-practice-stage-contract.test.js`
- Modify: `src/subjects/spelling/components/SpellingSessionScene.jsx` (wrap with PracticeStage)
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx` (wrap with PracticeStage)
- Modify: `src/subjects/grammar/components/GrammarSessionScene.jsx` (wrap with PracticeStage)
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx` (wrap with PracticeStage)
- Modify: `src/subjects/punctuation/components/PunctuationSessionScene.jsx` (wrap with PracticeStage)

**Approach:**
- `PracticeStage` accepts: `subjectId`, `scene` (setup|session|summary), `backdrop` (meadow|library|punctuation-map|subject-default), `motion` (calm|active|celebration|none), `reducedMotionFallback`, `children`
- Extends `HeroBackdrop` direction: reuses cross-fade, layer lifecycle, luminance probing
- Background motion via CSS transforms + opacity only (no layout-affecting animation)
- `prefers-reduced-motion: reduce` → motion locked to "none", static fallback renders
- Missing assets: detect lean ZIP placeholder state, render solid subject-accent background
- Content layer (`children`) never shifts position due to background motion
- Stage has minimum contrast ratio enforcement (luminance.js already available)

**Patterns to follow:**
- `src/platform/ui/HeroBackdrop.jsx` — layer lifecycle, cross-fade, luminance
- `src/platform/ui/hero-bg.js` — transition timing constants
- `src/platform/ui/luminance.js` — contrast detection

**Test scenarios:**
- Happy path: Stage renders children over subject-coloured backdrop
- Happy path: Spelling session gets "meadow" backdrop with "calm" motion
- Edge case: Missing asset payload renders solid colour fallback (not broken image)
- Edge case: `motion="none"` renders zero animation keyframes
- Accessibility: `prefers-reduced-motion: reduce` produces completely static stage
- Layout: Children never shift position regardless of motion state
- Layout: Text remains readable (contrast) over every backdrop variant
- Integration: Spelling session dispatch/marking unchanged after wrapping
- Integration: Grammar setup hero contrast detection still works
- Contract: Stage is decorative — never interactive unless subject explicitly opts in

**Verification:**
- Stage renders without real asset payloads
- Reduced-motion media query test passes
- No answer input position shift
- `tests/ui-practice-stage-contract.test.js` passes
- Existing session tests pass unchanged

**Merge note:** This unit modifies session scene files that U3 and U2 also modify. U4 must merge after U2 completes to avoid conflicts.

---

- U7. **Home Dashboard Hero Perspective Engine**

**Goal:** Introduce a `HomeHeroScene` wrapper that unifies subject cards, creature presence, and primary action into one scene contract — without replacing existing card routes.

**Requirements:** R11, R12

**Dependencies:** U1, U2, U5

**Files:**
- Create: `src/platform/ui/HomeHeroScene.jsx`
- Create: `tests/ui-home-hero-scene-contract.test.js`
- Modify: `src/surfaces/home/HomeSurface.jsx` (wrap existing cards with HomeHeroScene)
- Modify: `src/surfaces/home/SubjectCard.jsx` (minor prop adjustments for scene contract)

**Approach:**
- `HomeHeroScene` accepts: `learner` (summary object), `readySubjects` (subject card data), `todayFocus` (optional), `creatureHighlights` (owned creatures), `primaryAction` (continue learning), `secondaryActions`
- Scene wraps existing subject cards — does NOT replace them. Cards still render their own routes.
- One primary home action preserved (continue learning CTA)
- No Hero/Camp/Coin copy introduced unless already present in current surface
- Scene can later accept a Hero Quest read model without changing subject card APIs (forward-compatible slot)
- Creature highlights are decorative (same display-only contract as companion panel)

**Patterns to follow:**
- `src/surfaces/home/HomeSurface.jsx` — existing card grid layout
- `src/surfaces/home/MonsterMeadow.jsx` — creature rendering
- `src/platform/ui/ActionRow.jsx` — primary + secondary action hierarchy

**Test scenarios:**
- Happy path: Scene renders all ready subjects as clickable cards with correct routes
- Happy path: Primary action renders as single continue-learning CTA
- Edge case: No `todayFocus` renders scene without focus highlight (not crash)
- Edge case: Zero `creatureHighlights` renders scene without creature section
- Contract: Existing subject card routes still dispatch correctly
- Contract: No Hero/Camp/Coin copy introduced (regex assertion on rendered output)
- Forward-compat: Scene accepts `heroQuest` prop without changing subject card APIs

**Verification:**
- Existing subject cards still open their subject routes
- One primary home action preserved
- `tests/ui-home-hero-scene-contract.test.js` passes
- No economy copy introduced
- Scene is a wrapping enhancement, not a replacement

---

- U8. **Admin Visual Asset and Property Diagnostics**

**Goal:** Create a read-only diagnostic panel for admin to inspect subject theme tokens, monster asset availability, and visual engine configuration.

**Requirements:** R11

**Dependencies:** U1, U5, U4

**Files:**
- Create: `src/surfaces/hubs/AdminVisualEngineSection.jsx`
- Create: `tests/admin-visual-engine-diagnostics.test.js`
- Modify: `src/surfaces/hubs/AdminHubSurface.jsx` (register new section tab)
- Modify: `src/surfaces/hubs/AdminSectionTabs.jsx` (add tab entry)

**Approach:**
- Read-only diagnostics for: subject theme tokens (all 6 subjects), monster asset availability per subject, placeholder detection (lean ZIP vs real), background/stage assignments, motion profile assignments, missing alt text audit, bundle size impact estimates
- Uses `AdminPanelFrame` wrapper (established P5 pattern)
- No production write endpoint — diagnostic display only
- Lean ZIP placeholders reported as "placeholder" with info badge, not as "broken asset" with error badge
- Section integrates into existing admin hub tab navigation
- `SectionHeader` adoption: use as diagnostic category headers (counts toward 3-adopter gate)

**Patterns to follow:**
- `src/surfaces/hubs/AdminDebuggingSection.jsx` — existing admin section pattern
- `src/surfaces/hubs/AdminContentSection.jsx` — existing content diagnostics
- Admin panel frame pattern from `tests/admin-panel-frame-characterisation.test.js`

**Test scenarios:**
- Happy path: Admin sees all 6 subject theme configurations with accent values
- Happy path: Monster assets listed with availability status per subject
- Edge case: Lean ZIP placeholder reported as "placeholder", not "broken"
- Edge case: Missing alt text highlighted with warning (not error)
- Contract: No write endpoint introduced (read-only assertion)
- Integration: Section renders within AdminHubSurface tab navigation

**Verification:**
- Admin can inspect visual configuration
- No production write endpoint exists
- `tests/admin-visual-engine-diagnostics.test.js` passes
- Placeholder assets correctly identified

---

- U9. **Guardrails, Completion Report, and Release Evidence**

**Goal:** Lock all P3 contracts with parser-level guardrails, enforce binary resolutions, and write the completion report documenting shipped scope.

**Requirements:** R1–R12 (all — this unit validates the entire contract)

**Dependencies:** U0–U8 (all)

**Files:**
- Create: `tests/ui-p3-guardrails.test.js` (consolidated P3 contract tests)
- Modify: `tests/ui-component-adoption.test.js` (final adoption allowlist)
- Modify: `tests/ui-token-contract.test.js` (expanded subject theme assertions)
- Modify: `tests/ui-primary-action-contract.test.js` (expanded to session/summary/home)
- Modify: `tests/csp-inline-style-budget.test.js` (update if budget changed with documented exception)
- Modify: `tests/bundle-byte-budget.test.js` (update if ceiling changed with documented exception)
- Create: `docs/plans/james/ui-refactor/ui-refactor-p3-completion-report.md`

**Approach:**
- Consolidated guardrail test covering:
  - Subject-theme token contract (no raw hex in learner JSX)
  - Raw `.btn` ratchet (count <= P3 ceiling)
  - One-primary-action expanded scope (setup/session/summary/home)
  - Session HUD contract (rendered in all 3 sessions)
  - Practice stage reduced-motion contract
  - Summary truth contract (no unearned mastery claims)
  - Inline-style budget ratchet
  - Bundle byte budget
  - Completion-report wording ratchet (forbidden claims)
  - **SectionHeader resolution assertion**: completion report must contain either "SectionHeader: adopted" with count >= 3 OR "SectionHeader: downgraded to available primitive"
  - **Visual change audit section**: completion report must contain an "## Approved Visual Changes" section (may list zero changes if none were intentional). Any updated Playwright snapshot baseline must be named here.
  - **Forbidden learner-copy patterns**: render SessionHUD, SessionSummaryFrame, SubjectCompanionPanel with representative prop sets and assert zero matches against: "lose your streak", "Earn coins", "failed this monster", "Mega lost", "Buy now", "limited time"
  - **Future-subject integration checklist**: completion report must reference all 6 integration points (theme declaration, companion panel adapter, session HUD adapter, summary frame adapter, practice stage selection, home card data contract) with file path or test reference for each
- Completion report follows contract Section 9 structure: source boundary, PR ledger, unit-by-unit scope, visual change section, test results, bundle numbers, deferrals, non-claims
- Forbidden claims enforced by wording ratchet test (regex against report file)
- Production evidence: "implemented and locally verified" (not "production verified")

**Patterns to follow:**
- `tests/ui-completion-report-claims.test.js` — wording ratchet pattern
- `tests/csp-inline-style-budget.test.js` — inventory parity check pattern
- P2 completion report structure at `docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`

**Test scenarios:**
- Ratchet: Zero raw Punctuation hex (`#B8873F`) in Punctuation learner JSX
- Ratchet: Zero inline `--btn-accent` in Spelling setup JSX
- Ratchet: Raw `.btn` count in learner surfaces <= established P3 ceiling
- Ratchet: At-most-one primary action per setup/session/summary/home branch
- Contract: SessionHUD rendered in all 3 subject sessions
- Contract: SessionSummaryFrame rendered in all 3 subject summaries
- Contract: SubjectCompanionPanel rendered in all 3 subject setups
- Contract: PracticeStage reduced-motion produces static output
- Resolution: SectionHeader adoption count >= 3 OR explicit downgrade statement in report
- Audit: "Approved Visual Changes" section exists in completion report
- Copy: No forbidden learner-facing patterns in new component render output
- Future: Completion report lists all 6 integration points with file/test references
- Budget: Inline-style count <= committed budget
- Budget: Bundle gzip <= committed ceiling
- Wording: Completion report does not contain forbidden claims

**Verification:**
- All guardrail tests pass
- Completion report exists at specified path
- Report contains all required sections (including "Approved Visual Changes" and future-subject integration checklist)
- Report contains no forbidden claims
- SectionHeader resolution explicitly stated
- Bundle and inline-style budgets met

---

## System-Wide Impact

- **Interaction graph:** Subject setup/session/summary scenes gain new platform component imports (SessionHUD, SessionSummaryFrame, SubjectCompanionPanel, PracticeStage, ActionRow, SubjectThemeScope). No new callbacks or event handlers introduced — existing `data-action` dispatch chains preserved.
- **Error propagation:** Visual components are display-only. Rendering errors are contained within React error boundaries. No new error propagation paths to Worker or subject commands.
- **State lifecycle risks:** SubjectThemeScope applies `data-subject` attribute at mount time only. No dynamic re-computation. SessionHUD, SummaryFrame, and CompanionPanel are stateless (props-in, DOM-out). No partial-write or stale-cache risks.
- **API surface parity:** No API changes. All new components are internal platform UI. No exported public interfaces beyond JSX component signatures.
- **Integration coverage:** Journey tests + Playwright visual snapshots verify that data-action selectors survive migration. Subject command dispatch tests verify marking/answer logic unchanged.
- **Unchanged invariants:** Worker routes, subject command handlers, reward/Star/Mega logic, hero economy, learning engine internals. The visual engine is a presentation layer that consumes read models.
- **File conflict zones:** Session scene files (`SpellingSessionScene.jsx`, `GrammarSessionScene.jsx`, `PunctuationSessionScene.jsx`) are modified by U3, U2, and U4. These must merge sequentially in that order.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Bundle ceiling breach (422 B headroom) | Monitor per-PR. Split large units. Tree-shake unused branches. If cumulative exceeds 350 B, defer HomeHeroScene to P3b or tree-shake unused Button variants. Request re-baseline only as last resort (DEFERRED: requires human). |
| Visual regression in migrated surfaces | Playwright snapshot comparison for automated detection. Completion report "Approved Visual Changes" section provides audit trail. Manual screenshot review for intentional changes (DEFERRED: requires human). |
| Session dispatch regression from button migration | Preserve `data-action` + `onClick` handlers byte-identical. Run `subject-command-actions.test.js` per PR. |
| SectionHeader 3-adopter gate unachievable | Natural adoption in companion panel (U5) + summary frame (U6) + admin diagnostics (U8). U9 guardrail enforces binary resolution: 3+ adopters or explicit downgrade. |
| Future-subject tokens conflict with existing gradients | Placeholder tokens use single representative accent colour, not full gradient. No visual conflict until learning engine activates. |
| Inline-style budget regression | CSP budget test runs per PR. SubjectThemeScope eliminates inline `--btn-accent` threading (net reduction). |
| Merge conflicts on shared session files | Strict sequential merge: U3 → U2 → U4 for session scene files. Dependencies declared explicitly. |

---

## Sources & References

- **Origin document:** [docs/plans/james/ui-refactor/ui-refactor-p3.md](docs/plans/james/ui-refactor/ui-refactor-p3.md)
- **Predecessor report:** [docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md](docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md)
- Related primitives: `src/platform/ui/Button.jsx`, `src/platform/ui/ProgressMeter.jsx`, `src/platform/ui/StatCard.jsx`, `src/platform/ui/HeroBackdrop.jsx`
- Subject metadata: `src/surfaces/home/data.js`
- Token contract: `styles/app.css` (`:where(.punctuation-surface, ...)` remap block)
- Budget tests: `tests/bundle-byte-budget.test.js`, `tests/csp-inline-style-budget.test.js`
