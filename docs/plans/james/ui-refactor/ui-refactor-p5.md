# UI Refactor P5 — Visual Engine Operating Contract

Status: proposed
Owner: Product + Engineering
Language: UK English
Predecessor: `docs/plans/james/ui-refactor/ui-refactor-p4-completion-report.md`

## 1. Purpose

P5 is the final UI-refactor closure phase for Visual Engine v1. It must turn the P4 visual engine into an evidence-complete, repeatably verifiable, production-operable product layer.

P5 is not another open-ended primitive-building phase. After P5, work should move into named product streams such as Hero Mode, Reading launch, Reasoning launch, Arithmetic launch, or Admin asset management. Do not create a P6 UI-refactor phase unless P5 uncovers a production blocker that cannot be safely closed inside this contract.

The product goal is simple: a child should experience Spelling, Grammar, and Punctuation as one coherent learning app, with one clear route into practice, one shared session progress language, one shared summary structure, and one consistent companion/monster/status layer. Future subjects must be able to plug into the same visual contract without copying Spelling's bespoke UI.

## 2. Evidence boundary

P5 must keep evidence layers separate:

- ZIP evidence proves the supplied bundle only.
- GitHub PR evidence proves the merged ref and PR ledger only.
- Local runs prove behaviour in that local checkout only.
- Production evidence proves production only when live smoke, deployment identity, timestamp, origin, and screenshot/artefact availability are all present.

A completion report must not use wording such as "production-proven" or "visual correctness verified" unless the evidence pack proves it. A manifest that names screenshots is not enough if the screenshot files are not present or externally linked with durable evidence.

## 3. P4 validation findings that P5 must close

P4 is acceptable, but P5 must close these evidence and operating gaps first:

1. The P4 report names PR `#815` but does not explicitly name the production-evidence follow-up PR `#823`.
2. The P4 visual evidence manifest lists 12 captured screenshots, but the reviewed lean ZIP contains only `01-home.png`; the other 11 referenced screenshot files are absent from the bundle.
3. Some P4 contract tests require `esbuild` and cannot run from a dependency-free lean ZIP. This is acceptable, but the completion evidence should separate parser-only checks from dependency-required render checks.
4. P4 proved Visual Engine v1 source adoption; P5 must prove the operating contract: every ready subject can enter, practise, return to summary, and return home without duplicate primary routes or state-loss regressions.

## 4. Product principles

P5 must preserve these principles.

- Production safety first. Do not widen Hero Mode, reward economy, or admin write controls as part of UI refactor closure.
- Spelling remains the visual north star, but Grammar and Punctuation must not be treated as second-class wrappers.
- One primary learner action per surface branch. Secondary actions are allowed, but the next best action must be obvious.
- Subject mastery and reward semantics remain subject-owned. UI refactor must not change Stars, Mega, marking, scheduler decisions, or content generation.
- The visual engine should support ready subjects now and placeholder subjects later. Reading, Reasoning, and Arithmetic must be able to adopt the visual contract without production engine leakage.
- Admin Visual Engine remains diagnostic/read-only in P5 unless a separate admin asset-management contract approves writes.

## 5. Non-goals

P5 must not ship:

- Hero Coins, Hero Camp spending, new reward loops, or economy writes.
- New marking logic, learning algorithms, content generation, or Star semantics.
- Admin visual asset publishing or mutation workflows.
- A public subject engine for Reading, Reasoning, or Arithmetic.
- A bundle-budget re-baseline unless an owner-approved byte-budget memo explains the regression and an equivalent dead-code recovery attempt has been made.

## 6. Delivery units

### U0 — Evidence ledger and visual artefact verifier

Update the P4 evidence ledger and add a repeatable verifier.

Required changes:

- Amend the P4 completion report or add an addendum that explicitly records PR `#815` for source/local delivery and PR `#823` for production-evidence closure.
- Add `scripts/verify-ui-refactor-visual-evidence.mjs`.
- The verifier must read `reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json` and fail if any `screenshots[].path` is missing, unless the screenshot entry is explicitly marked `external` or `omitted` with a durable reason.
- Add `tests/ui-visual-evidence-pack.test.js` covering present, missing, external, and omitted screenshot states.
- Re-issue the evidence pack with all 12 PNG files, or downgrade the missing 11 screenshot entries to an explicit non-claim.

Acceptance:

- The verifier passes on the committed evidence pack.
- The completion report does not imply that missing screenshot files are bundled.
- The final report distinguishes production smoke from visual screenshot evidence.

### U1 — End-to-end visual journey contract for ready subjects

Prove the learner journey across Spelling, Grammar, and Punctuation, not just component adoption.

Required journeys:

- Home → subject setup → session → feedback where relevant → summary → home.
- Home → best recommended subject → setup/session without duplicate primary CTA.
- Summary → next practice route with exactly one primary action.
- Setup companion panel visible on desktop and safe on mobile.
- Session HUD visible and local duplicate question-count copy absent from the same surface branch.

Implementation guidance:

- Prefer parser/SSR tests where possible.
- Browser journeys may be used for production evidence, but they must record origin, deployment version, timestamp, and screenshot path.
- Do not mutate subject learning logic to make journeys easier.

Acceptance:

- `tests/ui-visual-journey-ready-subjects.test.js` exists and passes.
- No ready-subject journey renders two competing primary learner actions above the fold.
- No journey loses a live Worker summary read model after a command response.

### U2 — Home hero operating state machine

P4 consolidated the normal home hero path. P5 must make all home hero states explicit and guarded.

States to cover:

- No ready subject.
- One ready subject.
- Three ready subjects.
- Six registered subjects with only three ready.
- Hero disabled.
- Hero enabled but shadow/hold state.
- Hero enabled with one active Hero Quest card.
- Persistence degraded.
- Read-only learner context.

Required behaviour:

- Exactly one primary learner CTA in every state branch.
- Hero Mode must not add Coins/Camp pressure through this contract.
- Subject cards remain visible and stable; future subjects may be present as unavailable without creating fake production affordances.
- Parent/Admin links remain secondary and role-bound.

Acceptance:

- Extend `tests/home-hero-no-duplicate-primary.test.js` to cover all states above.
- `HomeHeroScene` remains a composition primitive, not a scheduler or reward engine.
- No Hero/Coin/Camp economy copy appears unless a separate Hero Mode contract enables it.

### U3 — Companion panel data quality and responsive behaviour

P4 made companion panels visible. P5 must make them useful and safe.

Required behaviour:

- Spelling companion panel shows owned/discovered monsters, secure/due/trouble stats, and a next focus.
- Grammar companion panel shows discovered Grammar creatures and meaningful confidence/progress stats.
- Punctuation companion panel shows discovered eggs/monsters, due/wobbly/Grand Star stats, and a next focus.
- Mobile behaviour uses a safe disclosure or stacked layout; it must not hide the primary action or overflow the setup surface.
- Empty states must be child-safe and not shame the learner.

Acceptance:

- `tests/ui-companion-panel-data-contract.test.js` verifies each ready subject maps real adapter data into the panel.
- `tests/ui-companion-panel-responsive-contract.test.js` verifies CSS classes for mobile stacking/disclosure and no fixed-width overflow.
- The component remains stateless and read-only.

### U4 — Summary frame closure and next-action discipline

P4 adopted `SessionSummaryFrame`. P5 must prove the frame owns the subject summaries without duplication.

Required behaviour:

- Each ready subject summary has one headline, one result frame, one primary next action, and secondary actions inside the shared action row.
- Boss Dictation remains Mega-safe: no `Drill all` and no per-word drill actions on Boss summaries.
- Grammar and Punctuation keep subject-specific details inside the frame slot without reintroducing legacy action clusters.
- Summary return routes must preserve subject read-model state returned by the Worker.

Acceptance:

- Extend `tests/ui-summary-no-duplicate-actions.test.js` to cover all ready subject summary types, including Spelling Boss, Grammar mini-test/repair/smart outcomes, and Punctuation smart/guided/GPS outcomes.
- Summary screens do not render raw `.btn primary xl` outside the shared action components.
- No summary frame computes rewards, Stars, mastery, or scheduler state.

### U5 — Admin Visual Engine diagnostics v1.1

Keep Admin Visual Engine read-only, but make it operationally useful.

Required behaviour:

- Display registered subject themes, motion profiles, backdrop contexts, companion-panel inputs, and summary-frame adoption status.
- Display visual evidence pack status: smoke files present, screenshot files present/missing/external, deployment version, commit, and timestamp.
- Display asset placeholder status as `info`, not `error`, when the lean ZIP or manifest intentionally uses placeholders.
- Do not add write, publish, upload, mutation, or `/api` calls.

Acceptance:

- `tests/admin-visual-engine-diagnostics.test.js` verifies read-only behaviour, no `fetch`, no mutation actions, no inline styles, and evidence-pack status rows.
- Direct `/admin#section=visual-engine` route remains accepted and dirty-row safe.
- Admin diagnostics can be used by reviewers to see whether a future evidence pack is complete.

### U6 — Future-subject visual adapter contract

Prepare Reading, Reasoning, and Arithmetic for adoption without shipping their production engines.

Required contract:

- Define a `SubjectVisualAdapter` shape for setup, session HUD, companion panel, practice stage, and summary frame inputs.
- Ready subjects must provide adapters through their current view-model paths.
- Placeholder subjects may provide safe placeholder adapters that clearly show unavailable status and do not expose fake production practice controls.
- The adapter must not import Worker command handlers or browser-only subject engines for placeholder subjects.

Acceptance:

- `tests/ui-subject-visual-adapter-contract.test.js` verifies adapters for Spelling, Grammar, Punctuation, and placeholder-safe entries for Reading, Reasoning, Arithmetic.
- No placeholder subject gains a production `start practice` path from this contract.
- Subject expansion docs are updated to reference the visual adapter contract.

### U7 — Production evidence replay and release close

P5 closes only when source, local, and production evidence all line up.

Required evidence:

- `npm test` pass.
- `npm run check` pass.
- `npm run audit:client` pass with main bundle within the existing 232,000-byte ceiling, unless an owner-approved budget memo exists.
- `node scripts/verify-ui-refactor-visual-evidence.mjs` pass.
- Production smoke for Home/bootstrap, Spelling summary path, Grammar session/summary path, Punctuation session/summary path, and Admin Visual Engine route.
- Screenshot evidence pack with all required files present or explicitly external/omitted.

Acceptance:

- `docs/plans/james/ui-refactor/ui-refactor-p5-completion-report.md` exists.
- The report includes exact commands, Node version, deployment version, source commit, smoke paths, screenshot pack status, and non-goals.
- The report does not claim Hero economy, admin asset mutation, future-subject engines, or P6 delivery.

## 7. Test matrix

Minimum P5 test set:

```text
node --test \
  tests/ui-production-evidence-contract.test.js \
  tests/ui-visual-evidence-pack.test.js \
  tests/home-hero-no-duplicate-primary.test.js \
  tests/ui-visual-journey-ready-subjects.test.js \
  tests/ui-session-hud-contract.test.js \
  tests/ui-session-hud-adapter-render.test.js \
  tests/ui-companion-panel-contract.test.js \
  tests/ui-companion-panel-data-contract.test.js \
  tests/ui-summary-engine-contract.test.js \
  tests/ui-summary-no-duplicate-actions.test.js \
  tests/admin-visual-engine-diagnostics.test.js \
  tests/ui-subject-visual-adapter-contract.test.js \
  tests/csp-inline-style-budget.test.js \
  tests/bundle-byte-budget.test.js
```

Full release close also requires:

```text
npm test
npm run check
npm run audit:client
node scripts/verify-ui-refactor-visual-evidence.mjs
```

Production close requires explicit live/deployed evidence with origin, timestamp, deployment version, source commit, and pass/fail result.

## 8. Bundle and CSP policy

P5 should stay within the existing P3/P4 main-bundle ceiling of 232,000 gzip bytes.

If P5 adds more than 1,000 gzip bytes, it must include a byte-budget note explaining:

- what changed;
- why the change belongs in the first-load bundle;
- what dead CSS/JS was removed or attempted;
- whether lazy loading is possible;
- why the owner accepts the trade-off.

CSP inline-style count must not regress above the current committed budget without an owner-approved classification update. Prefer classed CSS over new inline `style={...}` sites. CSS-variable passthrough is allowed only when the value is genuinely dynamic and classified.

## 9. Completion report wording rules

The P5 completion report must use precise claim language.

Allowed:

- `source-proven`
- `ZIP-local-test-proven`
- `GitHub PR-proven`
- `production-smoke-proven`
- `screenshot-pack-proven`
- `not proven from supplied artefacts`

Forbidden unless fully evidenced:

- `visual correctness proven`
- `production-proven` without smoke and screenshot evidence
- `P6 delivered`
- `Hero economy delivered`
- `Admin asset management delivered`
- `future subjects ready for production`

## 10. Exit criteria

P5 is complete when:

1. P4 evidence packaging is corrected.
2. The visual evidence verifier exists and passes.
3. Ready-subject journeys are tested as journeys, not only primitives.
4. Home hero states are explicit and have no duplicate primary learner actions.
5. Companion panels are useful, visible, and responsive across the three ready subjects.
6. Summary frames own next actions without duplication.
7. Admin Visual Engine is a useful read-only diagnostics surface.
8. Future subjects have a safe visual adapter contract but no fake production engine.
9. Local and production evidence are captured with source boundaries intact.
10. The completion report closes UI Refactor Visual Engine v1 without opening a generic P6.

