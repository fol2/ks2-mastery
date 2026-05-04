---
title: SubjectCompanionPanel as sole sidebar body across all subjects
date: 2026-05-04
module: platform-ui
problem_type: design_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - Adding a new subject that needs a setup sidebar
  - Migrating a subject's sidebar from bespoke components to the shared pattern
  - Modifying the companion panel head, stats, or monster meadow for any subject
tags:
  - companion-panel
  - ss-head
  - ss-meadow
  - ss-stat-grid
  - ss-codex-link
  - cross-subject-alignment
  - setup-sidebar
---

# SubjectCompanionPanel as sole sidebar body across all subjects

## Context

After UI Refactor P3, `SubjectCompanionPanel` existed as a platform primitive but each subject used it differently — spelling had it as the sole sidebar body with rich props, while grammar and punctuation rendered it as a secondary display alongside bespoke components (`MonsterStripEntry`, `MonsterStarMeter`). This caused design fragmentation: the same sidebar had three different structures across three subjects.

The cross-subject alignment (PRs #878, #880) made all three subjects follow an identical structural pattern: `SetupSidePanel > SubjectCompanionPanel` as the sole body content, with subject-specific data passed via props.

## Guidance

When implementing a setup sidebar for any subject, use this exact structural pattern:

```jsx
<SetupSidePanel
  asideClassName="{subject}-setup-sidebar"
  cardClassName="{subject}-setup-sidebar-card"
  ariaLabel="..."
  body={(
    <SubjectCompanionPanel
      subjectId="{subject}"
      visible
      head={(
        <>
          <p className="eyebrow">{eyebrowText}</p>
          <button
            type="button"
            className="ss-codex-link"
            data-action="open-codex"
            aria-label="Open the full codex"
            onClick={() => actions.dispatch('open-codex')}
          >
            Open codex →
          </button>
        </>
      )}
      monsterVisuals={computedMonsterVisuals}
      stats={[
        { label: '...', value: '...', tone?: 'warn' },
      ]}
      meadowEmpty="..."
      nextFocus={conditionalGuidanceText}
    />
  )}
  footer={...}
/>
```

### Key rules

1. **`ss-codex-link` is identical across all subjects** — same class, same `data-action="open-codex"`, same `aria-label="Open the full codex"`, same label "Open codex →", same dispatch `actions.dispatch('open-codex')`. No subject-specific action or label. This opens the global monster codex.

2. **`monsterVisuals` uses a subject-local helper** — each subject defines its own `{subject}MonsterImageVisual(monsterId, stage, visualConfig)` in its view-model. The helper calls `resolveMonsterVisual` + `monsterVisualFrameStyle` and returns `{ style, imageProps }`. Do not import across subjects.

3. **`stats` are curated per subject** — each subject picks 3-6 meaningful metrics from its dashboard model. Never pass a raw `.map()` of an existing card array.

4. **SetupSidePanel `head` prop is NOT used** — the eyebrow + codex link lives inside `SubjectCompanionPanel`'s own `head` prop. The SetupSidePanel `head` slot stays empty.

5. **Footer stays in SetupSidePanel** — the `ss-bank-link` footer (detailed link with subtitle) belongs to SetupSidePanel's `footer` prop, not inside the companion panel.

## Why This Matters

- **Consistency**: learners see the same sidebar structure across all subjects
- **Reusability**: new subjects need only props (monsterVisuals, stats, head), no new components
- **Contract tests**: `ui-companion-panel-data-contract.test.js` enforces `monsterVisuals={`, `stats={`, `head={`, `nextFocus={` for all subjects
- **CSS alignment**: the companion panel renders `ss-meadow`, `ss-stat-grid`, `ss-head` — the approved design language — without subjects needing to know the CSS

## When to Apply

- Adding a new subject (e.g., reading, maths) — follow this pattern from day one
- Modifying any subject's sidebar — maintain the sole-body pattern
- Adding new stats — add to the subject's curated `stats` array
- Changing the codex link — change it once in the pattern; all subjects share it

## Examples

**Computing monsterVisuals (grammar example):**
```javascript
const monsterVisualConfig = useMonsterVisualConfig();
const panelMonsterVisuals = dashboard.monsterStrip
  .filter((entry) => entry.displayState !== 'not-found')
  .slice(0, 4)
  .map((entry) => ({
    id: entry.monsterId,
    visual: grammarMonsterImageVisual(entry.monsterId, entry.stageIndex, monsterVisualConfig?.config),
    isEgg: entry.stageIndex === 0,
  }));
```

**Subject-specific stats (punctuation example):**
```javascript
stats={[
  { label: 'Due today', value: String(dueCount), tone: dueCount > 0 ? 'warn' : undefined },
  { label: 'Wobbly', value: String(weakCount) },
  { label: 'Grand Stars', value: String(grandStars) },
]}
```

## Related Issues

- PR #874 (spelling sole-body migration)
- PR #878 (grammar sole-body migration)
- PR #880 (punctuation sole-body migration)
- `docs/solutions/design-patterns/companion-panel-ss-alignment-2026-05-04.md` (CSS contract for the P4 primitive block)
