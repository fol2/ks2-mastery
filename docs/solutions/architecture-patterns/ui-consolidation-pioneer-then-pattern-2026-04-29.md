---
title: "UI Consolidation: Pioneer-then-Pattern (Grammar pilot → Spelling retrofit → Punctuation adoption)"
date: 2026-04-29
category: architecture-patterns
module: platform/ui
problem_type: architecture_pattern
component: frontend_stimulus
severity: medium
related_components:
  - testing_framework
  - tooling
applies_when:
  - Extracting platform primitives from a subject that matured UI/UX organically
  - Choosing between the first-matured implementation and a later pilot's refined API
  - Running parallel autonomous SDLC cycles across multiple subjects in one campaign
  - Retrofitting an origin subject to a pilot-derived platform API
  - Rolling a platform backdrop/chrome engine across heterogeneous scene types
tags:
  - platform-extraction
  - pioneer-then-pattern
  - autonomous-sdlc
  - ui-consolidation
  - hero-backdrop
  - cross-subject-refactor
  - adversarial-review
  - ks2-mastery
---

# UI Consolidation: Pioneer-then-Pattern (Grammar pilot → Spelling retrofit → Punctuation adoption)

## Context

Three subjects in ks2-mastery (Spelling, Grammar, Punctuation) were diverging on near-identical UI primitives: slide-button length pickers, hero welcome copy, and setup side-panel shells. Spelling matured organically as the origin subject, its patterns evolving through accretion. When PR #591 overhauled Grammar's Setup scene to align with Spelling's shared hero engine (`HeroBackdrop`, `useSetupHeroContrast`, `.setup-grid`), it incidentally produced prop-driven API shapes that were cleaner than Spelling's organically-evolved ones.

Punctuation lagged further — its hero was a static `<img srcSet>` inside `.punctuation-strip`, visually incongruent with Spelling's and Grammar's cross-fade backdrop. Three consolidation gaps had become load-bearing: (1) `LengthPicker` / `RoundLengthPicker` / `YearPicker` forked across two subjects with byte-identical DOM, (2) the `"Hi {name} — ready for a short round?"` copy was duplicated inline across Grammar and Punctuation, and (3) the `.ss-card` / `.ss-head` sidebar shell was Spelling-origin, reused by Grammar through brand-suffixed overrides, absent from Punctuation.

The strategic inversion: canonicalise **Grammar's** pilot API shape rather than Spelling's origin shape. Spelling would retrofit into the primitives that had nominally been extracted from its own code. This trusts the pilot's refined extraction over the origin's accretion.

## Guidance

1. **When to extract** — Two concrete consumers, not speculation. This campaign's U1-U3 each had at least two real adopters before extraction (Spelling + Grammar). Do not pre-extract against imagined third consumers.

2. **Who wins the API shape** — The adopter that last refined the pattern wins, not the one that implemented it first. The pilot becomes canonical; the origin retrofits. Here: Grammar's `{options, selectedValue, onChange, disabled, ariaLabel, unit}` beat Spelling's `{prefs, actions, disabled}`. Spelling's hardcoded action-dispatch was pushed up into consumer closures where subject-specific dispatch belongs.

3. **Third-adopter as proof-of-abstraction** — The third consumer is the API falsifier. If it needs new props to adopt, those are real gaps, not speculative. Punctuation's `LengthPicker` required `includeDataValue` (to emit `data-value` where Punctuation's original toggle did, but Grammar/Spelling don't) — this gap was only visible once Punctuation tried to adopt.

4. **Characterisation-proof discipline** — Render byte-identical DOM before merging. Existing test regex like `class="length-option selected"[^>]*value="5"[^>]*disabled=""` are load-bearing: their `[^>]*` wildcards assume a specific attribute-insertion order. Preserve that order in the platform component.

5. **Slot-based, not model-based** — Platform shells pass through opaque `ReactNode` slots. `SetupSidePanel` takes `head` / `body` / `footer`; it knows nothing about codex links, monster strips, or bank copy. Never bake in subject-content assumptions.

6. **Preserve default-tag semantics** — `SetupSidePanel`'s `headTag` defaults to `'div'` because Spelling's existing DOM uses `<div>`; Grammar explicitly passes `headTag='header'`. The platform default matches the origin subject's characterisation baseline.

7. **Main-repo-untouched worktree discipline** — Every worker runs in a `git worktree add` off `origin/main`. The main repo's working tree stays on `main` throughout the campaign. All merges route through `gh pr merge --squash --auto --delete-branch` (plumbing-only; no working tree touch). Anti-pattern list needs to be explicit in each worker brief: no `git checkout`, no `git stash`, no `git pull`, no `git reset`, no `git rebase`, no `git restore`, no `npm run build:bundles`, no `npm test`, no file edits in the main repo path.

8. **Fire-and-delegate SDLC orchestrators** — A scrum-master dispatches sub-orchestrators per PR. Each handles review + follower iteration + merge inline, returning a compact summary. Scrum-master context stays bounded; this is the scaling property.

9. **Parallel non-overlapping workers** — U2 + U3 shared no files and ran concurrently, shaving 8-10 min off critical path. Gate only on file-level overlap.

10. **Adversarial review at planning time** — 11 HIGH-severity findings were caught during plan deepening (`/ce-plan`) and doc review (`/ce-doc-review`) that would have been PR-level regressions. The convergence signal — three independent reviewers finding the same gap — is especially trustworthy; that's how the `.punctuation-hero` vs `.punctuation-strip` Map-scene class discrepancy was caught.

## Why This Matters

Without the pilot-over-origin inversion, Spelling would have remained canonical by default, and every future subject retrofit would match Spelling's legacy quirks (hardcoded action dispatch, `{prefs, actions}` coupling, nested-tree sidebar). The inversion lets the pilot's clean-up pass become the baseline for everyone, including the origin.

Cross-subject visual consistency was the product-facing goal — three subjects now share the same hero engine. The Pioneer-then-Pattern approach is the org-facing mechanism that made that cheap. It converts "extract the common parts" (a thankless cleanup) into "canonicalise the refined shape" (a forward-looking design decision).

The SDLC execution model shipped 7 PRs plus documentation in ~3h 10m with zero regressions, and main's CI moved from `# fail 13` to `# fail 0` during the campaign (partly due to unrelated reconciliation PRs landing concurrently, partly because the campaign introduced zero new failures that would have held the baseline up). Scaling characteristic: each unit adds ~30-45 min regardless of campaign length because orchestrator context stays bounded. Campaigns fit cleanly into a single working day.

## When to Apply

- When 2+ subjects have near-identical inline implementations of the same UI primitive
- When a new subject is about to adopt and can serve as the third-consumer abstraction test
- When one adopter has recently refined the shape (e.g. via a separate alignment PR) — that adopter becomes the pilot
- When the planning phase has budget for an adversarial review / deepening pass
- When characterisation tests exist on the pioneer's DOM (or can be added cheaply before extraction)
- When the campaign fits a single working day — longer campaigns need different orchestration
- When `git worktree` is available and the CI baseline is tracked as a live `# fail N` signature rather than a frozen number

## Examples

**Example 1 — `LengthPicker` API inversion**. Grammar's `RoundLengthPicker` used `{options, selectedValue, onChange, disabled, ariaLabel, unit}`. Spelling's `YearPicker` used `<YearPicker prefs={prefs} actions={actions} />` with hardcoded labels and baked-in `renderAction` dispatch. The canonical platform `LengthPicker` adopted Grammar's shape but extended `options` to accept both `Array<string>` (Grammar/Punctuation round-length) and `Array<{value, label}>` (Spelling year-filter, where `{value: 'y3-4', label: 'Y3-4'}` preserves visible "Y3-4" while serialising `'y3-4'`). Spelling's year-filter call-site became `<LengthPicker options={YEAR_FILTER_OPTIONS} onChange={closure} />` where the closure carries subject-specific `renderAction(actions, event, 'spelling-set-pref', { pref: 'yearFilter', value })` dispatch that was previously baked into the component. Three opt-in locator preservers (`actionName`, `prefKey`, `includeDataValue`) kept every existing `data-action` / `data-pref` / `data-value` attribute for Playwright and Admin Debug Bundle locators.

**Example 2 — Map scene `.punctuation-hero` discovery**. Mid-plan review, three independent adversarial reviewers (scope-guardian, feasibility, adversarial-dimension) converged on one finding: `PunctuationMapScene.jsx:372` uses `.punctuation-hero`, not `.punctuation-strip` like Session/Summary. The Map's legacy class predates Session/Summary's. Without that convergence signal during doc-review, U6's scope would have silently missed half its target class and shipped a half-done migration. The three-reviewer convergence was the trust signal — not any single reviewer's confidence.

## Related

- Plan: [`docs/plans/2026-04-29-008-refactor-ui-consolidation-grammar-pilot-to-punctuation-plan.md`](../../plans/2026-04-29-008-refactor-ui-consolidation-grammar-pilot-to-punctuation-plan.md)
- Completion report: [`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`](../../plans/james/ui-refactor/2026-04-29-completion-report.md)
- PRs (fol2/ks2-mastery): #594 (U1 LengthPicker), #595 (U2 HeroWelcome), #596 (U3 SetupSidePanel), #597 (U4 Punctuation Setup), #598 (U5 Punctuation Session), #602 (U6 Punctuation Summary+Map), #603 (U7 cleanup sweep), #605 (docs)
- Intellectual predecessor — monolith-to-sectioned UI decomposition with characterisation discipline: [`docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md`](./admin-console-section-extraction-pattern-2026-04-27.md)
- Prior autonomous-SDLC architecture pattern (wave-based parallel SDLC with worktree isolation): [`docs/solutions/architecture-patterns/admin-console-p5-operator-readiness-parallel-sdlc-2026-04-28.md`](./admin-console-p5-operator-readiness-parallel-sdlc-2026-04-28.md)
- Most recent autonomous-SDLC exemplar (main-repo-untouched rule stated explicitly): [`docs/solutions/architecture-patterns/admin-console-p7-business-ops-autonomous-sdlc-2026-04-29.md`](./admin-console-p7-business-ops-autonomous-sdlc-2026-04-29.md)
- Sibling multi-phase QG pattern: [`docs/solutions/architecture-patterns/grammar-qg-p7-production-calibration-activation-2026-04-29.md`](./grammar-qg-p7-production-calibration-activation-2026-04-29.md)
- Wave-execution workflow precedent: [`docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md`](../workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md)
- Origin of the 13-unit autonomous sprint pattern: [`docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md`](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md)
