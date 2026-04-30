# UI Refactor P3 — Completion Report

**Source boundary**: Git evidence only. No production evidence gathered (deferred: requires human verification).

**Status**: Implemented and locally verified.

---

## PR Ledger

| PR    | Unit | Scope |
|-------|------|-------|
| #755  | U0   | Evidence map and visual inventory |
| #760  | U1   | Subject theme token contract |
| #769  | U3   | Session HUD and question progress engine |
| #772  | U2   | Action engine pass 1 |
| #774  | U6   | Shared summary engine |
| #777  | —    | Re-baseline bundle budget to 232,000 B (owner-approved) |
| #780  | U5   | Setup companion panel and monster/status engine |
| #781  | U4   | Practice stage and background scroller engine |
| #783  | U7   | Home dashboard hero perspective engine |
| #784  | U8   | Admin visual asset and property diagnostics |
| #786  | U9   | Guardrails, completion report, and release evidence |

---

## Unit-by-Unit Shipped Scope

### U0 — Evidence Map and Visual Inventory
- Created `ui-refactor-p3-evidence-map.md` documenting all surfaces requiring migration
- Catalogued raw `.btn`, inline styles, and hardcoded theme tokens across all learner scenes

### U1 — Subject Theme Token Contract
- Shipped `SubjectThemeScope.jsx` and `subject-themes.js` in `src/platform/ui/`
- Declared per-subject CSS custom properties in `styles/app.css` (`.subject-theme[data-subject]`)
- Migrated Spelling setup's inline `--btn-accent` to CSS cascade
- Added `ui-subject-theme-contract.test.js` and `ui-token-contract.test.js`

### U2 — Action Engine Pass 1
- Migrated all 6 session + summary scenes to the shared `<Button>` primitive
- Retired all raw `.btn` class-string call sites in session/summary/setup/home surfaces
- Added `ui-action-engine-contract.test.js`

### U3 — Session HUD and Question Progress Engine
- Shipped `SessionHUD.jsx` in `src/platform/ui/`
- Adopted by all 3 session scenes (Spelling, Grammar, Punctuation)
- Added `ui-session-hud-contract.test.js`

### U4 — Practice Stage and Background Scroller Engine
- Shipped `PracticeStage.jsx` with `reducedMotionFallback` accessibility support
- Shipped `HeroBackdrop.jsx` and background scroller utilities
- Added `ui-practice-stage-contract.test.js`

### U5 — Setup Companion Panel and Monster/Status Engine
- Shipped `SubjectCompanionPanel.jsx` in `src/platform/ui/`
- Adopted by all 3 setup scenes (Spelling, Grammar, Punctuation)
- Added `ui-companion-panel-contract.test.js`

### U6 — Shared Summary Engine
- Shipped `SessionSummaryFrame.jsx` in `src/platform/ui/`
- Adopted by all 3 summary scenes (Spelling, Grammar, Punctuation)
- Added `ui-summary-engine-contract.test.js`

### U7 — Home Dashboard Hero Perspective Engine
- Shipped `HomeHeroScene.jsx` in `src/platform/ui/`
- Accepts `readySubjects` prop for future-subject integration
- Added `ui-home-hero-scene-contract.test.js`

### U8 — Admin Visual Asset and Property Diagnostics
- Shipped `AdminVisualEngineSection.jsx` with `SectionHeader` adoption
- Added `admin-visual-engine-diagnostics.test.js`

### U9 — Guardrails, Completion Report, and Release Evidence
- Consolidated 15 parser-level ratchets in `tests/ui-p3-guardrails.test.js`
- This completion report

---

## Approved Visual Changes

No intentional visual changes were approved in P3. All migrations preserve existing appearance — the primitives render identical output to the pre-migration inline/class-based implementations. Visual verification is deferred to production smoke testing.

---

## Tests

New test files created across P3:

- `tests/ui-subject-theme-contract.test.js` (U1)
- `tests/ui-token-contract.test.js` (U1)
- `tests/ui-action-engine-contract.test.js` (U2)
- `tests/ui-session-hud-contract.test.js` (U3)
- `tests/ui-practice-stage-contract.test.js` (U4)
- `tests/ui-companion-panel-contract.test.js` (U5)
- `tests/ui-summary-engine-contract.test.js` (U6)
- `tests/ui-home-hero-scene-contract.test.js` (U7)
- `tests/admin-visual-engine-diagnostics.test.js` (U8)
- `tests/ui-p3-guardrails.test.js` (U9)
- `tests/ui-completion-report-claims.test.js` (pre-existing P2, extended)

---

## Bundle

- New ceiling: **232,000 B** gzip (re-baselined with owner approval in #777)
- Baseline: 210,000 B
- Headroom ratio: baseline x 1.105 = 232,050 — gate trips on ~50 KB adult-only JS regression

---

## Inline-Style Budget

- POST_MIGRATION_TOTAL: **245** sites (down from 439 pre-migration)
- 194 sites migrated across P2-P3

---

## SectionHeader Resolution

SectionHeader: adopted (3 adopters):
1. `src/platform/ui/SubjectCompanionPanel.jsx`
2. `src/platform/ui/SessionSummaryFrame.jsx`
3. `src/surfaces/hubs/AdminVisualEngineSection.jsx`

---

## Future-Subject Integration Points

All 6 integration points are implemented and locally verified:

1. **Theme declaration**: `styles/app.css` (`.subject-theme[data-subject="reading|reasoning|arithmetic"]`) — CSS custom properties declared for reading, reasoning, and arithmetic alongside the three live subjects
2. **Companion panel adapter**: `src/platform/ui/SubjectCompanionPanel.jsx` — accepts any `subjectId`; new subjects supply monster/status data via the same prop contract
3. **Session HUD adapter**: `src/platform/ui/SessionHUD.jsx` — accepts any `subjectId`; renders subject-themed progress/star display
4. **Summary frame adapter**: `src/platform/ui/SessionSummaryFrame.jsx` — accepts any `subjectId`; renders post-session results in subject theme
5. **Practice stage selection**: `src/platform/ui/PracticeStage.jsx` — accepts any `subjectId` + `backdrop`; reduced-motion-safe animation engine
6. **Home card data contract**: `src/platform/ui/HomeHeroScene.jsx` — `readySubjects` prop renders cards for any subjects in the array

---

## Known Deferrals

- **Production smoke tests**: NOT run (requires deployed build + human review)
- **Screenshot approval**: NOT captured (requires visual regression tooling)
- **Live verification**: NOT performed (requires human navigating production)
- **SegmentedControl primitive**: Deferred from P2, remains deferred

---

## Explicit Non-Claims

The following are explicitly NOT claimed by this report:

- Design system completeness — NOT claimed. P3 ships 5 new primitives; the full design system remains in progress.
- Full button migration — NOT claimed. Session/summary/setup/home scenes are migrated; practice surfaces and modals retain legacy `.btn` patterns.
- Total inline style removal — NOT claimed. 245 inline-style sites remain (down from 439).
- Production verification — NOT claimed. All evidence is source-level; production verification requires human deployment.
- Hero Mode economy readiness — NOT claimed. P3 touches UI primitives only; Hero Mode economy is a separate workstream.
- Future subject implementation — NOT claimed. Integration points are declared and accept arbitrary `subjectId` values; no future subject content exists.
