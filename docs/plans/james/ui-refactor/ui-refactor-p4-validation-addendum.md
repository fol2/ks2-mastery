# UI Refactor P4 Validation Addendum

Date: 2026-05-02
Reviewer: ChatGPT
Scope: validation of the uploaded lean ZIP `ks2-mastery-lean-05010721.zip` and supplementary GitHub PR metadata.

## Source boundary

Primary evidence is the uploaded lean ZIP extracted under `/mnt/data/ks2-p4-review-work`. GitHub PR metadata was used only to supplement the PR ledger and production-evidence follow-up history. Live production was not re-tested during this review.

ZIP identity:

- ZIP path: `/mnt/data/ks2-mastery-lean-05010721.zip`
- SHA-256: `e93f6d973b1e728828a129ac4c79ea2e5b0e60cedb9e30c64946e6566a92423f`
- Integrity: `unzip -t` reported no compressed-data errors.
- Archive shape: rootless repo snapshot, no `.git` metadata.
- Runtime: `.nvmrc` is `22`; local Node is `v22.16.0`.
- Dependency state: no `node_modules` in the lean ZIP extraction.

## Local verification run from the ZIP

The following dependency-light/parser checks passed locally:

```text
node --test \
  tests/ui-production-evidence-contract.test.js \
  tests/ui-phantom-class-contract.test.js \
  tests/ui-session-hud-contract.test.js \
  tests/ui-practice-stage-contract.test.js \
  tests/csp-inline-style-budget.test.js \
  tests/bundle-byte-budget.test.js

55/55 pass, 0 fail
```

A broader targeted run also produced 55 passing tests but failed three test files before execution because the lean ZIP does not include `node_modules/esbuild`:

- `tests/admin-visual-engine-diagnostics.test.js`
- `tests/ui-companion-panel-contract.test.js`
- `tests/ui-home-hero-scene-contract.test.js`

Those failures are environment/dependency failures for this ZIP extraction, not direct implementation failures.

## Claims validated from ZIP source

The completion report exists at:

`docs/plans/james/ui-refactor/ui-refactor-p4-completion-report.md`

The following P4 claims are supported by ZIP source inspection:

- P3 evidence drift was repaired: `ui-refactor-p3-completion-report.md` now identifies U9 as PR `#788`, includes follow-up fixes `#791` and `#793`, and avoids byte-identical/no-layout-change overclaim wording.
- CSP inventory is in sync: `docs/hardening/csp-inline-style-inventory.md` reports `246`, while `scripts/inventory-inline-styles.mjs` derives `POST_MIGRATION_TOTAL = 448 - 202 = 246`; the CSP budget test passed.
- The P4 CSS layer exists for `ActionRow`, `SessionHUD`, `PracticeStage`, `SessionSummaryFrame`, companion panel, and home hero composition, and `tests/ui-phantom-class-contract.test.js` passed.
- `SessionHUD` is imported and rendered by Spelling, Grammar, and Punctuation session scenes.
- `SubjectCompanionPanel` is rendered with explicit `visible` adoption in Spelling, Grammar, and Punctuation setup scenes.
- `SessionSummaryFrame` is imported and rendered in Spelling, Grammar, and Punctuation summary scenes.
- `HomeHeroScene` wraps `HomeSurface` and receives the legacy hero through the `heroPanel` slot, avoiding the original duplicated fallback action cluster in the normal path.
- The Admin Visual Engine route fix is represented in source: `VALID_ADMIN_SECTIONS` includes `business` and `visual-engine`, `App.jsx` passes `initialSection={appState.route?.adminSection || null}`, and `AdminHubSurface` reacts to route-driven section changes.
- The Spelling remote command response fix is represented in source: `applyCommandResponse` captures the live read model, reloads repositories, then reapplies the Worker read model after reload.

## GitHub supplement

GitHub metadata confirms:

- PR `#815` was merged and is the P4 source/local delivery.
- PR `#823` was merged and is the P4 production-evidence follow-up, including deployed smoke, screenshot manifest, Admin Visual Engine route fix, Spelling remote-summary fix, and Grammar smoke fixture hardening.

The completion report currently names PR `#815` but does not explicitly name PR `#823`; it only describes the follow-up work. This is a traceability gap, not a source implementation blocker.

## Superseded gap: screenshot artefact availability in the lean ZIP

The production visual evidence manifest exists:

`reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json`

The original lean ZIP review found 12 screenshots listed with `status: captured`, but only one referenced file bundled:

```text
Present: 1/12
Missing from ZIP: 11/12
```

Present:

- `output/playwright/ui-refactor-p4-production-2026-05-01/01-home.png`

Missing from the uploaded ZIP:

- `02-spelling-setup.png`
- `03-spelling-session.png`
- `04-spelling-feedback.png`
- `04-spelling-summary.png`
- `05-grammar-setup.png`
- `06-grammar-session.png`
- `07-grammar-summary.png`
- `08-punctuation-setup.png`
- `09-punctuation-session.png`
- `10-punctuation-summary.png`
- `11-admin-visual-engine.png`

The blocker follow-up supersedes that packaging gap by committing all 12 named PNG files under `output/playwright/ui-refactor-p4-production-2026-05-01/` and keeping the manifest at `status: captured` for every screenshot. The production smoke JSON files remain present and internally coherent.

## Verdict

P4 is acceptable as a completed Visual Engine v1 implementation plus production-smoke closure. The earlier evidence-packaging correction is now complete.

Historical lean-ZIP wording before the blocker follow-up was:

> The P4 source, production-smoke reports, and visual evidence manifest are present. The supplied lean ZIP contains only the Home screenshot file; the other screenshot paths are listed in the manifest but are not included in the bundle.

Recommended immediate fix for P5 U0:

1. Update the P4 completion report to cite both PR `#815` and PR `#823` explicitly. Done.
2. Add a verifier that checks every `screenshots[].path` in `ui-refactor-p4-production-visual-evidence-2026-05-01.json` either exists in the evidence pack or is explicitly marked as `external/omitted` with a reason. Done.
3. Re-issue the visual evidence pack with all referenced PNGs, or downgrade the visual evidence claim to `manifest-only for 11 screenshots`. Done by re-issuing the committed 12/12 PNG evidence pack.
