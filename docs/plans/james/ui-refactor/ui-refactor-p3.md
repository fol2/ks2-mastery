---
title: "UI Refactor P3 — Visual Interaction Engine Contract"
status: proposed
owner: Product + Engineering
created: 2026-04-30
language: en-GB
source_boundary: "Uploaded lean ZIP primary; GitHub PR metadata supplementary; production not certified by this document."
predecessor_report: "docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md"
predecessor_contract: "docs/plans/james/ui-refactor/ui-refactor-p2.md"
---

# UI Refactor P3 — Visual Interaction Engine Contract

## 1. Purpose

P2 created a credible shared-primitive foundation. P3 must turn that foundation into the first version of the app's visual interaction engine: a reusable system for subject identity, action hierarchy, practice-stage motion, session progress, companion monster/status panels, summary outcomes, and future subject readiness.

This is not a cosmetic pass. P3 treats UI and UX as one product contract. A shared `Button` is useful, but the larger win is that Spelling, Grammar, and Punctuation should feel like the same learning product, with subject-specific identity applied through tokens, view models, and safe interaction contracts rather than hand-built local chrome.

The production app must remain stable. P3 therefore proceeds through narrow, testable migrations. No unit may rewrite a learning engine, bypass Worker-owned subject commands, invent new reward semantics, or certify production without live evidence.

## 2. P2 validation intake

This section records the starting point for P3. It is deliberately claim-safe.

### 2.1 Accepted P2 outcomes

The uploaded lean ZIP contains the P2 completion report at:

`docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`

The same ZIP also contains the predecessor P1 report and P1 validation addendum:

- `docs/plans/james/ui-refactor/2026-04-29-completion-report.md`
- `docs/plans/james/ui-refactor/2026-04-29-p1-validation-addendum.md`

The following P2 outcomes are accepted for the uploaded snapshot:

- `Button`, `Card`, `SectionHeader`, `ProgressMeter`, and `StatCard` exist in `src/platform/ui/`.
- `EmptyState`, `ErrorCard`, and `LoadingSkeleton` continue to be the shared state primitives.
- The `Button` consumer allowlist includes Grammar setup, Hero Quest card, Punctuation setup, Home surface, Admin panel frame, and Spelling setup.
- The Spelling setup primary CTA has been migrated to `<Button>` while preserving `dataAction="spelling-start"`, `endIcon`, and the existing accent flow.
- Punctuation setup now exposes and consumes `--punctuation-accent` through a subject-scoped remap.
- `ProgressMeter` is used by the Punctuation setup monster meter and the Home subject card.
- `StatCard` is used by the Punctuation setup progress strip.
- P2 guardrails exist for primitive adoption, primary-action discipline, token scope, completion-report wording, CSP inline-style budget, and bundle byte budget.
- The inline-style inventory is internally consistent at the current snapshot: `POST_MIGRATION_TOTAL = 245`.
- U4 `SegmentedControl` was deferred rather than partially shipped.

### 2.2 Accepted P2 limits

The following are not P2 failures, but they are P3 entry gaps:

- `SectionHeader` exists but has no production adopters. It is a primitive candidate, not an adopted pattern.
- Punctuation Map, Session, and Summary still carry raw Punctuation colours and pre-token chrome.
- Spelling does not yet expose a subject-scoped accent token. Its setup CTA still receives `--btn-accent` through inline style.
- There are still many raw `.btn` buttons across learner, shell, auth, profile, and admin surfaces. P2 only established the first shared-action adoption pattern.
- Session HUD behaviour is not unified: answered count, remaining count, current item, support state, and next action are still subject-specific.
- Setup-side companion panels are not unified: discovered or owned monsters, due work, weak spots, and subject stats are not yet presented through one reusable contract.
- Summary experiences are not unified: outcome copy, next steps, mistake recovery, and monster/progress feedback still vary by subject.
- The Home dashboard is not yet a visual perspective engine. It is still a collection of cards rather than a shared scene contract.
- Admin asset/theme management is not yet a safe operational surface. P3 may introduce read-only diagnostics and schema, but production writes are out of scope unless separately approved.
- Production readiness is not proven by this contract. A local bundle audit or PR body is not live production evidence.

### 2.3 Claim correction to carry forward

Do not repeat a broad claim that `--punctuation-accent-ink`, `--punctuation-accent-soft`, and `--punctuation-accent-border` shipped in P2. The current source-level contract only requires the base `--punctuation-accent` token and the remap to `--accent`, `--btn-accent`, `--card-accent`, and `--subject-accent`. Sibling tokens may be introduced in P3 when a real consumer requires them.

## 3. Product thesis

P3 should make the app feel as though it has one visual engine and several subject worlds.

Spelling remains the north-star subject for warmth, clarity, and child-facing rhythm. Grammar and Punctuation should inherit the same interaction structure without losing their own subject identity. Reading, Reasoning, and Arithmetic should be able to join later by implementing the same theme, session, setup, and summary contracts rather than copying Spelling-specific code.

The child should not experience three unrelated products. The child should experience one learning world where each subject has a recognisable colour, creature, stage, progress rhythm, and next action.

## 4. Non-negotiable principles

1. Production stability comes first. Every unit must be shippable behind existing routes and existing subject command boundaries.
2. The visual engine consumes subject read models and view models. It must not mark answers, mutate mastery, award subject Stars, or own subject scheduling.
3. Subject identity must come from tokens and explicit metadata, not scattered hard-coded hex values or per-surface one-off styles.
4. Spelling is the design-language base. Grammar and Punctuation should converge towards that rhythm while keeping subject-specific copy and learning affordances.
5. Accessibility is part of the engine. Progress, status, focus, reduced motion, and button semantics are acceptance criteria, not polish.
6. Animation must be optional. `prefers-reduced-motion` support is required for any scroller, stage motion, celebration, or perspective layer.
7. The app should have one primary action per decision moment. Secondary actions may exist, but they must not compete visually with the next learning step.
8. Admin controls must be safe by default. Read-only diagnostics may land before write-capable management.

## 5. P3 scope

P3 covers the visual interaction engine across existing ready subjects first:

- English Spelling
- Grammar
- Punctuation

P3 must also prepare contracts for future subjects:

- Reading
- Reasoning
- Arithmetic

Future subjects do not need production engines in P3. They need to be able to declare visual identity and later adopt the same setup, session, summary, and dashboard contracts.

## 6. Out of scope

P3 does not deliver Hero Coins, Hero economy, loot, shop mechanics, or new reward rules.

P3 does not introduce item-level Hero scheduling.

P3 does not replace Worker-owned subject commands.

P3 does not rewrite Spelling, Grammar, or Punctuation learning logic.

P3 does not certify production without live smoke evidence.

P3 does not require every admin table, debug surface, or legacy helper to be visually perfect. It should focus on learner-facing product flow first, then safe admin diagnostics.

## 7. Delivery units

### U0 — P3 evidence map and visual inventory

Create a checked-in P3 evidence map before changing product code.

Required output:

`docs/plans/james/ui-refactor/ui-refactor-p3-evidence-map.md`

The evidence map must record:

- the exact ZIP or Git ref used as the starting point;
- P2 report path and hash;
- primitive inventory under `src/platform/ui/`;
- raw `.btn` inventory by surface;
- raw colour inventory for Spelling, Grammar, Punctuation, Home, Hero, and platform UI;
- inline-style inventory and current committed budget;
- current setup/session/summary component map for Spelling, Grammar, and Punctuation;
- current subject metadata and token sources;
- current monster/status surfaces and asset-management surfaces;
- bundle ceiling and current measured main bundle size when measured in the supported Node version.

Acceptance:

- The report separates ZIP evidence, GitHub evidence, local-run evidence, and production evidence.
- The report explicitly says what it did not verify.
- No product code changes are required in this unit.

### U1 — Subject theme token contract

Create a subject theme contract that can carry Spelling, Grammar, Punctuation, and future subject identities without bespoke per-surface colour hacks.

Recommended implementation shape:

```ts
type SubjectTheme = {
  subjectId: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentBorder: string;
  stageGradient?: string;
  creatureGlow?: string;
  success?: string;
  warning?: string;
  danger?: string;
};
```

The browser contract should expose subject tokens in CSS through a stable scope such as:

```css
.subject-theme[data-subject="spelling"] {
  --subject-accent: ...;
  --subject-accent-ink: ...;
  --subject-accent-soft: ...;
  --subject-accent-border: ...;
  --btn-accent: var(--subject-accent);
  --card-accent: var(--subject-accent);
  --progress-accent: var(--subject-accent);
}
```

This may be implemented through static CSS, a small `SubjectThemeScope` component, or a hybrid of registry metadata and CSS classes. It must not depend on runtime DOM mutation after first render.

Priority migrations:

1. Finish Punctuation Map, Session, and Summary colour tokenisation.
2. Move Spelling setup CTA accent away from bespoke inline style into subject scope.
3. Ensure Grammar continues to consume its existing accent without regression.
4. Add future-subject placeholder tokens for Reading, Reasoning, and Arithmetic without pretending their learning engines are ready.

Required tests:

- `tests/ui-subject-theme-contract.test.js`
- token ratchet for raw subject hex literals in the covered learner surfaces;
- dark-mode token coverage for Spelling, Grammar, and Punctuation;
- selector preservation for existing journey `data-*` attributes;
- CSP inline-style budget must stay at or below the P2 snapshot unless a documented exception is accepted.

Acceptance:

- No raw `#B8873F` remains in Punctuation setup, map, session, or summary executable JSX.
- No hard-coded Spelling accent is required by the Spelling setup CTA.
- Subject tokens work for Button, Card, ProgressMeter, and future stage components.
- The existing visual appearance is preserved unless the P3 owner explicitly approves a screenshot-backed change.

### U2 — Action engine pass 1

Expand the shared action contract beyond setup CTAs.

P2 proved that `Button` can carry the primary CTA pattern. P3 should use it to standardise learner-facing actions while avoiding a risky whole-repo migration.

Priority surfaces:

1. Spelling session actions.
2. Grammar session actions.
3. Punctuation session actions.
4. Spelling, Grammar, and Punctuation summaries.
5. Shell banners and profile actions that the child sees during ordinary practice.

Admin-only tables and destructive operations may remain raw until a later admin-action pass, but they must be inventoried.

Recommended companion primitive:

```tsx
<ActionRow
  primary={<Button variant="primary" size="xl" />}
  secondary={<Button variant="secondary" />}
  tertiary={<Button variant="ghost" />}
  align="start|centre|end|split"
/>
```

`ActionRow` should not invent new visual style. It should standardise spacing, wrapping, and primary-action hierarchy.

Required tests:

- raw `<button className="btn primary xl">` ratchet across covered learner surfaces;
- one-primary-action contract for setup, session, summary, and home decision branches;
- action locator preservation for existing `data-action` selectors;
- disabled, busy, and error labels must remain explicit and visible.

Acceptance:

- At least 20 raw `.btn` call sites are retired from learner-facing surfaces, or a smaller number is accepted with a written explanation that proves the remaining sites are semantically unsafe to migrate in P3.
- The raw-button allowlist is narrower after P3 than before P3.
- No action migration changes command dispatch behaviour.
- No form submit or keyboard behaviour regresses.

### U3 — Session HUD and question progress engine

Create a shared session HUD that tells the child where they are in the current practice session.

The HUD must answer, in child-safe language:

- how many questions or tasks have been answered;
- how many are left;
- which subject/session mode they are in;
- whether support was used or is available;
- what the next meaningful action is.

Recommended component contract:

```tsx
<SessionHUD
  subjectId="spelling|grammar|punctuation"
  title="..."
  answeredCount={number}
  totalCount={number}
  remainingCount={number}
  currentIndex={number}
  modeLabel="..."
  supportState="none|available|used|locked"
  progressLabel="..."
  accent="subject"
/>
```

The component should render an accessible `ProgressMeter` plus text. It must not infer learning state from UI clicks. Each subject adapter must pass counts from its existing session/view model.

Subject adoption order:

1. Spelling session, because it is the design-language base.
2. Grammar session, preserving existing grammar feedback and support states.
3. Punctuation session, preserving telemetry and marking-specific copy.

Required tests:

- progress never exceeds 100%;
- `remainingCount` cannot be negative;
- zero-total sessions render a safe fallback, not `NaN`;
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and accessible labels are present;
- reduced-motion behaviour is honoured when the HUD animates;
- subject session tests prove existing dispatch and marking still work.

Acceptance:

- The child can see answered and left counts in Spelling, Grammar, and Punctuation sessions through one shared component.
- Existing subject-specific copy and answer behaviour are preserved.
- No subject service or Worker route changes are required.

### U4 — Practice stage and background scroller engine

Create a shared practice-stage shell that supports background scroller behaviour without embedding subject learning logic.

The first version should focus on structure and safety:

```tsx
<PracticeStage
  subjectId="spelling|grammar|punctuation"
  scene="setup|session|summary"
  backdrop="meadow|library|punctuation-map|subject-default"
  motion="calm|active|celebration|none"
  reducedMotionFallback
>
  {children}
</PracticeStage>
```

A background scroller should be decorative unless a subject explicitly opts into interaction. The scroller must not hide content, shift layout during answer input, or become required for comprehension.

Implementation requirements:

- Build from the existing `HeroBackdrop` direction, not from a separate visual language.
- Prefer CSS transforms and opacity over layout-affecting animation.
- Support `prefers-reduced-motion: reduce`.
- Work safely with lean ZIP placeholder assets.
- Provide a static fallback when image payloads are missing.

Priority adoption:

1. Spelling session background rhythm.
2. Grammar setup/session alignment.
3. Punctuation setup/session alignment.

Acceptance:

- The stage can render without real asset payloads.
- Reduced motion produces a stable non-scrolling background.
- Text contrast remains readable over every subject stage.
- No answer input shifts position due to background motion.

### U5 — Setup companion panel and monster/status engine

Create a reusable setup-side companion panel for owned or discovered monsters, subject stats, due work, and next recommended focus.

This is where the existing Punctuation progress row, Spelling creature language, and future subject status should converge.

Recommended component contract:

```tsx
<SubjectCompanionPanel
  subjectId="spelling|grammar|punctuation|reading|reasoning|arithmetic"
  learnerName="..."
  monsters={ownedOrDiscoveredMonsters}
  stats={[
    { label: 'Due today', value: 4, tone: 'due' },
    { label: 'Wobbly', value: 2, tone: 'warning' },
    { label: 'Secure', value: 18, tone: 'success' }
  ]}
  nextFocus="..."
  emptyState="..."
/>
```

The component must be display-only. It must not invent ownership, monster progress, or reward changes.

Priority adoption:

1. Spelling setup.
2. Punctuation setup.
3. Grammar setup.

Required tests:

- empty monster/state fallback;
- owned and discovered monster display;
- stat values announced through semantic label-value markup;
- no subject mastery mutation;
- mobile 360 px layout does not overflow.

Acceptance:

- Three ready subjects share one companion panel contract.
- The panel can render future placeholder subjects without crashing.
- The panel does not change reward, Star, Mega, or mastery semantics.

### U6 — Shared summary engine

Create a shared summary structure for completed sessions.

The summary should tell the child:

- what they completed;
- what improved;
- what needs another try;
- whether a creature or subject status changed;
- what the best next action is.

Recommended contract:

```tsx
<SessionSummaryFrame
  subjectId="spelling|grammar|punctuation"
  outcome="secure|improving|needs-practice|review-complete"
  title="..."
  highlights={[]}
  misconceptions={[]}
  progressDelta={[]}
  nextPrimaryAction={...}
  secondaryActions={...}
/>
```

The summary engine should not decide mastery. It receives outcome data from subject-owned view models.

Priority adoption:

1. Spelling summary.
2. Punctuation summary, after U1 token clean-up.
3. Grammar summary.

Required tests:

- one primary summary action;
- feedback copy preserved or intentionally approved;
- progress deltas cannot show unearned mastery;
- empty misconceptions render safely;
- subject-specific next-action routes still dispatch correctly.

Acceptance:

- Ready subjects share one summary frame while keeping subject-specific learning copy.
- Summary never claims a reward or mastery change that is not present in the subject result model.

### U7 — Home dashboard hero perspective engine

Introduce a shared dashboard hero scene that can later support Hero Mode without shipping a new economy in P3.

This should become the visual perspective engine for the front dashboard: subject cards, creature presence, today focus, and calm movement should feel connected rather than assembled from unrelated cards.

Recommended contract:

```tsx
<HomeHeroScene
  learner={learnerSummary}
  readySubjects={subjectCards}
  todayFocus={optionalFocus}
  creatureHighlights={ownedCreatures}
  primaryAction={continueLearningAction}
  secondaryActions={...}
/>
```

P3 must keep the existing subject cards and routes working. The Home hero scene can wrap them, not replace them all at once.

Acceptance:

- One primary home action is preserved.
- Existing subject cards still open their subject routes.
- Hero/Camp/Coin copy is not introduced unless already present in the current product surface.
- The scene can later accept a Hero Quest read model without changing subject card APIs.

### U8 — Admin visual asset and property diagnostics

Prepare the operational shape for managing visual properties without making unsafe production writes.

P3 should create read-only or locally mocked diagnostics for:

- subject theme tokens;
- monster asset availability;
- placeholder asset detection in lean bundles;
- background/stage assignments;
- motion profile assignments;
- missing alt text or accessible names;
- bundle size impact of visual assets.

Potential surface:

`src/surfaces/hubs/AdminVisualEngineSection.jsx`

The first version should be diagnostic. Write-capable asset or property management requires a separate approval gate and Worker-backed audit log.

Acceptance:

- Admin can inspect subject visual configuration and missing asset warnings.
- No production visual property write endpoint is introduced in P3 unless separately specified.
- Lean ZIP placeholders are reported as placeholders, not as broken assets.

### U9 — Guardrails, completion report, and release evidence

P3 must close with parser-level and behaviour-level guardrails.

Required guardrails:

- subject-theme token contract;
- raw `.btn` learner-surface ratchet;
- one-primary-action contract expanded to setup/session/summary/home;
- session HUD contract;
- practice stage reduced-motion contract;
- summary truth contract;
- inline-style budget ratchet;
- bundle byte budget;
- completion-report wording ratchet.

Completion report required path:

`docs/plans/james/ui-refactor/ui-refactor-p3-completion-report.md`

The report must include:

- source boundary;
- PR ledger;
- unit-by-unit shipped scope;
- screenshots or visual notes for changed learner-facing scenes;
- exact tests run and Node version;
- bundle numbers and ceiling;
- known deferrals;
- explicit non-claims;
- production evidence only when a live smoke was actually run.

Forbidden report claims unless separately proven:

- “the design system is complete”;
- “all buttons are migrated”;
- “all inline styles are removed”;
- “production is verified”;
- “Hero Mode economy is ready”;
- “future subjects are implemented”.

## 8. Suggested execution order

The recommended order is:

1. U0 evidence map.
2. U1 subject theme token contract.
3. U3 session HUD engine.
4. U2 action engine pass 1.
5. U6 summary engine.
6. U5 setup companion panel.
7. U4 practice stage and background scroller.
8. U7 home dashboard hero perspective engine.
9. U8 admin diagnostics.
10. U9 guardrails and completion report.

The first patch should be U1. It removes the most obvious design-language drift without changing learning logic. It also prepares the later HUD, companion panel, stage, and summary work to consume one subject-token contract.

## 9. P3 success criteria

P3 is complete only when all of the following are true:

- Spelling, Grammar, and Punctuation use the same subject theme contract for learner-facing setup/session/summary surfaces.
- Punctuation setup, map, session, and summary no longer depend on raw Punctuation accent literals in executable JSX.
- Spelling setup no longer needs bespoke inline `--btn-accent` threading.
- The child sees a shared answered/left progress HUD in Spelling, Grammar, and Punctuation sessions.
- At least one shared summary frame is adopted by all three ready subjects.
- At least one shared setup companion panel is adopted by all three ready subjects.
- The raw learner-facing `.btn` inventory is materially lower than the P2 baseline and is governed by a narrower allowlist.
- `SectionHeader` has at least three real production adopters, or the completion report explicitly downgrades it from “adopted primitive” to “available primitive”.
- Reduced-motion support is tested for every newly animated stage or scroller.
- The inline-style inventory does not increase above the P2 snapshot without an explicit accepted exception.
- Bundle size remains within the committed budget or a re-baseline is approved in the same PR with evidence.
- No subject mastery, reward, Star, Mega, or Worker-command semantics change because of P3 visual-engine work.

## 10. Engineering notes

Use the pioneer-then-pattern discipline from P2. A primitive should not become generic until two real consumers prove the API. The exception is `SessionHUD`, where three ready subjects are the minimum adoption target because cross-subject progress language is the product point.

Prefer shallow adapters over deep rewrites. Each subject should provide a small visual view model for the shared component rather than pushing subject internals into the platform UI layer.

Avoid dynamic colour computation in render paths. Subject tokens should be static or registry-derived, deterministic, and testable.

Keep data locators stable. Journey tests and Playwright selectors should survive migrations unless the test is clearly asserting irrelevant attribute order.

When a test fails because of attribute order after adopting a primitive, make the test order-agnostic. Do not add prop-order hacks to the primitive.

Do not treat lean ZIP placeholder assets as product failures. The visual engine should detect and render safe placeholders when real assets are omitted.

## 11. Product copy rules

Use child-facing language that explains the learning purpose without creating pressure.

Preferred patterns:

- “You have answered 6 of 10.”
- “4 left in this round.”
- “Next: fix one wobbly word.”
- “Your creature is watching this skill grow.”
- “Keep your strong skills warm.”

Avoid patterns:

- “Only 4 left or you lose your streak.”
- “Earn coins for every correct answer.”
- “You failed this monster.”
- “Mega lost.”
- “Buy now” or limited-time shop pressure.

## 12. Future-subject readiness

P3 should leave Reading, Reasoning, and Arithmetic with clear integration points:

- subject theme declaration;
- setup companion panel adapter;
- session HUD adapter;
- summary frame adapter;
- practice stage selection;
- home card data contract.

Do not implement their learning engines in P3. A future subject should be able to join by satisfying these contracts when its subject engine is ready.

## 13. Production release rule

A P3 unit can be merged when local source and test evidence passes. A P3 unit can be called production-verified only when a live smoke or deployed artefact check is recorded with:

- environment;
- origin URL or deployment identifier;
- timestamp;
- release or commit ID;
- command/check performed;
- pass/fail result;
- failure details when relevant.

Without that evidence, the correct wording is “implemented and locally verified”, not “production verified”.
