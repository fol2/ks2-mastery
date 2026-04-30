# UI Refactor P2 — Completion Report

**Date**: 2026-04-30
**Plan**: [`docs/plans/2026-04-29-011-refactor-ui-shared-primitives-plan.md`](../../2026-04-29-011-refactor-ui-shared-primitives-plan.md)
**Origin contract**: [`docs/plans/james/ui-refactor/ui-refactor-p2.md`](./ui-refactor-p2.md)
**Predecessor (P1) report**: [`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`](./2026-04-29-completion-report.md)
**P2 U0 addendum**: [`docs/plans/james/ui-refactor/2026-04-29-p1-validation-addendum.md`](./2026-04-29-p1-validation-addendum.md)
**Repository commit at write-time**: branch `refactor/ui-p2-u7-guardrails` off `d28f082c` (`origin/main`, post-U6)

---

## Executive summary

P2 widens the platform-UI primitive set across the Hero, Home, and three subject-setup surfaces. Six worker units (U0 through U6, with U4 deferred) have shipped to `main`; this PR closes the campaign with U7 — the parser-level guardrails, the third-consumer falsifier (Spelling primary CTA migration), the dead-CSS sweep, and the report itself. Six new shared primitives now back the canonical hero/setup CTA, card, section header, progress meter, stat card, and (already in place) state primitives. Three closed-allowlist parser tests (button adoption / primary-CTA contract / token contract) ratchet the coverage so a regression on a covered surface fails fast.

P2 does **not** finish the design system. Whole-repo token purity, full primitive adoption beyond the named surfaces, and several Punctuation-internal scenes remain explicitly out of scope (see §8 non-claims).

---

## 1. PR-by-PR ledger

| PR | Unit | Headline | Merge SHA | Bundle gzip after |
| --- | --- | --- | --- | --- |
| #649 | U0 | P1 validation addendum (docs only) | `2dfea40a` | unchanged |
| #650 | U1 | Shared `Button` primitive + 5 CTA migrations | `a5234ac0` | (per PR — within ceiling) |
| #651 | U2 | `Card` + `SectionHeader` primitives + Subject/Hub fallbacks | `0a7a6609` | (per PR — within ceiling) |
| #653 | U3 | `ProgressMeter` + `StatCard` primitives + Punctuation/Home meters | `ba2d5154` | (per PR — within ceiling) |
| n/a | U4 | `SegmentedControl` extraction — **DEFERRED** | n/a — see addendum §8 | unchanged |
| #670 | U5 | Widen `EmptyState` / `ErrorCard` / `LoadingSkeleton` adoption | `fd432d63` | (per PR — within ceiling) |
| #693 | U6 | Unify Punctuation accent via `--punctuation-accent` token | `d28f082c` | 227,059 B (post-U6 baseline for U7) |
| this PR | U7 | Guardrails + Spelling falsifier + dead-CSS sweep + report | (this branch) | **227,078 B** / 227,500 B ceiling (422 B headroom) |

The per-PR `Bundle gzip after` figures for U1–U5 are recorded in each PR description. U7 reports the live measurement against `src/bundles/app.bundle.js` after the build (`nvm exec 22 npm run build:bundles`) on this branch.

---

## 2. Primitives shipped in P2

| Primitive | Location | Adopters at U7 close | Adoption test |
| --- | --- | --- | --- |
| `Button` | `src/platform/ui/Button.jsx` | Grammar setup, HeroQuestCard, Punctuation setup, HomeSurface, AdminPanelFrame, **Spelling setup (U7)** | `tests/ui-component-adoption.test.js` (`BUTTON_CONSUMERS`) |
| `Card` | `src/platform/ui/Card.jsx` | `SubjectRuntimeFallback`, `hub-utils.js` (Admin + Parent fallbacks) | `tests/ui-component-adoption.test.js` (`CARD_CONSUMERS`) |
| `SectionHeader` | `src/platform/ui/SectionHeader.jsx` | (no production adopters at U2 close — primitive ready, allowlist empty) | `tests/ui-component-adoption.test.js` (`SECTION_HEADER_CONSUMERS`) |
| `ProgressMeter` | `src/platform/ui/ProgressMeter.jsx` | Punctuation monster meter, Home subject card | `tests/ui-component-adoption.test.js` (`PROGRESS_METER_CONSUMERS`) |
| `StatCard` | `src/platform/ui/StatCard.jsx` | Punctuation progress row (3-up) | `tests/ui-component-adoption.test.js` (`STAT_CARD_CONSUMERS`) |
| `EmptyState` / `ErrorCard` / `LoadingSkeleton` | `src/platform/ui/EmptyState.jsx` (and siblings) | Hubs + MonsterMeadow + Codex + WordBank + Grammar setup + HeroQuestCard + AdminPanelFrame (≥ 8 sites) | `tests/empty-state-parity.test.js` (existing P1 closed allowlist, extended in U5) |

Every primitive in the table has at least one declared consumer; `SectionHeader` is the deliberate exception flagged in U2's plan and tracked in the empty allowlist branch of `tests/ui-component-adoption.test.js`.

---

## 3. Spelling falsifier findings (U7 third-consumer test)

**Migration site**: `src/subjects/spelling/components/SpellingSetupScene.jsx` lines 605-619 (the primary "Begin N words" CTA).

**Pre-migration shape**:
```jsx
<button
  type="button"
  className="btn primary xl"
  style={{ '--btn-accent': accent }}
  data-action="spelling-start"
  disabled={startDisabled}
  onClick={...}
>
  {beginText} <ArrowRightIcon />
</button>
```

**Post-migration shape**: `<Button>` with `size="xl"`, `style={{ '--btn-accent': accent }}` forwarded through Button's safelisted rest-props, `dataAction="spelling-start"`, `endIcon={<ArrowRightIcon />}`, and the original `disabled` + `onClick` wiring.

### Falsifier signal

Two `tests/react-spelling-surface.test.js` cases failed on the first migration pass:

```
not ok 8 — React spelling setup scene disables start while a remote start is pending
not ok 9 — React spelling setup scene disables start while options are saving
```

Failure cause: the test regex was `/<button[^>]*data-action="spelling-start"[^>]*disabled=""/` — order-dependent. The shared `Button` primitive emits `disabled=""` BEFORE `data-action="spelling-start"` (a consequence of the explicit prop-ordering inside `Button.jsx` — `disabled` is set in the initial `buttonProps` object literal, `data-action` is added later). The legacy raw `<button>` rendered them in JSX-source order, which matched the regex.

### Disposition

This was not a Button API gap — `style` and `endIcon` forwarding work as documented. The brittleness was in the test, not the primitive. The fix is to make the assertions attribute-order-agnostic: capture the matching `<button>` opening tag, then assert it contains `disabled=""` separately. Both Spelling-surface tests now pass; all 750 tests in the `spelling-*` + `react-spelling-*` set are green post-fix.

### What this falsifier proved

- `Button` is the right level of abstraction for primary CTAs. No new prop, no new variant, no new escape hatch was needed for Spelling.
- The third-consumer pass surfaced one fragility in a test (attribute-order coupling). Fixing it made the test more robust to future refactors of either Button or Spelling.
- Spelling does not yet have a `:where(.spelling-...) { --btn-accent: ... }` accent remap (Punctuation got one in U6, Grammar earlier). For now, the inline `style={{ '--btn-accent': accent }}` continues to flow through Button's safelisted style pass-through. Removing it is deferred to a future subject-token sweep.

### Files changed (U7 falsifier scope)

- `src/subjects/spelling/components/SpellingSetupScene.jsx` — migrated CTA to `<Button>`, added `Button` import.
- `tests/react-spelling-surface.test.js` — two assertions made order-agnostic.

---

## 4. Dead-CSS sweep (U7)

Plan §U7 line 573 mandated a sweep of class names retired by U2/U5/U6 migrations. Inspection at `d28f082c`:

| Candidate class | JSX/test consumers | CSS rule found in `styles/app.css` | Disposition |
| --- | --- | --- | --- |
| `.hero-quest-card--empty` | 0 | none | already retired by U5 — no work |
| `.hero-quest-card--error` | 0 | none | already retired by U5 — no work |
| `.admin-panel-frame-placeholder` | 0 (tests assert it is NOT rendered) | line 11407 — 4 lines, 55 raw bytes | **REMOVED** |
| `.punctuation-strip` | comment-only references | none | already retired by P1 U7 — no work |
| `.punctuation-hero` | only `.punctuation-hero-welcome`, `.punctuation-hero-backdrop`, `.punctuation-hero-bg` (different classes) | none | already retired by P1 U7 — no work |

**Result**: one CSS rule removed (`.admin-panel-frame-placeholder { padding: 16px 0; }`).

**Bundle deltas** (gzip):

| Artefact | Pre-removal | Post-removal | Delta |
| --- | --- | --- | --- |
| `styles/app.css` raw | 359,188 B | 359,133 B | −55 B |
| `styles/app.css` gzip | 68,444 B | 68,434 B | **−10 B** |
| `src/bundles/app.bundle.js` gzip | 227,078 B | 227,078 B | 0 (CSS is served separately) |

Note: `styles/app.css` is not bundled into `src/bundles/app.bundle.js`; it is served as a sibling stylesheet. The bundle-byte ceiling at 227,500 B watches the JS bundle, which is unaffected by the CSS sweep. The CSS sweep delivers a 10 B gzip reduction on the stylesheet payload, recorded for completeness and as evidence that the sweep landed.

`tests/bundle-byte-budget.test.js` passes 6/6 against the post-sweep build. No "candidate for follow-up" classes were left behind — every retired class identified in the plan was either already removed by predecessor units or removed in this PR.

---

## 5. Three-pass convergence — U6 hero-class scope

Plan §U6 mandated a three-reviewer convergence log on `.punctuation-hero` vs `.punctuation-strip` scoping. The convergence is recorded here (anchored from the U6 PR description, durable in this report):

- **Reviewer A** (Map / Setup scope): `.punctuation-hero` was the legacy class on `PunctuationMapScene.jsx`. U6 removed all rules in `styles/app.css`; references in JSX are only via `-welcome` / `-backdrop` / `-bg` derivatives, which are different selectors. **No regression risk.**
- **Reviewer B** (Session / Summary scope): `.punctuation-strip` was the legacy class on `PunctuationSessionScene.jsx` + `PunctuationSummaryScene.jsx`. P1 U7 already swept the rules; U6 verified no new references re-introduced them. **No regression risk.**
- **Reviewer C** (Token contract): `tests/ui-token-contract.test.js` (P2 U6) locks the new `--punctuation-accent` token chain (`var(--punctuation-accent)` flowing into `--accent` / `--btn-accent` / `--card-accent` / `--subject-accent` via `:where(.punctuation-surface, …)`). The dark-mode override is present and pinned. The migrated PunctuationSetupScene contains zero raw `#B8873F` literals (comments stripped). **Token chain proven complete for the migrated scene.**

The three reviewers converged on: *Punctuation hero-class chrome is now token-driven for `PunctuationSetupScene.jsx`; the Map / Session / Summary scenes remain on their pre-token chrome and are deferred from P2 scope.*

The U7-extended `tests/ui-token-contract.test.js` (test 7, "curated-glob hex-literal ratchet") is the durable lock on this convergence.

---

## 6. Deferrals

### 6.1 In-plan deferrals (recorded with the unit that owns them)

- **U4 — `SegmentedControl` extraction**: deferred per [`2026-04-29-p1-validation-addendum.md` §8](./2026-04-29-p1-validation-addendum.md). Threshold 2-concrete + 1-about-to-adopt was not met; only `AdminIncidentPanel` `FILTER_TABS` qualified. `LengthPicker` ratified as canonical for the radiogroup-shaped picker family. Re-open when a second qualifying consumer lands.
- **U6 — Punctuation Map / Session / Summary scenes**: still carry inline `#B8873F` literals. Out of P2 scope per plan §U6 line 569 ("Map/Session/Summary scenes deferred"). The U7 token contract test's curated glob explicitly excludes these files.
- **`SectionHeader` adopters**: zero load-bearing migration sites at U2 close. Primitive shipped; allowlist empty by design (see U2 plan §1). A future polish unit may pick up cross-subject section-heading migrations.

### 6.2 Surfaced during U7 (new follow-up candidates)

- **Spelling subject-accent token**: Spelling does not yet expose its accent through a `:where(.spelling-...) { --btn-accent: ... }` remap. The Spelling setup primary CTA still threads accent via inline `style={{ '--btn-accent': accent }}`. A future unit can add the token chain (mirroring Punctuation U6) and drop the inline.
- **Subject-metadata fixtures (`src/surfaces/home/data.js`)**: holds linear-gradient accent strings keyed by subject id (`#3E6FA8`, `#C06B3E`, etc.). The U7 token contract test allowlists this file because it is content fixture, not styling token. A future fixture-tokenisation pass can move these into the var-chain.
- **`Button` primary-default convention**: `tests/ui-primary-action-contract.test.js` defines a primary as `<Button>` with `variant="primary"` OR `size="xl"` (excluding non-primary variants). This is a convention, not a runtime guarantee — Button's runtime default variant is `primary`. A future audit could add a lint rule that every primary CTA must declare `size="xl"` explicitly so the convention is enforceable at the call-site.
- **Three forbidden marketing claims** are now ratchet-locked (`tests/ui-token-contract.test.js` final test). The phrases themselves are listed inside the test's `FORBIDDEN_PHRASES` array; a future writer attempting any of them in this report's path will fail the test before committing the doc. (This bullet deliberately does not reproduce the exact strings — quoting them here would itself trip the ratchet, demonstrating that the gate is active.)

---

## 7. Verification commands

All commands run from the worktree at `/Users/jamesto/Coding/ks2-mastery/.worktrees/refactor/ui-p2-u7-guardrails/` with `NODE_PATH=/Users/jamesto/Coding/ks2-mastery/node_modules` (the worktree's `node_modules` is symlinked to the main checkout). Node version: **v22.16.0** via `nvm use 22`.

### 7.1 Targeted gate suite (U7 critical path)

| Command | Result |
| --- | --- |
| `node --test tests/ui-button-primitive.test.js` | **11 pass / 0 fail** |
| `node --test tests/ui-component-adoption.test.js` | **9 pass / 0 fail** |
| `node --test tests/ui-token-contract.test.js` | **8 pass / 0 fail** (extended: 6 → 8) |
| `node --test tests/ui-primary-action-contract.test.js` (NEW) | **3 pass / 0 fail** |
| `node --test tests/empty-state-parity.test.js` | **12 pass / 0 fail** |
| `node --test tests/csp-inline-style-budget.test.js` | **8 pass / 0 fail** (Spelling migration kept the inline-style count at 245) |
| `node --test tests/bundle-byte-budget.test.js` | **6 pass / 0 fail** |
| `node --test tests/spelling-*.test.js tests/react-spelling-*.test.js` | **750 pass / 0 fail** |

### 7.2 Build + audit

```
nvm exec 22 npm run --silent build:bundles  →  Done in 86–155 ms (no errors)
src/bundles/app.bundle.js gzip               →  227,078 B  /  227,500 B ceiling  →  422 B headroom
nvm exec 22 npm run --silent audit:client    →  recorded in PR body / commit log
nvm exec 22 npm run --silent check           →  recorded in PR body / commit log
nvm exec 22 npm test                         →  recorded in PR body / commit log
```

Exact tail output of `npm run audit:client` and `npm run check` is reproduced in the PR body so it is reviewable next to the diff. `npm test` aggregates all node test files; the PR body records the final `# tests / # pass / # fail` line.

### 7.3 What this report does NOT verify

- Playwright suites (`tests/playwright/**`) are not re-run as part of U7. P1 verified them at PR-merge time and U2–U6 each ran the Punctuation visual baselines as part of their merge checks. U7 changes the inside of one CTA element on Spelling, sweeps one CSS rule, and adds three new test files — no Playwright-relevant chrome moved.
- Production smoke (`smoke:production:*`) is run by the deploy gate, not by unit close-out. The verification matrix in P2 mirrors P1's local-test-pre-merge contract.

---

## 8. Explicit non-claims (mandatory — closes the AE for plan §11 forbidden-claim guard)

- **P2 does NOT claim a complete design system.** Six primitives shipped; many surfaces still render bespoke chrome. `SectionHeader` has zero production adopters. Spelling has not yet adopted the subject-accent var-chain. The `card.border-top` ribbon contract is wired for Punctuation only.
- **P2 does NOT claim universal colour or inline-style tokenisation.** Punctuation Map / Session / Summary scenes still carry `#B8873F` inline. `src/surfaces/home/data.js` carries six subject-accent gradient strings that are content fixtures, not tokens. `GrammarCalibrationPanel.css` and `AdminProductionEvidencePanel.jsx` were the top hex-literal offenders at planning time and remain out of scope.
- **P2 does NOT claim a fresh end-to-end verification.** The targeted gate suite in §7.1 is exhaustive for the U7 changes; the broader `npm test` and `npm run check` runs are recorded in §7.2 against this branch but the production deploy gates (Playwright cross-browser, smoke against `ks2.eugnel.uk`) are part of the merge-and-deploy pipeline, not this report.
- **Whole-repo token purity is not asserted.** `tests/ui-token-contract.test.js` test 7 (the curated-glob hex ratchet) covers `src/platform/ui/**`, `src/surfaces/home/**`, and `PunctuationSetupScene.jsx` only. A whole-repo purge is explicitly deferred and not the scope of P2.
- **Bundle baseline is stale.** `BASELINE_GZIP_BYTES = 206_000` in `tests/bundle-byte-budget.test.js` is materially stale vs the live 227,078 B. The upper-guard self-check `budget < baseline × 1.105` still holds; a deliberate re-baseline is gated to post-P2 stabilisation per plan §9.
- **U4 is deferred, not shipped.** `SegmentedControl.jsx` was not extracted. The deferral is documented in the addendum §8; do not read the PR ledger as "all units landed".

---

## 9. Bundle history

| Snapshot | `src/bundles/app.bundle.js` gzip | Headroom against ceiling | Ceiling |
| --- | --- | --- | --- |
| Pre-P2 (P1 close, post-#603 `1868996`) | 226,884 B | 116 B | 227,000 B (P1 ceiling) |
| Post-U6 baseline (`d28f082c`) | 227,059 B | 441 B | 227,500 B (P2 ceiling, raised in U3) |
| Post-U7 (this branch, after build) | **227,078 B** | **422 B** | 227,500 B |

The P2 ceiling was raised from 227,000 to 227,500 in U3 (per `tests/bundle-byte-budget.test.js` header comment) when `ProgressMeter` + `StatCard` landed. The upper-guard `budget < baseline × 1.105 = 227,630` still holds with 552 B of self-check headroom.

The CSS sweep recovered 10 B on `styles/app.css` gzip but does not affect the JS bundle ceiling (separate file). The Spelling migration added one Button import + one usage; net +19 B against `d28f082c`. The CSS recovery offsets the JS growth on the stylesheet side.

---

## 10. PR description anchor

This commit lands on branch `refactor/ui-p2-u7-guardrails` and produces the U7 PR. The PR description embeds:

- The falsifier finding (§3) verbatim, including the "no Button API gap; test made order-agnostic" disposition.
- The dead-CSS list (§4) with byte deltas.
- The §7.2 build / audit / check command output (tail-formatted).
- A summary line: `Bundle: 227,078 / 227,500 B ceiling (422 B headroom).`

Subsequent merge of this PR closes P2.
