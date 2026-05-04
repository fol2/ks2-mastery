---
title: "refactor: SubjectCompanionPanel cross-subject ss-* alignment"
type: refactor
status: active
date: 2026-05-04
origin: docs/brainstorms/2026-05-04-companion-panel-cross-subject-alignment-requirements.md
---

# SubjectCompanionPanel Cross-Subject ss-* Alignment

## Overview

Make `SubjectCompanionPanel` the sole sidebar body for grammar and punctuation setup scenes — same structural pattern spelling already uses after PR #874. Each subject computes its own `monsterVisuals`, `stats`, and `head` and passes them as props. Bespoke sidebar components (`MonsterStripEntry`, `MonsterStarMeter`, `TodayCard`) are removed from the sidebar body but kept importable.

---

## Problem Frame

Spelling's sidebar body is a single `<SubjectCompanionPanel>` with rich props (`head`, `monsterVisuals`, subject-specific `stats`, `meadowEmpty`). Grammar and punctuation render the companion panel as a **secondary** display alongside duplicate `MonsterStripEntry` / `MonsterStarMeter` + `TodayCard` sections. The design language is fragmented — spelling uses ss-* through the companion panel, while grammar/punctuation mix ss-* directly with bespoke components.

(see origin: `docs/brainstorms/2026-05-04-companion-panel-cross-subject-alignment-requirements.md`)

---

## Requirements Trace

- R1. Grammar setup scene uses SubjectCompanionPanel as sole body (SC1, SC2, SC4, SC6, SC7, SC8)
- R2. Punctuation setup scene uses SubjectCompanionPanel as sole body (SC1, SC3, SC5, SC6, SC7)
- R3. Both use `monsterVisuals` prop with rich art (SC2, SC3)
- R4. Grammar defines subject-specific stats (SC4)
- R5. Punctuation retains its existing stats unchanged (SC5)
- R6. Both pass `head` prop with eyebrow + action button (SC6)
- R7. MonsterStripEntry / MonsterStarMeter remain importable (SC7)
- R8. Zero regression in existing contract tests (SC9)
- R9. All three subjects share identical SetupSidePanel > SubjectCompanionPanel pattern (SC11)
- R10. Data-contract test updated to assert monsterVisuals for grammar/punctuation (IC4)

---

## Scope Boundaries

- Removing `MonsterStripEntry`, `MonsterStarMeter`, `TodayCard` component files entirely (may have callers)
- Changing SetupSidePanel slot architecture (head/body/footer stays)
- Changing footer slots for any subject
- Hero mode companion panel
- Monster codex filtering (bracehart in spelling codex)

### Deferred to Follow-Up Work

- New subjects beyond spelling/grammar/punctuation: reusability contract is delivered, actual wiring is future work
- Removal of grammar-monster-strip / punctuation-monster-meter CSS if dead: separate cleanup PR

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/ui/SubjectCompanionPanel.jsx` — target component (already supports `monsterVisuals`, `head`, `stats`, `meadowEmpty`)
- `src/subjects/spelling/components/SpellingSetupScene.jsx:408-418` — benchmark pattern for computing `panelMonsterVisuals`
- `src/subjects/spelling/components/spelling-view-model.js:1065-1082` — `monsterImageVisual()` function
- `src/platform/game/MonsterVisualConfigContext.jsx` — `useMonsterVisualConfig()` hook
- `src/platform/game/monster-visual-config.js` — `resolveMonsterVisual()`
- `src/platform/game/monster-visual-style.js` — `monsterVisualFrameStyle()`
- `src/subjects/grammar/components/grammar-view-model.js:770-800` — `buildGrammarMonsterStripModel()` returns `{ monsterId, name, stars, starMax, stageIndex, displayState }`
- `src/subjects/grammar/metadata.js:214-218` — `grammarMonsterAsset()` (simple URL builder, not the rich visual pipeline)
- `src/subjects/punctuation/components/punctuation-view-model.js:77-93` — punctuation already uses `resolveMonsterVisual`

### Institutional Learnings

- `docs/solutions/design-patterns/companion-panel-ss-alignment-2026-05-04.md` — P4 contract tests: no fixed-px, min-width: 0, responsive 820px rules
- `docs/solutions/ui-bugs/spelling-correction-stuck-input-and-ribbon-visibility-2026-05-04.md` — unrelated but informs React key pattern knowledge
- CSP inline-style budget: `PRE_MIGRATION_TOTAL = 449`, `SubjectCompanionPanel.jsx` already classified as `dynamic-content-driven`

---

## Key Technical Decisions

- **Reuse `monsterImageVisual()` from spelling-view-model.js**: Grammar and punctuation will import this function directly rather than duplicating it. It takes `(monster, progress, visualConfig)` and returns `{ style, imageProps }`. The function is a pure utility that works for any subject's monster data.
- **Grammar monsterVisuals computed from `dashboard.monsterStrip`**: The strip model already carries `monsterId`, `stageIndex`, and `displayState`. We adapt these to the `{ id, visual, isEgg }` shape the companion panel expects.
- **Punctuation monsterVisuals computed from `dashboard.activeMonsters`**: The active monsters model already carries `id`, `displayStage`, and star progress. The punctuation view-model already imports `resolveMonsterVisual`.
- **Grammar stats**: Replace todayCards pass-through with curated stats: Concepts (total), Trouble (warn-tone), Today's cards (count), Accuracy (if available). At least 3 stats guaranteed.
- **CSP budget**: Grammar and punctuation setup scenes will gain inline `style={m.visual.style}` sites. These files must be classified in `scripts/inventory-inline-styles.mjs` and the budget bumped.
- **No `head` prop on SetupSidePanel**: Spelling's benchmark pattern passes `head` **inside** SubjectCompanionPanel (not to SetupSidePanel). Grammar/punctuation currently pass `head` to SetupSidePanel. After migration, the SetupSidePanel `head` slot becomes empty/removed and the eyebrow moves into SubjectCompanionPanel's `head` prop.

---

## Open Questions

### Resolved During Planning

- **Where does `monsterImageVisual` live?** Currently in `src/subjects/spelling/components/spelling-view-model.js`. It's a platform-level utility — ideally it would live in `src/platform/game/`. However, moving it is scope-creep for this refactor. Grammar and punctuation will import it from spelling-view-model.js or inline a similar function using the same `resolveMonsterVisual` + `monsterVisualFrameStyle` calls. Decision: inline a local helper in each subject's view-model to avoid cross-subject imports (grammar importing from spelling is an architectural smell). The helper is 6 lines.
- **Does grammar have monster progress data compatible with `monsterImageVisual`?** The strip model carries `monsterId` and `stageIndex`. We need `{ id, branch, stage }` for `resolveMonsterVisual`. Grammar monsters don't have branches (only spelling has post-Mega branches). Pass `branch: 'b1'` (default) and `stage: entry.stageIndex`.
- **Does punctuation have monster progress data?** Yes — `dashboard.activeMonsters` carries `id`, `displayStage`, and star-derived stage. The punctuation view-model already calls `resolveMonsterVisual` in `punctuationMonsterVisual()`.

### Deferred to Implementation

- Exact grammar stat labels (contract requires at least 3; implementer uses dashboard data)
- Whether `grammarMonsterAsset()` should be deprecated in favour of the rich visual pipeline (future cleanup)

---

## Implementation Units

- U1. **Grammar sidebar migration to sole SubjectCompanionPanel**

**Goal:** Replace grammar's sidebar body (MonsterStripEntry section + TodayCard section + text-mode companion panel) with a single SubjectCompanionPanel using `monsterVisuals`, `head`, and subject-specific `stats`.

**Requirements:** R1, R3, R4, R6, R7, R8, R9

**Dependencies:** None

**Files:**
- Modify: `src/subjects/grammar/components/GrammarSetupScene.jsx`
- Modify: `src/subjects/grammar/components/grammar-view-model.js`
- Modify: `scripts/inventory-inline-styles.mjs`
- Modify: `docs/hardening/csp-inline-style-inventory.md`
- Modify: `tests/ui-companion-panel-data-contract.test.js`
- Modify: `tests/react-grammar-surface.test.js` (update assertions for removed DOM)
- Modify: `tests/platform-setup-side-panel.test.js` (update characterisation fixture)
- Test: `tests/ui-companion-panel-data-contract.test.js`
- Test: `tests/ui-companion-panel-contract.test.js` (must stay green)
- Test: `tests/ui-companion-panel-responsive-contract.test.js` (must stay green)
- Test: `tests/ui-phantom-class-contract.test.js` (must stay green)
- Test: `tests/ui-p3-guardrails.test.js` (must stay green)
- Test: `tests/react-grammar-surface.test.js` (must stay green)
- Test: `tests/platform-setup-side-panel.test.js` (must stay green)

**Approach:**
- Add a `grammarMonsterImageVisual(monsterId, stage, visualConfig)` helper to `grammar-view-model.js` that calls `resolveMonsterVisual` + `monsterVisualFrameStyle` (same pattern as spelling's `monsterImageVisual`)
- In GrammarSetupScene: import `useMonsterVisualConfig` from platform, compute `panelMonsterVisuals` from `dashboard.monsterStrip` entries (filter: only entries where `displayState !== 'not-found'`)
- Replace the sidebar `body` prop: remove `<section className="grammar-monster-strip">` + `<section className="grammar-today">` + old `<SubjectCompanionPanel>`, replace with single `<SubjectCompanionPanel>` using:
  - `head`: eyebrow "Where you stand" + "Open bank →" button (moved from SetupSidePanel `head`)
  - `monsterVisuals`: computed array of `{ id, visual, isEgg }`
  - `stats`: curated from dashboard data (Concepts, Trouble, Today's cards, Accuracy)
  - `meadowEmpty`: "Start practising to see your Grammar creatures."
  - `nextFocus`: conditional "Trouble concepts need revision"
- SetupSidePanel `head` prop becomes null (eyebrow is now inside companion panel)
- `MonsterStripEntry` function stays defined in GrammarSetupScene.jsx (remains importable/exported if needed)
- Update data-contract test: change grammar markers to assert `monsterVisuals={` instead of `monsters={`, add `useMonsterVisualConfig` marker
- **Update `tests/react-grammar-surface.test.js`**: replace `grammar-monster-strip` assertion with `data-subject="grammar"` companion panel assertion (the strip is gone from rendered output; the test now asserts the companion panel renders with monster data attributes)
- **Update `tests/platform-setup-side-panel.test.js`**: the characterisation test at lines 282-319 constructs a fixture with `grammar-monster-strip` + `grammar-today` DOM. Update the fixture to pass a single `<SubjectCompanionPanel>` as body content, and update the byte-identical assertion to match the new DOM structure. The test's purpose (verifying SetupSidePanel passes body through correctly) is preserved with the new body shape.
- **CSP inline-style budget**: change classification for `GrammarSetupScene.jsx` from `'shared-pattern-available'` to `'dynamic-content-driven'` in `scripts/inventory-inline-styles.mjs`. Then run `node scripts/inventory-inline-styles.mjs` to obtain the new live count. Set `PRE_MIGRATION_TOTAL = new_live_count + SITES_MIGRATED_THIS_PR`. Regenerate the inventory markdown with `node scripts/inventory-inline-styles.mjs --write`.

**Patterns to follow:**
- `src/subjects/spelling/components/SpellingSetupScene.jsx:408-518` — exact benchmark

**Test scenarios:**
- Happy path: Grammar setup renders SubjectCompanionPanel with `data-subject="grammar"` as sole body child
- Happy path: Panel renders ss-meadow grid with img elements when dashboard has caught monsters
- Happy path: Stats render with ss-stat-grid class containing at least 3 stat items
- Happy path: Head renders eyebrow "Where you stand" and codex action button
- Edge case: When `dashboard.monsterStrip` is empty (all not-found), renders `meadowEmpty` text
- Edge case: When `dashboard.todayCards` is empty (isEmpty: true), stats still render with zero values
- Integration: Contract test `ui-companion-panel-data-contract.test.js` passes with updated grammar markers
- Integration: All existing companion panel contract tests remain green (responsive, phantom-class, P3 guardrails)
- Integration: CSP inline-style budget test passes after inventory bump
- Integration: `react-grammar-surface.test.js` passes with updated companion panel assertions
- Integration: `platform-setup-side-panel.test.js` passes with updated grammar fixture

**Verification:**
- `node --test tests/ui-companion-panel-*.test.js` passes
- `node --test tests/ui-p3-guardrails.test.js` passes
- `node --test tests/ui-phantom-class-contract.test.js` passes
- `node --test tests/csp-inline-style-budget.test.js` passes
- `node --test tests/react-grammar-surface.test.js` passes
- `node --test tests/platform-setup-side-panel.test.js` passes

---

- U2. **Punctuation sidebar migration to sole SubjectCompanionPanel**

**Goal:** Replace punctuation's sidebar body (MonsterStarMeter section + text-mode companion panel) with a single SubjectCompanionPanel using `monsterVisuals`, `head`, and its existing stats.

**Requirements:** R2, R3, R5, R6, R7, R8, R9

**Dependencies:** None (independent of U1, can be done in parallel or after)

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
- Modify: `src/subjects/punctuation/components/punctuation-view-model.js`
- Modify: `scripts/inventory-inline-styles.mjs`
- Modify: `docs/hardening/csp-inline-style-inventory.md`
- Modify: `tests/ui-companion-panel-data-contract.test.js`
- Test: `tests/ui-companion-panel-data-contract.test.js`
- Test: `tests/ui-companion-panel-contract.test.js` (must stay green)
- Test: `tests/ui-companion-panel-responsive-contract.test.js` (must stay green)
- Test: `tests/ui-phantom-class-contract.test.js` (must stay green)
- Test: `tests/ui-p3-guardrails.test.js` (must stay green)

**Approach:**
- Add a `punctuationMonsterImageVisual(monsterId, stage, visualConfig)` helper to `punctuation-view-model.js` (or reuse the existing `punctuationMonsterVisual` function adapted for the companion panel shape `{ style, imageProps }`)
- In PunctuationSetupScene: import `useMonsterVisualConfig` from platform, compute `panelMonsterVisuals` from `dashboard.activeMonsters`
- Replace the sidebar `body` prop: remove `<section className="punctuation-monster-row">` + old `<SubjectCompanionPanel>`, replace with single `<SubjectCompanionPanel>` using:
  - `head`: eyebrow "Your monsters" (moved from SetupSidePanel head)
  - `monsterVisuals`: computed array of `{ id, visual, isEgg }`
  - `stats`: unchanged `[{ label: 'Due today', ... }, { label: 'Wobbly', ... }, { label: 'Grand Stars', ... }]`
  - `meadowEmpty`: "Start practising to discover your first egg."
  - `nextFocus`: conditional "Wobbly spots need practice"
- SetupSidePanel `head` prop becomes null
- `MonsterStarMeter` function stays defined (remains importable if needed)
- Update data-contract test: change punctuation markers to assert `monsterVisuals={` instead of `monsters={`
- **CSP inline-style budget**: change classification for `PunctuationSetupScene.jsx` from `'shared-pattern-available'` to `'dynamic-content-driven'` in `scripts/inventory-inline-styles.mjs`. Run `node scripts/inventory-inline-styles.mjs` to obtain the new live count. Set `PRE_MIGRATION_TOTAL = new_live_count + SITES_MIGRATED_THIS_PR`. Regenerate the inventory markdown with `node scripts/inventory-inline-styles.mjs --write`.

**Patterns to follow:**
- `src/subjects/spelling/components/SpellingSetupScene.jsx:408-518` — exact benchmark
- `src/subjects/punctuation/components/punctuation-view-model.js:77-93` — existing `resolveMonsterVisual` usage

**Test scenarios:**
- Happy path: Punctuation setup renders SubjectCompanionPanel with `data-subject="punctuation"` as sole body child
- Happy path: Panel renders ss-meadow grid with img elements when dashboard has active monsters
- Happy path: Stats render unchanged (Due today, Wobbly, Grand Stars) with correct tones
- Happy path: Head renders eyebrow "Your monsters"
- Edge case: When `dashboard.activeMonsters` is empty, renders `meadowEmpty` text
- Edge case: When all stars are 0 (no discovered monsters), all cells render with egg class
- Integration: Contract test `ui-companion-panel-data-contract.test.js` passes with updated punctuation markers
- Integration: All existing companion panel contract tests remain green
- Integration: CSP inline-style budget test passes after inventory bump

**Verification:**
- `node --test tests/ui-companion-panel-*.test.js` passes
- `node --test tests/ui-p3-guardrails.test.js` passes
- `node --test tests/ui-phantom-class-contract.test.js` passes
- `node --test tests/csp-inline-style-budget.test.js` passes

---

- U3. **Contract hardening — enforce monsterVisuals for all subjects**

**Goal:** Update the data-contract test to assert that ALL three subjects pass `monsterVisuals` (not just spelling). This prevents regression back to text-mode `monsters` prop.

**Requirements:** R10, R8, R9

**Dependencies:** U1, U2

**Files:**
- Modify: `tests/ui-companion-panel-data-contract.test.js`
- Test: `tests/ui-companion-panel-data-contract.test.js`

**Approach:**
- In the source-text assertion loop (first test), change grammar and punctuation contracts to `useMonsterVisuals: true` (asserting `monsterVisuals={` instead of `monsters={`)
- Update markers for grammar: replace `dashboard.todayCards` with relevant new markers (e.g., `grammarMonsterImageVisual` or `useMonsterVisualConfig`)
- Ensure all three subjects share the same structural assertion: `monsterVisuals={`, `stats={`, `nextFocus={`, `head={`
- Add `head={` as a required marker for all three subjects
- The **second test** (render fixture at lines 96-150) intentionally keeps the `monsters` prop — it tests SubjectCompanionPanel's fallback rendering path and enforces the "no shaming copy" contract. This is correct: the component still accepts `monsters` as a prop for backward compatibility. Do NOT change the second test's fixture.

**Patterns to follow:**
- Existing test structure at line 60-93 of `tests/ui-companion-panel-data-contract.test.js`

**Test scenarios:**
- Happy path: All three subjects pass the monsterVisuals assertion
- Happy path: All three subjects pass the head prop assertion
- Error path: If grammar reverts to `monsters={`, the test fails with clear message
- Error path: If any subject removes `head={`, the test fails

**Verification:**
- `node --test tests/ui-companion-panel-data-contract.test.js` passes
- Temporarily removing `monsterVisuals={` from grammar source causes test failure

---

## System-Wide Impact

- **Interaction graph:** SetupSidePanel's `head` slot becomes unused for spelling/grammar/punctuation — the eyebrow content moves inside SubjectCompanionPanel. The slot remains available for future subjects.
- **Error propagation:** No new error paths. `useMonsterVisualConfig()` returns null when no provider exists (tests work without it). `resolveMonsterVisual` has built-in fallbacks.
- **State lifecycle risks:** None — SubjectCompanionPanel is stateless (R10 contract). Monster visuals are derived on each render from existing dashboard data.
- **API surface parity:** The `monsterImageVisual()` pattern is replicated per-subject as a local helper (not a shared API). If a future consolidation moves it to platform, these helpers can be deleted.
- **Integration coverage:** The data-contract test (source inspection) + companion-panel-contract test (rendered HTML) + responsive-contract test (CSS rules) together cover the full surface.
- **Unchanged invariants:** SetupSidePanel slot contract (head/body/footer) stays intact. SubjectCompanionPanel prop API unchanged. Footer content unchanged for all subjects.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| CSP inline-style budget trips when grammar/punctuation gain `style={visual.style}` | Bump PRE_MIGRATION_TOTAL and classify both files in inventory script — same pattern as spelling PR #874 |
| Grammar monsters may not have visual config data (MonsterVisualConfigProvider not mounted) | `useMonsterVisualConfig()` returns null gracefully; `resolveMonsterVisual` falls back to default asset path |
| Removing MonsterStripEntry from sidebar may break other callers | SC7 explicitly preserves it as importable; only the usage site inside SetupSidePanel body is removed |
| Data-contract markers change could break on unrelated PRs | Markers are chosen to be stable identifiers (function names, prop names) not fragile strings |
| Playwright E2E tests reference removed DOM classes (`.grammar-monster-strip`, `.punctuation-monster-meter-count`) | These run in a separate CI shard; selector updates to new `ss-meadow` / `companion-panel` DOM are mechanical. Implementer should update selectors as part of U1/U2 PR when Playwright shard fails |

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-04-companion-panel-cross-subject-alignment-requirements.md](docs/brainstorms/2026-05-04-companion-panel-cross-subject-alignment-requirements.md)
- Related code: `src/platform/ui/SubjectCompanionPanel.jsx`, `src/subjects/spelling/components/SpellingSetupScene.jsx`
- Related PRs: #874 (spelling alignment), #872 (CSS alignment)
- Design pattern: `docs/solutions/design-patterns/companion-panel-ss-alignment-2026-05-04.md`
