---
title: "UI Refactor P2 — Shared Interaction and Surface Contract"
type: product-engineering-contract
status: proposed
date: 2026-04-29
owner: james
language: UK English
scope: Home, Hero Mode, Spelling, Grammar, Punctuation, Parent Hub, Admin / Operations, and reusable platform UI primitives
---

# UI Refactor P2 — Shared Interaction and Surface Contract

## 1. Guiding sentence

P2 turns the P1 UI foundations into a practical platform UI contract: the child should meet the same action hierarchy, state messages, surface rhythm, progress meters, filters, and hero-art behaviour across ready subjects, while each subject keeps its own learning engine, reward evidence, copy, and visual world.

This is not a redesign. It is a convergence pass. The outcome should make future UI work faster because common UI choices have one approved primitive, one CSS/token contract, and one test oracle.

## 2. P1 validation baseline

The requested P1 report path is not present in the supplied bundle:

`docs/plans/james/ui-refactor/2026-04-29-completion-report.md`

The supplied bundle also has no `docs/plans/james/ui-refactor/` directory. P2 therefore starts from repository evidence rather than report claims.

Evidence found in the current tree:

| Area | Current evidence | P2 judgement |
| --- | --- | --- |
| Shared state primitives | `EmptyState`, `ErrorCard`, and `LoadingSkeleton` exist under `src/platform/ui/`. | Foundation exists. Adoption is partial and should be broadened. |
| Empty-state adoption | Parser test covers six production `EmptyState` consumers and two `ErrorCard` consumers. | Good P1 foundation. Keep the allowlist but widen the surface map. |
| Hero backdrop foundation | `HeroBackdrop`, `hero-bg`, `luminance`, and `useSetupHeroContrast` exist in `src/platform/ui/`. Grammar and Spelling use the shared path. | Good foundation. Punctuation remains bespoke and should be migrated in P2. |
| Grammar setup alignment | `GrammarSetupScene` uses shared setup rhythm, `HeroBackdrop`, shared contrast probing, `SetupMorePractice`, `.mode-card`, and one primary CTA. | Good example for P2 target shape. |
| Punctuation setup alignment | `PunctuationSetupScene` still uses bespoke image hero, inline accent styles, bespoke secondary buttons, and bespoke round-length controls. | Main child-facing P2 migration target. |
| Button/action primitives | Surfaces still call `<button className="btn ...">` directly. There is no shared React `Button` primitive. | P2 should add the primitive and stop new bespoke button assembly. |
| Token governance | `styles/app.css` has core tokens, but many raw colour values and inline style sites remain. | P2 needs a token guard for changed files, not a whole-repo purge. |
| Verification | Targeted parser tests can pass, but full `npm test` cannot be claimed from the supplied bundle because `node_modules` is absent. | P2 completion must include real commands, Node version, and pass/fail output. |

P1 should be described as **foundation shipped, convergence incomplete**. Any stronger claim, such as “UI/UX is unified across the app”, is not supported by the supplied tree.

## 3. Goals

P2 must deliver five product-visible improvements.

First, the primary action hierarchy should be predictable. A child should see one obvious primary action on Home, Hero Quest, Spelling setup, Grammar setup, and Punctuation setup. Secondary practice choices may exist, but they must not compete visually with the main action.

Second, repeated surfaces should share primitives. Buttons, cards, empty states, error states, loading skeletons, progress meters, stat cards, filter chips, and segmented controls should come from platform UI contracts rather than being re-authored per subject.

Third, subject identity should come from content, artwork, accent, and copy, not from divergent interaction mechanics. Bellstorm Coast may look different from Grammar Garden, but “start”, “continue”, “more practice”, “filter”, “round length”, and “progress” should feel like one product.

Fourth, P2 should reduce future implementation time. A new subject or hub panel should be able to compose approved platform primitives instead of copying CSS and button markup from another surface.

Fifth, verification must be claim-safe. The completion report must show exactly what was changed, which surfaces adopted each primitive, which tests ran, and which known gaps remain.

## 4. Non-goals

P2 must not change subject learning engines, marking, scheduling, Worker command authority, reward evidence, Star semantics, Hero economy, content generation, authentication, or persistence.

P2 must not introduce a third-party UI framework, CSS-in-JS library, component generator, design-token build pipeline, or storybook dependency. The repository is intentionally light on framework machinery; P2 should respect that.

P2 must not attempt a whole-repo visual rewrite. The migration should target the highest-value shared patterns and leave specialist surfaces alone when they are genuinely content-driven or game-rendering boundaries.

P2 must not claim full design-system completion. It should claim only the primitives and surfaces that were actually migrated.

## 5. Product contract

### 5.1 One-primary-action rule

Every child-facing landing surface should expose exactly one above-the-fold primary action:

| Surface | Primary action owner | Secondary action pattern |
| --- | --- | --- |
| Home without Hero | “Start subject” recommendation | Codex and subject grid remain secondary. |
| Home with Hero | Hero Quest start/continue | Hero Camp and subject cards remain secondary. |
| Spelling setup | Start selected spelling round | Word Bank, Codex, settings, and optional modes remain secondary. |
| Grammar setup | Start selected Grammar round | Grammar Bank and More Practice disclosure remain secondary. |
| Punctuation setup | Start/continue best punctuation mission | Map, Wobbly Spots, GPS Check, and round length remain secondary. |

The shared `Button` primitive should make this enforceable: primary buttons use the same size, busy state, disabled state, icon slot, and data-action forwarding.

### 5.2 State-message rule

Empty, loading, and error states should use shared primitives unless a surface has a documented reason not to.

The copy pattern remains:

1. what happened;
2. whether progress is safe;
3. what action is available.

P2 should migrate obvious remaining gaps such as Hero Quest empty/error branches and AdminPanelFrame default loading/empty branches.

### 5.3 Progress-display rule

Progress bars and stat cards should use shared semantics:

- progress has a labelled value and a safe min/max clamp;
- Star and percentage meters use the same visual rhythm where appropriate;
- subject accents flow through CSS custom properties;
- no raw colour literals are added in migrated components;
- dynamic widths use CSS variables rather than arbitrary inline style bags where feasible.

### 5.4 Filter and segmented-control rule

Filter chips and round-length pickers should share keyboard and visual behaviour.

P2 should create a small `SegmentedControl` / `ChoiceGroup` primitive that can cover:

- Spelling round length;
- Grammar round length;
- Punctuation round length;
- status-filter chip groups where the interaction is equivalent.

Subject-specific labels and telemetry remain owned by the caller.

### 5.5 Hero-art rule

Hero artwork should use the shared backdrop engine where the surface is a setup or landing hero.

P2 should migrate Punctuation setup to the shared `HeroBackdrop` + contrast model, while preserving Bellstorm Coast identity, existing data hooks, and journey tests.

### 5.6 Adult-surface rule

Parent and Admin surfaces may be denser than child surfaces, but they should still use shared cards, buttons, loading, empty, stale, and error primitives. Adult surfaces are not exempt from token, accessibility, and claim-safety rules.

## 6. Engineering contract

### 6.1 Folder shape

Add only the primitives required by this phase. Suggested files:

```text
src/platform/ui/Button.jsx
src/platform/ui/Card.jsx
src/platform/ui/ProgressMeter.jsx
src/platform/ui/StatCard.jsx
src/platform/ui/SegmentedControl.jsx
src/platform/ui/SectionHeader.jsx
src/platform/ui/ui-contract.js
```

Avoid a broad barrel export unless a test proves it does not increase the main bundle or create circular import risk. Direct imports are acceptable and match the current repository style.

### 6.2 Button primitive

`Button` must support:

- `variant`: `primary`, `secondary`, `ghost`, `good`, `warn`, `bad`;
- `size`: `sm`, `md`, `lg`, `xl`;
- `busy` and `disabled` states;
- `dataAction`, `dataValue`, and caller-provided `data-*` attributes;
- optional `startIcon` and `endIcon` slots;
- `type="button"` by default;
- visible label required unless `aria-label` is supplied.

The primitive should render the existing `.btn` class family first, not introduce a new visual language. P2 is allowed to centralise behaviour before changing appearance.

Acceptance:

- migrated surfaces no longer hand-build primary buttons with repeated `className="btn primary xl"` unless there is a documented exception;
- busy buttons carry `aria-busy="true"` and remain disabled;
- disabled buttons preserve existing data-action selectors where tests depend on them;
- no button copy changes unless listed in the completion report.

### 6.3 Card and surface primitive

`Card` should wrap the existing `.card`, `.soft`, and `border-top` conventions.

It must support:

- `tone`: default, soft, warning, error;
- optional `accent` passed as a CSS custom property;
- `as` element override for `section`, `article`, or `div`;
- heading/label wiring through caller composition, not a heavy card DSL.

Acceptance:

- dynamic accent moves from `style={{ borderTopColor: ... }}` to a named CSS variable where feasible;
- child-facing cards keep the existing rounded/paper rhythm;
- adult cards keep information density but stop duplicating placeholder/loading chrome.

### 6.4 ProgressMeter primitive

`ProgressMeter` must support:

- clamped numeric value;
- max value defaulting to 100;
- accessible label;
- optional visible value text;
- subject accent through CSS custom property;
- Star and percentage variants without changing subject evidence semantics.

Acceptance:

- migrate at least Punctuation monster meters and Home subject-card progress meter;
- keep Grammar and Spelling progress behaviour stable unless the migration is trivial and covered;
- no subject engine derives progress from the UI component.

### 6.5 StatCard primitive

`StatCard` should cover compact “Due today / Wobbly / Grand Stars” style readouts and similar dashboard stats.

Acceptance:

- Punctuation setup progress row migrates first;
- Grammar today cards are evaluated but migrated only if it does not disturb existing tests;
- values remain display-only.

### 6.6 SegmentedControl primitive

`SegmentedControl` must support radio-group semantics:

- `role="radiogroup"` on the wrapper;
- `role="radio"` and `aria-checked` per option;
- arrow-key behaviour if implemented; otherwise native button focus order must remain clear and documented;
- disabled state;
- selected slider CSS custom properties where needed;
- caller-owned dispatch and telemetry.

Acceptance:

- migrate Grammar and Punctuation round-length controls to the shared primitive;
- Spelling wrapper can remain as a thin adapter if direct migration risks parity;
- all migrated controls retain existing data-action and data-value hooks.

### 6.7 SectionHeader primitive

`SectionHeader` should cover eyebrow, title, subtitle, trailing action, and optional status chip.

Acceptance:

- use in at least one child surface and one adult surface;
- no regression to heading hierarchy or landmark labels;
- copy remains caller-owned.

### 6.8 Token and CSS contract

P2 should add a small token rule rather than attempting a full colour purge.

Changed files must follow:

- no new raw hex values outside token definitions, subject metadata, tests, or documented visual fixtures;
- subject accent should be passed as `--subject-accent`, `--ui-accent`, or a similarly named CSS variable;
- dynamic progress widths should prefer `--progress-value` / transform scale where feasible;
- reduced-motion behaviour must be preserved for any new animation;
- mobile width down to 360 px must be considered for each migrated surface.

The completion report must list any exceptions.

### 6.9 Accessibility contract

P2 must preserve or improve:

- keyboard focus visibility;
- button `type="button"` defaulting;
- radio/segmented-control semantics;
- `aria-live` behaviour for state primitives;
- accessible names for icon-only buttons;
- colour contrast on hero artwork;
- reduced-motion behaviour.

## 7. Migration units

### U0 — Restore evidence and adoption map

Create the missing UI refactor directory and add a short P1 evidence addendum:

```text
docs/plans/james/ui-refactor/2026-04-29-p1-validation-addendum.md
```

The addendum must include:

- the missing report path acknowledgement;
- exact commands run;
- targeted pass/fail results;
- current `src/platform/ui` primitive list;
- adoption map for Home, Spelling, Grammar, Punctuation, Parent Hub, Admin;
- known gaps that P2 owns.

### U1 — Shared Button

Add `Button.jsx`, parser/SSR tests, and migrate:

- Home hero primary/ghost buttons;
- HeroQuestCard primary buttons;
- Grammar start button;
- Punctuation primary CTA;
- at least one adult refresh/back action.

Do not change visual hierarchy or copy.

### U2 — Card, SectionHeader, and state default tightening

Add `Card.jsx` and `SectionHeader.jsx`.

Migrate:

- SubjectRuntimeFallback wrapper accent handling;
- AccessDeniedCard wrapper if low risk;
- AdminPanelFrame default loading and empty slots to shared primitives;
- one Home card surface if low risk.

### U3 — ProgressMeter and StatCard

Add `ProgressMeter.jsx` and `StatCard.jsx`.

Migrate:

- Punctuation monster meters;
- Punctuation progress row;
- Home subject-card meter.

Do not change Star or progress calculations.

### U4 — SegmentedControl / ChoiceGroup

Add `SegmentedControl.jsx`.

Migrate:

- Grammar round-length picker;
- Punctuation round-length toggle;
- evaluate Spelling round length for a thin wrapper migration.

Preserve data-action hooks and radio semantics.

### U5 — Broaden EmptyState / ErrorCard / LoadingSkeleton adoption

Migrate obvious remaining state branches:

- HeroQuestCard error state should use `ErrorCard` or a documented variant;
- HeroQuestCard no-launchable-task state should use `EmptyState` or a documented variant;
- AdminPanelFrame default loading state should use `LoadingSkeleton`;
- AdminPanelFrame default empty state should use `EmptyState`.

Update the allowlist tests so these become load-bearing.

### U6 — Punctuation setup hero alignment

Migrate Punctuation setup from bespoke hero image to shared `HeroBackdrop` where feasible.

Requirements:

- preserve Bellstorm Coast artwork and existing `data-section` hooks;
- preserve the single primary CTA;
- preserve current journey tests;
- introduce a Punctuation contrast profile or documented fallback;
- no production subject command or scheduling change.

### U7 — Guardrails and completion report

Add or update parser-level tests:

```text
tests/ui-button-primitive.test.js
tests/ui-component-adoption.test.js
tests/ui-token-contract.test.js
tests/ui-primary-action-contract.test.js
```

Update existing tests only when the old assertion pins implementation details that have deliberately moved into a shared primitive.

The completion report must be written at:

```text
docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md
```

It must include:

- changed-file table;
- primitive adoption table;
- before/after risk notes;
- exact command output summary;
- known non-migrated surfaces;
- screenshots or visual QA notes when available;
- explicit statement of what P2 does not claim.

## 8. Verification requirements

Minimum local verification before completion:

```bash
node --test tests/empty-state-parity.test.js
node --test tests/bundle-byte-budget.test.js
node --test tests/ui-button-primitive.test.js
node --test tests/ui-component-adoption.test.js
node --test tests/ui-token-contract.test.js
node --test tests/ui-primary-action-contract.test.js
npm test
npm run build
npm run audit:client
npm run check
```

If a command cannot run, the completion report must say why and must not claim it passed.

The report must include:

- Node version;
- package install state;
- whether `node_modules` was present;
- whether the worktree used the repository `.nvmrc` version;
- every skipped command and reason.

## 9. Release gates

P2 is complete only when:

1. the missing P1 evidence problem is documented;
2. the shared `Button` primitive is adopted by child-facing primary actions in the selected surfaces;
3. Punctuation setup no longer carries a bespoke primary-action implementation that diverges from Grammar/Spelling without a documented exception;
4. the new progress/stat primitives are used in at least Punctuation setup and Home subject cards;
5. HeroQuestCard and AdminPanelFrame state branches are covered by shared state primitives or documented exceptions;
6. no new raw colour literals are added in changed UI files outside approved token/metadata locations;
7. inline-style budget movement is either reduced or explicitly documented with updated inventory and tests;
8. targeted UI tests pass;
9. full repository verification is either green or honestly reported as blocked;
10. the completion report avoids global claims such as “the design system is finished”.

## 10. Risks and controls

| Risk | Why it matters | Control |
| --- | --- | --- |
| Over-abstraction | A heavy component API will slow subject work. | Keep primitives small and compositional. Do not create a theme engine. |
| Spelling parity regression | Spelling is the mature baseline. | Use thin adapters where direct migration risks parity. Run spelling smoke/characterisation tests. |
| Punctuation journey regression | Punctuation has many recent UX hardening changes. | Preserve `data-section`, `data-action`, and CTA dispatch hooks. Add parser tests before migration. |
| Bundle growth | Shared primitives can accidentally pull adult or subject code into the main path. | Run bundle budget test and client audit. Avoid broad barrel imports if they increase bundle size. |
| Token false confidence | Existing CSS still has many raw colours. | Gate changed files first; do not claim whole-repo token purity. |
| Accessibility drift | Refactoring controls can break keyboard and screen-reader behaviour. | Pin radio semantics, live regions, button types, labels, and reduced motion in tests. |
| Report overclaim | The P1 report is already missing from the bundle. | Completion report must list exact evidence and known gaps. |

## 11. Completion report wording guard

Allowed claim:

> P2 migrated the selected primary actions, progress displays, segmented controls, and state branches to shared platform primitives. The migrated surfaces now share action hierarchy and state-message behaviour, with known exceptions documented.

Forbidden claim:

> The app UI is fully unified.

Forbidden claim:

> All colours and inline styles are tokenised.

Forbidden claim:

> Full verification passed.

unless the report includes the exact command evidence.

## 12. Suggested implementation order

1. U0 evidence addendum and adoption map.
2. Button primitive and low-risk CTA migrations.
3. State primitive adoption widening.
4. Progress/stat primitives and Punctuation setup migration.
5. SegmentedControl migration.
6. Punctuation hero-backdrop alignment.
7. Token/inline-style guardrails and completion report.

This order gives useful product consistency early while reducing the chance of a broad, risky visual rewrite.
