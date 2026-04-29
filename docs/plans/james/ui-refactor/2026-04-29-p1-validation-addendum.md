# UI Refactor P1 — Validation Addendum (P2 U0)

**Date**: 2026-04-29
**Plan**: [`docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md`](../../2026-04-29-011-refactor-ui-shared-primitives-plan.md), unit **U0**
**Origin contract**: [`docs/plans/james/ui-refactor/ui-refactor-p2.md`](./ui-refactor-p2.md)
**Predecessor completion report**: [`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`](./2026-04-29-completion-report.md)
**Repository commit at write-time**: `e7fa3b59` (`origin/main`)

---

## 1. Why this addendum exists

The P2 origin contract (`ui-refactor-p2.md` §2) reports:

> The requested P1 report path is not present in the supplied bundle:
> `docs/plans/james/ui-refactor/2026-04-29-completion-report.md`

That observation came from a **partial bundle**. The completion report **does** exist in the live repository at the path above, dated 2026-04-29, covering PRs #594–#603 (units U1–U7 of the predecessor "consolidation-only" campaign that landed `LengthPicker`, `HeroWelcome`, `SetupSidePanel`, and the Punctuation hero-engine adoption).

This addendum reconciles origin §2 with repo reality so that downstream P2 units may rely on a verifiable "post-P1 state" rather than a partial-bundle reading.

The addendum is documentation-only. It introduces no behavioural change, no test oracle, and no source modification. Verification is human review of evidence accuracy against the live tree at commit `e7fa3b59`.

---

## 2. P1 verification — commands run and observed results

### 2.1 Environment

| Item | Observed value | Source |
| --- | --- | --- |
| Repository `.nvmrc` | `22` | `cat .nvmrc` |
| Node version used to run targeted tests | `v22.16.0` | `nvm use 22 && node --version` |
| Worktree shell default Node | `v24.2.0` | unmanaged shell snapshot |
| `node_modules` present in worktree | **No** at `.worktrees/.../node_modules` directly; available via symlink to main checkout | `ls .worktrees/refactor/ui-p2-u0-evidence-addendum/node_modules` |
| `node_modules` present in main checkout | Yes (`react`, `esbuild`, `@cloudflare`, etc.) | `ls /Users/jamesto/Coding/ks2-mastery/node_modules` |

The `.nvmrc`-pinned Node is `22`; targeted tests below were executed under Node 22.16.0.

### 2.2 Commands run during this addendum's preparation

All commands were executed under Node 22.16.0 (`nvm use 22`) at commit `e7fa3b59`:

```bash
node --version                              # v22.16.0
node --test tests/empty-state-parity.test.js
node --test tests/empty-state-primitive.test.js   # run from main checkout (see 2.3)
node --test tests/bundle-byte-budget.test.js
```

### 2.3 Observed results

| Command | Result | Notes |
| --- | --- | --- |
| `node --test tests/empty-state-parity.test.js` (worktree) | **9 pass / 0 fail** | All allowlist + canonical-copy assertions hold. |
| `node --test tests/empty-state-primitive.test.js` (worktree) | 4 pass / 10 fail | Failures are environmental: esbuild's tmpdir build cannot resolve `react` / `react-dom/server` / `react/jsx-runtime` through the worktree's symlinked `node_modules`. **Not a code regression.** |
| `node --test tests/empty-state-primitive.test.js` (main checkout) | **14 pass / 0 fail** | Same test, same commit, real `node_modules` — confirms the worktree failures are a symlink-resolution artefact. |
| `node --test tests/bundle-byte-budget.test.js` (worktree) | **6 pass / 0 fail** | Includes the real `app.bundle.js` gzip-under-budget assertion. |

The full P1 verification matrix (`npm test`, `npm run build`, `npm run audit:client`, `npm run check`, Playwright suites) is **not re-run here**. This addendum re-verifies only the targeted P1 oracles called out in plan U0's Approach. The predecessor completion report (linked above) is the authority on P1's full-run state at PR-merge time.

### 2.4 Non-claims

- This addendum does **not** claim that `npm test`, `npm run build`, `npm run audit:client`, or `npm run check` were re-run at commit `e7fa3b59`.
- This addendum does **not** claim that Playwright visual-baselines pass at commit `e7fa3b59`.
- The 10 worktree failures of `tests/empty-state-primitive.test.js` are documented as environmental, not as test breakage in repository code.

---

## 3. Current `src/platform/ui/` inventory

Snapshot of `ls src/platform/ui/` at commit `e7fa3b59` (12 files):

| File | One-line purpose |
| --- | --- |
| `EmptyState.jsx` | Shared empty-state primitive (`role="status"`, title + body + optional CTA). Five production consumers. |
| `ErrorCard.jsx` | Shared error primitive with optional retry button + `data-error-code` for SH2-U12 oracle. ≥ 2 production import sites (allowlist test). |
| `LoadingSkeleton.jsx` | Shared loading skeleton with `prefers-reduced-motion` carve-out. |
| `HeroBackdrop.jsx` | Shared cross-fading hero artwork engine (slow horizontal pan). Used by Grammar setup, Spelling setup, and Punctuation Setup/Session/Summary/Map. |
| `hero-bg.js` | Hero-backdrop URL helper (no view-model logic; subject-specific bg modules call it). |
| `hero-copy.js` | Pure helper `heroWelcomeLine(name)` returning the welcome string or empty. |
| `HeroWelcome.jsx` | Thin React shell over `hero-copy.js` rendering `<p>` or `null`. Adopted by Grammar / Punctuation / Spelling setup scenes. |
| `LengthPicker.jsx` | Canonical slide-button picker (round-length and Spelling year-filter). Adopted by Grammar / Punctuation / Spelling setup scenes. |
| `SetupSidePanel.jsx` | Slot-based sidebar shell (`head` / `body` / `footer`). Adopted by Grammar + Spelling setup; not adopted by Punctuation (single-column dashboard, declared out-of-scope in predecessor R3). |
| `SetupMorePractice.jsx` | Shared "More Practice" disclosure used by Grammar / Punctuation / Spelling setup. |
| `useSetupHeroContrast.js` | Hook that probes hero artwork luminance and emits a contrast profile. Used alongside `HeroBackdrop`. |
| `luminance.js` | Pure luminance utility powering `useSetupHeroContrast`. |

No `Button.jsx`, `Card.jsx`, `ProgressMeter.jsx`, `StatCard.jsx`, `SectionHeader.jsx`, or `SegmentedControl.jsx` exists at this commit — verified by `ls src/platform/ui/Button* …` (no match).

---

## 4. Per-surface adoption map (state primitives + setup primitives)

Adoption is read from `import { EmptyState | ErrorCard | LoadingSkeleton } …` statements and from documented call-sites at commit `e7fa3b59`. "Adopted" means at least one render call inside the surface's component tree.

| Surface | `EmptyState` | `ErrorCard` | `LoadingSkeleton` | `HeroBackdrop` | `LengthPicker` | `HeroWelcome` | `SetupSidePanel` | `SetupMorePractice` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Hero Mode** (`src/surfaces/home/HeroQuestCard.jsx`) | No (hand-rolled `.hero-quest-card--empty` at line 241) | No (early-return on error) | No | No | n/a | n/a | n/a | n/a |
| **Spelling** (`src/subjects/spelling/components/`) | Yes — `SpellingWordBankScene.jsx:337` | No documented adoption | No documented adoption | Yes — `SpellingHeroBackdrop.jsx` (alias wrapper around shared) | Yes — `SpellingSetupScene.jsx` | Yes — `SpellingSetupScene.jsx` | Yes — `SpellingSetupScene.jsx` | Yes — `SpellingSetupScene.jsx` |
| **Grammar** (`src/subjects/grammar/components/GrammarSetupScene.jsx`) | Yes — line 326 | No | No | Yes — line 230 | Yes — line 257 | Yes — line 235 | Yes — line 293 | Yes — line 364 |
| **Punctuation** (`src/subjects/punctuation/components/`) | No documented adoption in setup/session/summary/map | No | No | Yes — Setup, Session, Summary, Map | Yes — `PunctuationSetupScene.jsx` | Yes — `PunctuationSetupScene.jsx` | No (single-column; deferred per predecessor R3) | Yes — `PunctuationSetupScene.jsx` |
| **Parent Hub** (`src/surfaces/hubs/ParentHubSurface.jsx`) | Yes — lines 90, 102 | No documented adoption | No documented adoption | n/a | n/a | n/a | n/a | n/a |
| **AdminPanelFrame** (`src/surfaces/hubs/AdminPanelFrame.jsx`) | No — hand-rolled `<p class="small muted admin-panel-frame-placeholder">No data available.</p>` at line 106 | No | No — hand-rolled `<div class="small muted admin-panel-frame-placeholder">Loading panel data...</div>` at line 98 | n/a | n/a | n/a | n/a | n/a |

Other adopters of state primitives observed (out of P2's primary adoption-map scope but worth recording for completeness):

- `src/surfaces/home/MonsterMeadow.jsx` — `EmptyState` + `LoadingSkeleton` imports
- `src/surfaces/home/CodexCreatureLightbox.jsx` — `EmptyState` + `LoadingSkeleton` imports
- `src/surfaces/home/CodexSurface.jsx` — `EmptyState` + `LoadingSkeleton` imports
- `src/surfaces/subject/SubjectRuntimeFallback.jsx` — `LoadingSkeleton` import
- `src/surfaces/hubs/hub-utils.js` + `src/platform/hubs/admin-panel-frame.js` — derive `frameState.showLoadingSkeleton` / `frameState.showEmptyState` flags but **AdminPanelFrame's render path still hand-rolls placeholders rather than calling the primitives**.

---

## 5. Known gaps that P2 owns

Each gap has been verified against the live tree at commit `e7fa3b59` and maps to a P2 implementation unit in `docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md`.

| # | Gap | Evidence | P2 unit |
| --- | --- | --- | --- |
| 1 | **No shared `Button` primitive** | `ls src/platform/ui/Button*` returns no match. Surfaces still call `<button className="btn primary xl">` directly. | **U1** — adds `Button.jsx`; migrates 5 high-signal CTAs (Grammar setup, HeroQuestCard, Punctuation setup, Home hero, AdminPanelFrame Refresh). |
| 2 | **HeroQuestCard hand-rolled empty branch** | `src/surfaces/home/HeroQuestCard.jsx:241` renders `<div className="hero-quest-card hero-quest-card--empty">` with bespoke title + message. | **U5** — replaces with `<EmptyState>` and adds `tests/empty-state-parity.test.js` allowlist entry. |
| 3 | **HeroQuestCard hand-rolled error branch (currently early-return)** | No `ErrorCard` import; data-load failure path returns `null` without surfacing the error. | **U5** — adds `<ErrorCard data-error-code="hero-quest-load" onRetry={…} />`. |
| 4 | **AdminPanelFrame hand-rolled default loading slot** | `src/surfaces/hubs/AdminPanelFrame.jsx:98` renders `<div class="small muted admin-panel-frame-placeholder">Loading panel data...</div>`. The slot wins over `loadingSkeleton` prop only when the prop is omitted. | **U5** — replaces default with `<LoadingSkeleton rows={3} />`; custom-slot override still wins. |
| 5 | **AdminPanelFrame hand-rolled default empty slot** | `src/surfaces/hubs/AdminPanelFrame.jsx:106` renders `<p class="small muted admin-panel-frame-placeholder">No data available.</p>`. | **U5** — replaces default with `<EmptyState>` (operator-facing tone); custom-slot override still wins. |
| 6 | **Punctuation inline `#B8873F` (Bellstorm gold) in five JSX call-sites** | Verified via `grep -rn 'B8873F' src/subjects/punctuation/`: hits at `module.js:66` (subject metadata — allowed), `PunctuationSessionScene.jsx:372,525`, `PunctuationMapScene.jsx:354`, `PunctuationSetupScene.jsx:302,328`, `PunctuationSummaryScene.jsx:689`. The five JSX inline-style sites are the gap; `module.js:66` is the legitimate subject-metadata source. | **U6** — introduces `--punctuation-accent` token; migrates inline `borderTopColor` / `--btn-accent` sites to the token. |
| 7 | **No `--punctuation-accent` token defined** | Verified via `grep -n 'punctuation-accent' src/ styles/ -r`: no hits. The token does not exist. | **U6** — adds the token to `styles/app.css` near existing subject accent definitions; lands before any Punctuation-scoped `Card` migration that would consume it. |

Additional P2-tracked items (not strictly "gaps" but downstream of U0):

- Composition primitives `Card.jsx` + `SectionHeader.jsx` are net-new (U2).
- `ProgressMeter.jsx` + `StatCard.jsx` are net-new (U3); migrate Punctuation monster meter + Home subject-card meter.
- `SegmentedControl.jsx` extraction is **conditional** (U4) — proceeds only if ≥ 2 filter-chip / segmented-control consumers beyond `LengthPicker` are identified during the U4 scoping pass; otherwise the unit defers extraction with a documented note in the U7 completion report.

---

## 6. Bundle headroom snapshot

Constants read directly from `tests/bundle-byte-budget.test.js` at commit `e7fa3b59`:

| Constant | Value | Source line |
| --- | --- | --- |
| `BASELINE_GZIP_BYTES` | `206_000` | `tests/bundle-byte-budget.test.js:83` |
| `BUDGET_GZIP_BYTES` | `227_000` | `tests/bundle-byte-budget.test.js:84` |

The committed budget exceeds the baseline by ~10.2 % (within the test's own `baseline × 1.105` upper guard at line 102–105). The "constants stay in a sensible ratio" assertion passes (verified by running the test — 6 pass / 0 fail).

### 6.1 Baseline staleness

The predecessor completion report (`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`) records the **measured** end-of-P1 gzip size of `app.bundle.js` at **226,884 bytes** (PR #603 `1868996`, "Bundle gzip after" column of the PR-by-PR ledger). That is **20,884 bytes above** the committed `BASELINE_GZIP_BYTES = 206_000`, leaving 116 B headroom against the 227,000 B ceiling.

The predecessor report's residual-work section explicitly flags this:

> **Bundle budget baseline refresh**: `BASELINE_GZIP_BYTES = 206_000` in `tests/bundle-byte-budget.test.js` is materially stale vs current 226,884 B. The upper-guard self-check `budget < baseline × 1.105` still holds, so no action is urgent. A follow-up can re-commit both constants together when the campaign-era growth stabilises.

P2 inherits this stale baseline. P2's own units (U1–U7) should treat the **227,000 B ceiling** as the live constraint and `+116 B` as the working headroom. Any unit that risks a > 116 B gzip increase needs an explicit budget-refresh PR before merging, paired so both `BASELINE_GZIP_BYTES` and `BUDGET_GZIP_BYTES` move together (per the test's own re-baselining instruction at line 99–101).

### 6.2 Non-claims

- This addendum does **not** re-measure `app.bundle.js` gzip at commit `e7fa3b59`. The 226,884 B figure comes from the predecessor completion report's PR #603 ledger row, not from a fresh `npm run build:bundles` + gzip step here. A re-measurement is a U1+ task once the first Button migration ships and a build is run.
- This addendum does **not** assert that the live bundle remains under 227,000 B at this commit. The bundle-byte-budget test's "real post-split app.bundle.js" assertion (passed in §2.3 above) is the live oracle and continues to hold; the **specific number** is left to a future build step.

---

## 7. Explicit non-claims

The following claims are **not** made by this addendum:

- P1 is not claimed to have unified the app's UI. The predecessor completion report itself is scoped to "consolidation-only" platform primitives + Punctuation hero-engine adoption, not full design-system completion.
- This addendum does not assert `npm test` is fully green at commit `e7fa3b59`. Only the three targeted oracles named in U0's Approach were re-run.
- The 10 worktree failures of `tests/empty-state-primitive.test.js` are documented as environmental (esbuild + tmpdir + symlinked `node_modules` resolution); the test file itself passes 14/14 when run from the main checkout against the same commit, which is the relevant signal.
- The bundle baseline of `206_000` is documented as **stale** and **inherited** from P1, not as the operative budget. The operative budget is `BUDGET_GZIP_BYTES = 227_000` with ~116 B working headroom.
- This addendum does not claim that all P2 gaps listed in §5 will be closed by P2. U4 (`SegmentedControl`) extraction is conditional. Other deferrals may surface during implementation; the U7 completion report is the authoritative record of what shipped.
