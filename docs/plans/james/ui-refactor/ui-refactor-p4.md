# UI Refactor P4 — Visual Engine Closure Contract

**Date:** 2026-04-30  
**Status:** Draft contract for next implementation phase  
**Language:** UK English  
**Primary goal:** Close the UI refactor as a production-ready visual interaction engine, not as another primitive-only pass.

---

## 1. Executive summary

P1 created the first shared UI primitives. P2 made the primitive foundation credible. P3 broadened the system into subject themes, session HUD, practice stage, setup companion panel, summary frame, home hero wrapper and admin diagnostics.

P4 is the closure phase. It must turn those P3 structures into visible, production-safe UX that children actually experience across Spelling, Grammar and Punctuation, while preserving the app's running production behaviour.

This phase should not become an open-ended design-system programme. After P4, UI refactor work should be considered **Visual Engine v1 complete**. Further work should be planned as feature streams such as Hero Mode, Reading launch, Reasoning launch, Arithmetic launch, or admin asset-management expansion — not as another generic UI-refactor phase.

---

## 2. P3 validation findings that P4 must resolve

The P3 implementation is directionally useful, but it is not yet a complete visual engine. P4 starts by correcting these findings before adding new surface area.

### 2.1 Evidence and report corrections

The P3 completion report contains a PR-ledger error. It lists U9 as PR `#786`, but GitHub metadata shows PR `#786` is an unmerged Hero pA5 rollout-control test suite, not UI Refactor P3 U9. The UI Refactor P3 guardrails and completion report were PR `#788`.

The P3 report also omits the later P3 fix PRs `#791` and `#793` from the ledger. Those fix PRs matter because they changed the completion report, test-count wording, visual-verification note, and inline-style budget wording.

### 2.2 CSP inline-style inventory drift

The uploaded P3 ZIP had this mismatch:

- `scripts/inventory-inline-styles.mjs` resolves `POST_MIGRATION_TOTAL` to **254**.
- `docs/hardening/csp-inline-style-inventory.md` still recorded **245**.
- `tests/csp-inline-style-budget.test.js` failed in the ZIP snapshot until the inventory markdown was regenerated.

P4 must treat this as a release-blocking evidence drift, not a cosmetic documentation issue. The inventory markdown and the script constants must agree before P4 starts feature work.

### 2.3 Hidden or duplicated UX

P3 created useful primitives, but some are not yet delivering product-visible UX:

- `SubjectCompanionPanel` defaults to `visible={false}`. The three setup scenes import and render it, but do not pass `visible`, so the panel is hidden by default. This satisfies a weak parser-level adoption test but does not satisfy the product goal of showing discovered monsters, status and next focus.
- `HomeHeroScene` is appended below the existing home hero rather than replacing/consolidating it. This creates a risk of duplicate primary calls to action and duplicated home focus language.
- `SessionSummaryFrame` renders alongside existing summary shells. This creates a risk of duplicated summary content and duplicated next actions rather than a single shared summary experience.

### 2.4 Phantom visual-engine classes

`PracticeStage`, `SessionHUD`, `SessionSummaryFrame`, `SubjectCompanionPanel` and `HomeHeroScene` introduce many class names, but the uploaded P3 CSS does not define most of those visual classes. That means P3 establishes component shape more than finished visual language.

P4 must add the missing stylesheet layer or deliberately reuse existing classes. A component must not claim to be a visual primitive while relying on undefined CSS classes for its main behaviour.

### 2.5 Production evidence remains absent

P3 is source-level and local-test evidence. It does not prove production visual correctness, deployed bundle health, or live interaction behaviour. P4 must end with release evidence, not only parser tests.

---

## 3. Product principles

P4 must preserve these principles.

1. **Production first.** No change should put the running app at risk. If a migration cannot preserve behaviour, ship a smaller slice.
2. **Spelling remains the north star.** Spelling's child-facing feel is the baseline for warmth, clarity and motivation. Grammar and Punctuation should align with that language without losing subject identity.
3. **One visual engine, subject worlds.** The shared system owns layout, rhythm, state, progress, actions, summary and surface grammar. Subjects own learning logic, content, assessment and mastery evidence.
4. **No reward or learning mutation.** UI primitives must not award Stars, mutate mastery, mark answers, schedule subject content, or write Hero economy state.
5. **No duplicated primary route.** A learner-facing surface should have one clear primary next action unless an explicit exception is documented and tested.
6. **Visible means visible.** Parser-level adoption is not enough. If a P4 unit claims a child-facing panel, HUD, stage or summary is adopted, it must be visible in the relevant child journey or deliberately accessible through a visible control.
7. **Reduced motion is a contract.** Stage motion, progress animation and celebratory movement must be safe under `prefers-reduced-motion`.
8. **Future subjects are adapters, not special cases.** Reading, Reasoning and Arithmetic must be able to plug into the same theme, HUD, stage, summary and companion contracts without copying Spelling-specific JSX.

---

## 4. Non-goals

P4 must not implement Hero Coins, Hero Camp economy, subject reward inflation, new learning algorithms, new content generation, or production writes for visual asset editing.

P4 may improve admin diagnostics and prepare property-management seams, but any admin write capability must be a separately reviewed operations feature with audit logging, rollback and permission checks.

P4 should not start a new generic component-library phase. The goal is closure of the current refactor.

---

## 5. Delivery units

### U0 — Evidence repair and release ledger correction

**Goal:** Fix P3 evidence drift before new UI work starts.

**Required changes:**

- Correct the P3 completion report PR ledger: U9 must point to PR `#788`, not PR `#786`.
- Add the P3 fix PRs `#791` and `#793` to the ledger or a post-completion-fixes section.
- Regenerate `docs/hardening/csp-inline-style-inventory.md` so its total is **254** and includes the P3-added inline sites.
- Run `tests/csp-inline-style-budget.test.js` and record the pass result after regeneration.
- Add a P4 entry note saying P3's production evidence remains unproven.

**Acceptance:**

- `docs/hardening/csp-inline-style-inventory.md` total equals the computed `POST_MIGRATION_TOTAL` from `scripts/inventory-inline-styles.mjs`.
- `node --test tests/csp-inline-style-budget.test.js` passes.
- Completion-report wording no longer claims “byte-identical” or “no layout alteration” for surfaces where wrappers add visible content.
- No new product UI changes land in U0.

---

### U1 — Visual stylesheet layer for P3 primitives

**Goal:** Convert P3 primitives from structural wrappers into a real visual engine layer.

**Required changes:**

- Add stylesheet rules for:
  - `.session-hud`, `.session-hud-title`, `.session-hud-status`, `.session-hud-meter`;
  - `.practice-stage`, `.ps-backdrop-*`, `.ps-motion-*`, `.ps-reduced-motion-safe`;
  - `.session-summary-frame` and its sections/actions;
  - `.companion-panel` and its monster/stat/focus states;
  - `.home-hero-scene`, focus, creature and action areas;
  - `.action-row`, `.action-row-start`, `.action-row-end`.
- Prefer existing tokens: `--subject-accent`, `--subject-accent-soft`, `--card-accent`, `--progress-accent`, `--btn-accent`, `--line`, `--paper`, `--ink`, `--muted`.
- Do not introduce subject-specific bespoke CSS unless the rule is a token declaration or a documented subject artwork exception.

**Acceptance:**

- Parser test proves every class emitted by the P3 primitives has either a CSS definition or is deliberately inherited from an existing class family.
- `prefers-reduced-motion: reduce` disables stage and progress animation.
- 360 px, 768 px and 1280 px CSS checks show no fixed-width overflow.
- Main JS bundle budget remains at or below **232,000 B gzip** unless an owner-approved re-baseline is documented with measurement evidence.

---

### U2 — Home dashboard hero consolidation

**Goal:** Make `HomeHeroScene` the actual home hero composition, not an extra wrapper beneath the existing hero.

**Required changes:**

- Replace duplicate home hero call-to-action rendering with one consolidated `HomeHeroScene` route.
- Preserve existing `data-action="open-subject"`, `data-action="open-codex"`, subject-card selectors and parent-hub affordance.
- Ensure the page has one primary learner CTA in the non-Hero-active path.
- Do not introduce Hero Coins, shop, streak pressure or Hero Camp changes in this unit.
- Keep Hero Mode surfaces already present intact, but do not expand economy behaviour.

**Acceptance:**

- Home SSR/characterisation test proves there is only one primary learner CTA in the normal home path.
- Subject cards render exactly once.
- Existing subject-card open actions still dispatch through the same handlers.
- Home works with zero, one, three and six `readySubjects`.
- Home copy stays child-safe and avoids reward-pressure language.

---

### U3 — Session HUD production pass

**Goal:** Make the shared `SessionHUD` the standard top-of-session progress experience across Spelling, Grammar and Punctuation.

**Required changes:**

- Ensure each ready subject maps its existing session view model into the HUD through a thin adapter.
- Remove, hide or demote duplicate subject-specific answered/remaining/progress displays where they conflict with the shared HUD.
- Add subject-specific support-state display only through props, not through store reads inside the HUD.
- Keep answer marking, retries, form submission and telemetry unchanged.

**Acceptance:**

- For all three subjects, the HUD shows answered count, total count and remaining count without `NaN`, negative numbers or values above total.
- `ProgressMeter` ARIA contract remains intact.
- Existing subject tests still prove answer submission and feedback flow.
- One test covers a zero-total or loading state for each subject adapter.

---

### U4 — Summary engine replacement, not duplication

**Goal:** Make `SessionSummaryFrame` the single shared summary frame for standard summary information, while preserving subject-specific learning details.

**Required changes:**

- Replace duplicated summary content rather than appending `SessionSummaryFrame` beneath legacy shells.
- Keep genuinely subject-specific sections as slots or child sections, for example spelling Guardian/Boss information, punctuation GPS review cards, grammar confidence or support notes.
- Enforce one primary post-summary action per render.
- Preserve telemetry emission, post-session read-only behaviour, and existing data selectors.
- Avoid invented progress deltas. The summary frame may display progress already computed by subject logic; it must not derive mastery.

**Acceptance:**

- Each of Spelling, Grammar and Punctuation renders one summary headline region and one primary next action.
- No duplicate “back”, “continue”, “open bank/map” action clusters render in the same branch.
- Subject-specific summary information remains visible where it was previously visible.
- Summary tests cover at least one ordinary, one weak/misconception and one high-success outcome across the ready subjects.

---

### U5 — Visible setup companion panel

**Goal:** Deliver the promised setup-side monster/status panel as a visible, responsive learner experience.

**Required changes:**

- Make `SubjectCompanionPanel` visible in all three ready-subject setup scenes, either by default on desktop or through a visible “Monsters and stats” disclosure on smaller screens.
- Use the existing `SetupSidePanel` rhythm where it helps preserve layout.
- Show discovered or owned monsters, subject stats and next recommended focus through the shared prop contract.
- Keep the panel display-only: no mastery writes, no reward writes, no scheduling decisions.
- Support future subjects through the same `subjectId`, `monsters`, `stats`, `nextFocus`, and `emptyState` contract.

**Acceptance:**

- Parser test fails if all setup call-sites omit both `visible` and a visible disclosure path.
- Desktop setup surfaces show the panel without overlapping the primary CTA.
- 360 px layout stacks or collapses the panel safely.
- Empty/placeholder monster states are friendly and do not imply broken assets.

---

### U6 — Practice stage and background scroller v1

**Goal:** Deliver a safe, lightweight background stage that gives the app one visual world without damaging readability or performance.

**Required changes:**

- Implement real CSS for `PracticeStage` backdrops and motion classes.
- Use solid-colour and gradient fallback first; use asset-backed decoration only where lean-ZIP placeholders and production asset availability are both safe.
- Ensure decorative elements never cover questions, answer controls, feedback or CTAs.
- Add reduced-motion fallback and no-motion mode.
- Keep the stage independent of subject learning state.

**Acceptance:**

- Stage classes have CSS definitions and do not depend on missing image assets.
- Reduced-motion test proves animation is removed.
- Visual fixture or screenshot evidence covers Spelling, Grammar and Punctuation session scenes.
- Question area contrast remains readable in light and dark modes.

---

### U7 — Admin Visual Engine v1 hardening

**Goal:** Turn admin diagnostics into a useful read-only operating surface for visual-engine health.

**Required changes:**

- Keep `AdminVisualEngineSection` read-only in P4.
- Reduce inline styles in the admin diagnostics panel by moving simple spacing/opacity rules into CSS classes.
- Show subject theme tokens for all six subjects.
- Show monster asset availability, placeholder status, missing alt text, configured contexts, motion profiles and manifest/source identifiers.
- Add a clear “diagnostic only” copy line so operators do not mistake it for a write surface.

**Acceptance:**

- No form, input, textarea, submit handler or write endpoint appears in the section.
- Placeholder assets are reported as “placeholder”/info, not broken/error, in lean bundles.
- Missing alt text warnings remain visible and testable.
- Admin tab registration remains stable.

---

### U8 — P4 guardrails, release evidence and closure report

**Goal:** Close the UI refactor with evidence strong enough to call Visual Engine v1 ready.

**Required verification:**

- Parser and contract tests:
  - `tests/ui-p3-guardrails.test.js`
  - `tests/ui-subject-theme-contract.test.js`
  - `tests/ui-action-engine-contract.test.js`
  - `tests/ui-session-hud-contract.test.js`
  - `tests/ui-practice-stage-contract.test.js`
  - `tests/ui-companion-panel-contract.test.js`
  - `tests/ui-summary-engine-contract.test.js`
  - `tests/ui-home-hero-scene-contract.test.js`
  - `tests/admin-visual-engine-diagnostics.test.js`
  - `tests/csp-inline-style-budget.test.js`
  - `tests/bundle-byte-budget.test.js`
- Production-oriented checks:
  - `npm run build:bundles`
  - `npm run audit:client`
  - a deployed smoke or screenshot record for Home, Spelling setup/session/summary, Grammar setup/session/summary, Punctuation setup/session/summary, and Admin Visual Engine.

**Completion report must include:**

- ZIP/GitHub/source boundary.
- Node version and OS used for local verification.
- Exact bundle gzip measurement and budget.
- CSP inline-style total and inventory status.
- Screenshot or deployed-smoke evidence, or an explicit “not production-proven” non-claim.
- List of visual changes that are intentional.
- List of visual differences that are only wrapper/structure and not visible.
- Remaining non-goals, including Hero economy and future subject content.

---

## 6. P4 exit criteria

P4 is complete only when all of the following are true.

1. P3 evidence drift is fixed, including the PR ledger and CSP inventory total.
2. The home page has no duplicate primary CTA caused by `HomeHeroScene` adoption.
3. All three ready-subject sessions use a visible, styled shared HUD without duplicate progress language.
4. All three ready-subject summaries use the shared summary frame as the primary frame, not as an appended duplicate.
5. All three ready-subject setup scenes expose a visible companion panel or a visible companion disclosure.
6. `PracticeStage` has real CSS for stage, backdrop and motion classes, plus reduced-motion fallback.
7. Admin Visual Engine remains read-only and useful for visual asset/property diagnosis.
8. Main JS bundle remains within the committed budget or has an explicitly approved and measured re-baseline.
9. CSP inline-style inventory and constants agree.
10. Production or deployed-build visual evidence is captured, or the completion report explicitly refuses to claim production verification.

---

## 7. Test and guardrail additions

P4 should add or extend tests for these failure modes.

- `home-hero-no-duplicate-primary.test.js`: normal home path has one primary learner CTA and one subject-card grid.
- `ui-phantom-class-contract.test.js`: classes emitted by P3/P4 primitives must have CSS definitions unless allowlisted as inherited/external.
- `ui-companion-visible-contract.test.js`: setup call-sites must pass `visible` or render a visible disclosure/toggle.
- `ui-summary-no-duplicate-actions.test.js`: summary scenes must not render legacy and shared primary action clusters at the same time.
- `ui-practice-stage-css-contract.test.js`: all `ps-backdrop-*`, `ps-motion-*`, and reduced-motion selectors exist in `styles/app.css`.
- `ui-production-evidence-contract.test.js`: completion report cannot claim production readiness without timestamped deployed-build evidence.

---

## 8. Bundle and CSP budget policy

P4 should keep the P3 main-bundle budget at **232,000 B gzip**. Do not raise it by default.

If P4 must add JavaScript to finish the visual engine, it should first remove duplicate summary/home rendering introduced during P3. A budget re-baseline is allowed only when all of the following are true:

- the before/after gzip measurement is recorded;
- the growth is caused by learner-visible Visual Engine v1 behaviour, not admin-only imports leaking into the critical path;
- an owner explicitly approves the re-baseline;
- `tests/bundle-byte-budget.test.js` is updated with both baseline and ceiling together.

CSP inline-style total must stay at or below **254** unless P4 migrates enough legacy inline styles to offset any new sites. A PR that adds new inline styles must classify them and regenerate the inventory markdown in the same PR.

---

## 9. Engineering implementation order

Recommended order:

1. U0 — evidence repair.
2. U2 — home duplicate CTA consolidation.
3. U1 — CSS layer for P3 primitives.
4. U3 — session HUD production pass.
5. U4 — summary replacement pass.
6. U5 — visible companion panel.
7. U6 — practice stage/background v1.
8. U7 — admin diagnostics hardening.
9. U8 — guardrails and closure report.

The reason for this order is risk. Fix evidence first. Remove duplicate UX before styling it. Then harden the repeated learner journeys before admin polish.

---

## 10. Release stance

P4 should end with this statement being true:

> The KS2 app has a Visual Engine v1 across Spelling, Grammar and Punctuation: shared subject themes, action hierarchy, session HUD, practice stage, setup companion panel, summary frame, home hero composition and admin diagnostics are visible, tested, production-safe and ready for future subjects.

If that statement cannot be made honestly, the completion report must say exactly which surface is not finished and must not rebrand partial adoption as completion.
