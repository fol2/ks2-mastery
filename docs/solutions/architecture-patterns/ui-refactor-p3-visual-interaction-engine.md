---
title: "UI Refactor P3 — Visual Interaction Engine Delivery"
type: architecture-pattern
created: 2026-04-30
tags: [ui, css-tokens, design-system, platform-primitives, accessibility]
---

# Visual Interaction Engine — Solved Problem

## Problem

Three ready subjects (Spelling, Grammar, Punctuation) felt like three separate products. Session progress, setup companions, summary outcomes, and background stages were all subject-specific implementations with duplicated logic and inconsistent identity.

## Solution: Token-Driven Shared Primitives

P3 established a visual interaction engine where subject identity flows through CSS custom properties and shared components consume those tokens — rather than each subject hand-building its own chrome.

### Key Patterns

1. **SubjectThemeScope wrapping**: A zero-runtime `<div class="subject-theme" data-subject={id}>` provides CSS variable context. Subject tokens (accent, accentInk, accentSoft, accentBorder) cascade to all children via `.subject-theme[data-subject="X"]` selectors in `styles/app.css`.

2. **Shallow adapters over deep rewrites**: Each subject creates a thin adapter function mapping its existing view-model into the shared component's props. No subject internals leak into platform UI.

3. **Pioneer-then-pattern**: SessionHUD demanded 3-subject adoption from day one (cross-subject progress language is the product point). Other primitives were proven by 2 consumers first.

4. **Hidden-until-ready**: SubjectCompanionPanel ships with `visible=false` (HTML hidden attribute) — adopted in the DOM for contract compliance but not visible until the legacy display it replaces is deprecated. Prevents visual regression during migration.

5. **Budget governance**: Bundle ceiling changes require explicit owner approval with evidence. Workers cannot self-approve re-baselines.

### Components Shipped

| Component | Role | Lines |
|-----------|------|-------|
| SubjectThemeScope | CSS variable provider | ~15 |
| SessionHUD | Progress display | ~65 |
| ActionRow | Layout hierarchy | ~40 |
| SessionSummaryFrame | Post-session outcomes | ~60 |
| SubjectCompanionPanel | Monster/stats display | ~52 |
| PracticeStage | Decorative backdrop | ~55 |
| HomeHeroScene | Dashboard wrapper | ~65 |

### Guardrails

- Token ratchet: zero raw hex in learner JSX
- Button ratchet: raw `.btn` count locked at P3 ceiling
- One-primary-action: at-most-one `variant="primary"` per decision branch
- Reduced-motion: all animated components honour `prefers-reduced-motion`
- Forbidden copy: no manipulative language in learner-facing components

## When to Apply

- Adding a new subject: declare theme tokens in `styles/app.css`, implement the 6 integration point adapters
- Adding a new shared component: pioneer-then-pattern (prove with 2+ real consumers before generalising)
- Migrating raw `.btn` buttons: use `<Button>` with `dataAction` prop to preserve selectors
- Changing bundle ceiling: requires owner-approved re-baseline PR with measurement evidence
