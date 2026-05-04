---
title: Companion panel aligned to ss-* design language
date: 2026-05-04
module: platform-ui
problem_type: design_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - Adding a new platform UI component that displays stats or entity lists
  - Aligning a newer component to the established ss-* sidebar patterns
  - Working within the P4 U1 CSS primitive block in styles/app.css
tags:
  - companion-panel
  - ss-stat-grid
  - ss-meadow
  - design-alignment
  - css-contract-tests
  - responsive-overflow
---

# Companion panel aligned to ss-* design language

## Context

`SubjectCompanionPanel` (src/platform/ui/SubjectCompanionPanel.jsx) was introduced in UI Refactor P3 as a generic display-only sidebar widget. Its original styling (flat text list for monsters, inline flex row for stats) diverged visually from the approved `ss-*` design language used in Spelling and Punctuation setup sidebars (`ss-head`, `ss-meadow`, `ss-stat-grid`). The goal was "align first, consolidate later" — inherit the visual patterns without removing the legacy elements yet.

## Guidance

When adding or restyling components within the P4 U1 CSS primitive block (lines ~13397–13809 in `styles/app.css`), follow these constraints enforced by contract tests:

1. **No fixed `px` on `width:` or `min-width:` properties** — use `rem`, `%`, or CSS custom properties instead. The test `ui-phantom-class-contract.test.js` rejects any line matching `^\s*(?:min-)?width:\s*\d+px` in that block.

2. **Every flex/grid child must have `min-width: 0`** — the test `ui-companion-panel-responsive-contract.test.js` asserts this on `.companion-panel-stat` and `.companion-panel-monster-list` to prevent overflow on narrow viewports.

3. **Responsive breakpoints require explicit stat column collapse** — the 820px media query must include a `flex-direction: column` rule for stat containers, even if that's already the default (the contract test asserts its presence explicitly).

4. **Stats inherit the ss-stat-grid recipe**: 2-column grid (`repeat(2, minmax(0, 1fr))`), stacked label/value boxes, uppercase `0.78rem` label, serif `1.6rem` value, `14px` border-radius, `var(--panel-soft)` background.

5. **Entity grids inherit the ss-meadow recipe**: `repeat(auto-fit, minmax(64px, 1fr))` with square `aspect-ratio: 1/1` cells. For text-based grids (no images), use a circular glyph initial + ellipsised name below.

## Why This Matters

The P4 CSS block has three contract tests that fail instantly if violated:
- `ui-companion-panel-responsive-contract.test.js` — enforces `min-width: 0` and responsive patterns
- `ui-phantom-class-contract.test.js` — rejects fixed-px widths in the primitive layer
- `ui-companion-panel-contract.test.js` — asserts DOM structure (li content, data attributes)

These tests exist because the platform primitives run on viewports from 320px to 1440px+. A single `width: 28px` (as we initially wrote for the monster glyph) causes CI failure because it violates the "no fixed-width overflow" contract.

## When to Apply

- Restyling any component whose CSS lives within the P4 U1 primitive block
- Adding new platform UI widgets that display stats, entities, or tile grids
- Aligning newer components to the established ss-* sidebar patterns
- Any CSS change between the `/* --- P4 U1` and `/* StatCard primitive` markers in app.css

## Examples

**Stats — before (flat inline flex):**
```css
.companion-panel-stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 10px;
}
```

**Stats — after (ss-stat-grid aligned):**
```css
.companion-panel-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  background: var(--panel-soft);
}
.companion-panel-stat dt {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.companion-panel-stat dd {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.6rem;
  font-weight: 500;
  letter-spacing: -0.015em;
}
```

**Glyph sizing — wrong (triggers contract test):**
```css
.companion-panel-monster-glyph {
  width: 28px;   /* FAILS: fixed px in P4 block */
  height: 28px;
}
```

**Glyph sizing — correct:**
```css
.companion-panel-monster-glyph {
  width: 1.75rem;   /* 28/16 = 1.75rem — no px */
  height: 1.75rem;
}
```

## Related Issues

- PR #872 (squash-merged to main)
- UI Refactor P3 (introduced SubjectCompanionPanel)
- UI Refactor P4 (introduced P4 primitive CSS block and contract tests)
