---
date: 2026-05-04
topic: companion-panel-cross-subject-alignment
---

# SubjectCompanionPanel Cross-Subject ss-* Alignment

## Problem Frame

PR #874 made `SubjectCompanionPanel` the single source of truth sidebar for **spelling** — absorbing `ss-head`, `ss-meadow` (rich monster visuals with breathing animation), and `ss-stat-grid` (subject-customised stats). Grammar and punctuation still use `SubjectCompanionPanel` as a **secondary supplementary display** alongside subject-specific components (`MonsterStripEntry`, `MonsterStarMeter`) that render duplicate content in separate DOM.

This means:
- Grammar's sidebar renders `MonsterStripEntry` components (custom images, star bars) + `TodayCard` grid + a text-mode companion panel repeating the same data
- Punctuation's sidebar renders `MonsterStarMeter` components + a text-mode companion panel repeating the same data
- Neither uses the rich `monsterVisuals` prop, `head` prop, or full `stats` customisation
- The design language is fragmented: spelling uses ss-* through the companion panel, others use ss-* directly in `SetupSidePanel` but with bespoke child components

The deliverable: make `SubjectCompanionPanel` the sole sidebar body for all subjects, using the same prop-driven pattern that spelling already demonstrates, so any future subject can plug in by providing its own `monsterVisuals`, `stats`, and `head`.

---

## Actors

- A1. Learner: Sees a consistent sidebar design across spelling, grammar, and punctuation setup screens
- A2. Subject developer: Adds a new subject by providing props to SubjectCompanionPanel — no bespoke sidebar components needed
- A3. Contract tests: Validate that each subject passes the required props and renders the correct DOM

---

## Success Criteria

SC1. Grammar and punctuation setup scenes use SubjectCompanionPanel as the **sole body** of SetupSidePanel (same pattern as spelling)  
SC2. Grammar passes `monsterVisuals` (rich art from monster-codex) instead of text-mode `monsters`  
SC3. Punctuation passes `monsterVisuals` (rich art from monster-codex) instead of text-mode `monsters`  
SC4. Grammar defines its own subject-specific stat cards (not a pass-through of todayCards)  
SC5. Punctuation retains its subject-specific stats (Due today, Wobbly, Grand Stars)  
SC6. Both subjects pass a `head` prop with eyebrow text + action button (matching spelling pattern)  
SC7. `MonsterStripEntry` and `MonsterStarMeter` remain importable for any non-sidebar usage but are removed from setup sidebar body  
SC8. `TodayCard` / `grammar-today-grid` removed from sidebar body (stats cover this via companion panel stat grid)  
SC9. Zero regression in existing contract tests (responsive, phantom-class, data-contract, adoption gate)  
SC10. New subject onboarding requires only: `monsterVisuals` array, `stats` array, `head` ReactNode, optional `meadowEmpty` and `nextFocus`  
SC11. All three subjects share identical `SetupSidePanel > SubjectCompanionPanel` structural pattern  

---

## Scope Boundaries

### In scope

- Migrate grammar sidebar body to sole SubjectCompanionPanel (with monsterVisuals + stats + head)
- Migrate punctuation sidebar body to sole SubjectCompanionPanel (with monsterVisuals + stats + head)
- Compute `monsterVisuals` for grammar and punctuation using `useMonsterVisualConfig()` + `monsterImageVisual()` (same hooks spelling uses)
- Design subject-specific stat cards for grammar (e.g., Concepts learned, Trouble concepts, Accuracy, Stars)
- Retain punctuation stat cards unchanged (already well-designed)
- Update `ui-companion-panel-data-contract.test.js` to assert `monsterVisuals` for grammar and punctuation
- Keep `MonsterStripEntry`, `MonsterStarMeter`, `TodayCard` alive as exports (may be used elsewhere)
- Clean up dead references inside setup sidebar body only

### Deferred / Out of scope

- Removing `MonsterStripEntry`, `MonsterStarMeter`, `TodayCard` component files entirely (may have other callers)
- Changing the SetupSidePanel slot architecture (head/body/footer contract stays)
- Changing the footer slot (ss-bank-link) for any subject
- New subjects beyond spelling/grammar/punctuation
- Hero mode companion panel (Hero has its own quest-driven sidebar)
- Monster codex filtering (bracehart in spelling) — separate bug

---

## Implementation Constraints

IC1. **No new inline styles for monster visuals** — the `style={m.visual.style}` pattern is already budget-counted for spelling; grammar/punctuation must use the same computed visual objects from `monsterImageVisual()` which are pre-classified as `dynamic-content-driven`  
IC2. **CSP inline-style budget** — if the count increases, bump `PRE_MIGRATION_TOTAL` and classify the file in `scripts/inventory-inline-styles.mjs`  
IC3. **P4 U1 CSS contract** — no new fixed-px widths, `min-width: 0` on flex children, responsive 820px breakpoint compliance  
IC4. **Data-contract test** — `ui-companion-panel-data-contract.test.js` already asserts grammar passes `monsters` and specific markers; update to assert `monsterVisuals` instead  
IC5. **3-subject adoption gate** — `ui-companion-panel-contract.test.js` already asserts all three subjects render SubjectCompanionPanel with `visible`; this stays green by maintaining the prop  
IC6. **SetupSidePanel wrapper** — the `head`/`body`/`footer` slot structure stays; only the `body` slot content changes from multiple sections to a single `<SubjectCompanionPanel>`  

---

## Delivery Pattern

The delivery follows the established autonomous SDLC:

1. **Grammar alignment PR** — single PR migrating grammar sidebar body
2. **Punctuation alignment PR** — single PR migrating punctuation sidebar body
3. **Contract hardening PR** (optional) — update data-contract assertions to enforce `monsterVisuals` for all three subjects

Each PR is independently merge-ready. Order: grammar first (more complex: has TodayCard + MonsterStrip), then punctuation (simpler: just MonsterStarMeter).

---

## Reference: Spelling Benchmark Pattern

The target state for each subject's sidebar body:

```jsx
<SetupSidePanel
  body={(
    <SubjectCompanionPanel
      subjectId="{subject}"
      visible
      head={(
        <>
          <p className="eyebrow">{eyebrowText}</p>
          <button className="ss-codex-link" ...>{actionLabel}</button>
        </>
      )}
      monsterVisuals={computedMonsterVisuals}
      stats={[
        { label: '...', value: '...', tone?: 'warn' },
        // 3-6 subject-specific stats
      ]}
      meadowEmpty="..."
      nextFocus={conditionalGuidanceText}
    />
  )}
  footer={...}
/>
```

Key functions for computing `monsterVisuals`:
- `useMonsterVisualConfig()` — hook providing monster visual configuration
- `monsterImageVisual(monsterId, config)` — returns `{ style, imageProps }` per monster

---

## Grammar-Specific Stat Design

Grammar's sidebar currently renders `TodayCard` components. The companion panel stat grid replaces this with:

| Stat label | Source | Tone |
|---|---|---|
| Concepts | Total concept count from dashboard | — |
| Trouble | `troubleCount` (concepts needing revision) | `warn` when > 0 |
| Today's cards | `dashboard.todayCards.length` | — |
| Accuracy | Derived from session history if available | — |

(Final stat selection subject to review during implementation — the contract requires at least 3 stats.)

---

## Punctuation-Specific Stat Design

Already well-designed in current companion panel usage:

| Stat label | Source | Tone |
|---|---|---|
| Due today | `dueCount` | `warn` when > 0 |
| Wobbly | `weakCount` | — |
| Grand Stars | `grandStars` | — |

These remain unchanged. The migration is structural (sole body) not data.

---

## Reusability Contract

For any future subject `X` to use the sidebar:

1. Provide `monsterVisuals` — array of `{ id, visual: { style, imageProps }, isEgg }` (use `useMonsterVisualConfig()` + `monsterImageVisual()`)
2. Provide `stats` — array of `{ label, value, tone? }` (3-6 items recommended)
3. Provide `head` — ReactNode with eyebrow + action button
4. Optionally provide `meadowEmpty` — empty state caption
5. Optionally provide `nextFocus` — conditional guidance text
6. Wrap in `<SetupSidePanel body={<SubjectCompanionPanel ... />} footer={...} />`

No new CSS, no new components, no subject-specific sidebar primitives needed.
