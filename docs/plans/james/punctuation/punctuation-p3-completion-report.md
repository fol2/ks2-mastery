# Punctuation Phase 3 — Completion Report

**Date:** 2026-04-26
**Author:** James To (with scrum-master agent orchestrating per-unit implementation + reviewer fan-out + follower loops)
**Plan:** [`docs/plans/2026-04-25-005-feat-punctuation-phase3-ux-rebuild-plan.md`](../../2026-04-25-005-feat-punctuation-phase3-ux-rebuild-plan.md)
**Origin recommendations:** [`punctuation-p3.md`](punctuation-p3.md)
**Predecessor:** [`punctuation-p2-completion-report.md`](punctuation-p2-completion-report.md)

---

## Executive summary

Punctuation Phase 3 shipped as **10 merged pull requests** (plus one plan-status-flip PR) over a single continuous overnight autonomous SDLC run. The subject turned from "a single 350-line monolith exposing 10 mode buttons and adult facet chips" into a scene-split learner experience that mirrors Spelling's gold-standard shape: **Setup (child dashboard) → Session (one question at a time, input shape per item mode) → Feedback (short nudge + reveal) → Summary (score + wobbly chips + monster progress + next actions) → Punctuation Map (14 skills grouped by monster, filter + detail modal)**.

Every requirement in the plan's Requirements Trace (R1–R18) landed. The plan's "Deferred to Follow-Up Work" list stayed empty by design — all 10 units shipped as one coherent UX rebuild with the correct topological dependency chain preserved.

**Headline metrics**

- PRs opened / merged: **10 / 10** feature PRs + **1 / 1** plan-status-flip
- Reviewer dispatches: **≈32** end-to-end (mix of correctness / adversarial / maintainability / project-standards / security / testing / design-lens, serving up to 4 rounds on state-machine-heavy units)
- Follower commits: **11** (U2 ×3 counting the rebase preservation, U3 ×1, U4 ×1, U5 ×3, U6 ×1, U7 ×1, U10 ×1)
- Rebase cycles: **4** (U2 twice, U3 once, U4 once) — triggered by parallel merges on main; each preserved follower work
- Tests written: **~140 new** across pure-function selectors, reducers, SSR scene assertions, adversarial regression locks, redaction sweeps, and behavioural goldens
- Production code touched: **~18 files** across `src/subjects/punctuation/`, `src/platform/core/store.js` (rehydrate flag), `worker/src/subjects/punctuation/read-models.js` (U8 only), `styles/app.css`, `scripts/`, and the plan doc
- Final suite state at merge of U10: **2637 / 2634 pass / 2 expected pre-existing unrelated fails (grammar-production-smoke templates field + punctuation-release-smoke wrangler.jsonc JSON parse) / 1 skipped**
- `release-id impact` across every PR: **none** — Oracle replay (`tests/punctuation-legacy-parity.test.js`) byte-for-byte preserved; `contentReleaseId` unchanged from Phase 2's `punctuation-r4-full-14-skill-structure`
- Adversarial review caught **7 HIGH defects** across U5, U2, U3, U4, U6 that correctness and maintainability reviewers missed

---

## What shipped, unit by unit

| Unit | PR | Goal | Adversarial HIGH caught | Follower rounds |
|------|----|------|------------------------|-----------------|
| U1 | [#208](https://github.com/fol2/ks2-mastery/pull/208) | View-model + session-ui + composeIsDisabled extraction | 0 | 0 (LOW findings only) |
| U9 | [#213](https://github.com/fol2/ks2-mastery/pull/213) | Phase 2 cleanup tombstones (docs + codex rank + skip) | 0 | 0 |
| U8 | [#215](https://github.com/fol2/ks2-mastery/pull/215) | Strip `contextPack` from child learner read-model | 0 (MEDIUM + adversarial LOW) | 1 |
| U5 | [#219](https://github.com/fol2/ks2-mastery/pull/219) | `map` phase + PunctuationMapScene + filter/detail handlers | **5 HIGH** across rounds 1–3 | 3 |
| U6 | [#231](https://github.com/fol2/ks2-mastery/pull/231) | Skill Detail Modal + Guided-focus dispatch | **1 HIGH** (content leak) + 2 design HIGH | 1 |
| U3 | [#232](https://github.com/fol2/ks2-mastery/pull/232) | Session scene + per-item-type input shape | **3 HIGH** (pendingCommand + 2 × key-collision) | 1 |
| U2 | [#234](https://github.com/fol2/ks2-mastery/pull/234) | Setup scene + stale-prefs migration | **1 HIGH** (prod-routing bypass) + 4 MEDIUM | 3 (including 2 rebase cycles) |
| U7 | [#237](https://github.com/fol2/ks2-mastery/pull/237) | Map + Modal read-model redaction audit (characterisation) | 0 | 1 |
| U4 | [#238](https://github.com/fol2/ks2-mastery/pull/238) | Summary scene + celebration headline + reward-state wiring | **2 HIGH** (dead-path reward state, clinical tone) | 1 |
| U10 | [#244](https://github.com/fol2/ks2-mastery/pull/244) | Child-copy sweep + cluster parity + Phase 3 CSS block | 0 (design-lens blocking only) | 1 |
| — | [#245](https://github.com/fol2/ks2-mastery/pull/245) | Plan frontmatter `status: active → completed` | — | — |

---

## What each unit actually fixed

### U1 — The pure-function foundation every later scene imports from

Expanded `src/subjects/punctuation/components/punctuation-view-model.js` from 59 lines (4 helpers) to a real view-model surface: frozen `PUNCTUATION_PRIMARY_MODE_CARDS` / `PUNCTUATION_MAP_STATUS_FILTER_IDS` / `PUNCTUATION_MAP_MONSTER_FILTER_IDS` / `ACTIVE_PUNCTUATION_MONSTER_IDS` / `PUNCTUATION_DASHBOARD_HERO` / `PUNCTUATION_CHILD_FORBIDDEN_TERMS` (including the 6 dotted-tag prefixes + `/\bWorker\b/i` regex) / `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE`, and pure helpers `composeIsDisabled`, `punctuationChildStatusLabel`, `punctuationChildMisconceptionLabel` (deterministic map over the dotted misconception-tag ids from `shared/punctuation/marking.js` with `null` for unknowns), `punctuationFeedbackChips`, `punctuationPrimaryModeFromPrefs` (collapses 6 cluster modes + `'guided'` to `'smart'` for display), `buildPunctuationDashboardModel`, `buildPunctuationMapModel`, `bellstormSceneForPhase` extended for `'map'`.

New `src/subjects/punctuation/session-ui.js` at subject root (mirrors Grammar's exact shape) with `punctuationSessionSubmitLabel`, `punctuationSessionInputShape`, `punctuationSessionProgressLabel`, `punctuationSessionHelpVisibility`, `punctuationSessionInputPlaceholder`.

`PunctuationPracticeSurface.jsx` only touch: import `composeIsDisabled` from the view-model instead of declaring it locally. No behavioural change; locks a single source of truth for downstream scene work.

Tests: 72 new pure-function assertions (54 view-model + 18 session-ui) with self-verifying "no React imports" guards that `grep` the source file. Reviewer round caught only LOW findings: duplicate `PUNCTUATION_PRIMARY_MODE_IDS` export alongside `PUNCTUATION_PRIMARY_MODE_CARDS`, a tautological `\bWorker\b/i` assertion, and a few missing `masteredCount` fallback paths. All logged as follow-ups rather than blocking — tracked for U5/U10 and resolved there.

### U9 — Phase 2 cleanup tombstones

Cleared four Phase 2 loose ends in parallel with U1 (no dependencies):

- **(a) Skipped U5 roster test**: audit found zero `.skip()` remaining in `tests/punctuation-*` — Phase 2's skip had already been cleared upstream. Documented in PR body.
- **(b) "First Release Scope" → "Current Release Scope"** in `docs/punctuation-production.md` (heading + one downstream verification-gate bullet).
- **(c) `CODEX_POWER_RANK` reserved tombstones**: chose comment-in-place (Option A) over relocate-to-separate-constant (Option B). Reasoning: `codexPowerRank()` has `|| 0` fallback; relocating reserved ids to a separate map would collapse the "reserved below directs" ordering for any caller that didn't know to consult both maps. Added a rationale block explaining why Option A is structurally safer.
- **(d) Telemetry thresholds**: rewrote the block in `docs/punctuation-production.md` as "aspirational — pipeline TBD" and added a concrete **Phase 4 follow-up candidates** section naming metric names that must match warning codes verbatim, per-code alert thresholds, query surface options, and consumer owner.

### U8 — AI context pack stripped from child learner read-model

Plan origin R34 deferred the decision between productising the AI context pack for learners or hiding it. Phase 3 made the call: **child surface never receives it**.

Two-layer fix:
1. **Worker** (`worker/src/subjects/punctuation/read-models.js`): `buildPunctuationReadModel` no longer attaches `contextPack` to the default child-scope payload. The `contextPack` argument stays on the function signature (doc-deprecated) for forward-compat with a future Parent/Admin caller; `safeContextPackSummary` is now exported for that future wiring.
2. **Client** (`src/subjects/punctuation/client-read-models.js`): new `stripForbiddenChildScopeFields(state)` belt-and-braces drops `contextPack` at `initState` time even if the Worker ever re-adds it.

`punctuation-context-pack` client action retained with a retention comment in `command-actions.js` — no JSX currently dispatches it (grep confirmed), but removing it would preempt future Parent/Admin wiring.

Security reviewer surfaced a nuance that shaped later phases: the _command response envelope_ (`response.body.contextPack`) still carries the pack for hypothetical Parent/Admin callers. Plan R9 scope is "learner **read model**" not "entire response body", and `safeContextPackSummary` output is already tightly allowlisted (bounded counts, status enum, atom-kind arrays — no raw prompts/providers/keys per Phase 2 guard). Scoped for a future authz gate when a Parent/Admin surface ships.

Testing reviewer caught one true MEDIUM: the original "ordinary payload normaliser" test fed an input without `contextPack` and asserted `'contextPack' in result === false` — which passed even if the strip were a no-op because `createInitialPunctuationState()` also lacks the key. Follower replaced with genuine pass-through assertions (`phase: 'setup'`, `error: ''`) plus a new shallow-strip contract test that passes a payload with nested `{summary:{contextPack:{...}}}` and documents the Worker's deep-scan handles nested cases while the client is top-level-only.

### U5 — The state-machine saga (4 adversarial rounds)

Added `'map'` phase to `PUNCTUATION_PHASES` (now 7 entries). New `normalisePunctuationMapUi` for filter / detail state. Seven new module handlers (`punctuation-open-map`, `punctuation-close-map`, `punctuation-map-status-filter`, `punctuation-map-monster-filter`, `punctuation-skill-detail-open/-close/-tab`). New 354-line `PunctuationMapScene.jsx` with hero, status + monster chip groups, 4 monster groups iterating `ACTIVE_PUNCTUATION_MONSTER_IDS` only (reserved trio never rendered), skill cards with name + status pill + rule one-liner + "Practise this" + "Open details". `PunctuationPracticeSurface.jsx` router delegates `'map'` phase.

U5 took **4 adversarial rounds** and is by far the most instructive unit in the series. Each round found a HIGH the previous round missed:

- **Round 1 HIGH adv-219-001**: `mapUi` + `phase: 'map'` persisted to localStorage via `mergeSubjectUi` → `persistAll('local-write')`. Plan R5 + line 805 explicitly say "session-ephemeral, no D1 persistence path, fresh page returns to `phase: 'setup'`". Reality contradicted the contract. Live-verified with two `createAppHarness` over one `installMemoryStorage()`: `phase: 'map'` and the full `mapUi` (filters + `detailOpenSkillId: 'speech'`) both survived the simulated reload. A learner who closed their tab yesterday would have landed on the Map today — and U6's modal would have auto-opened on `'speech'` before the tab was even focused.
- **Round 1 HIGH adv-219-002**: shallow-merge `updateSubjectUi('punctuation', { phase: 'map', … })` from `phase: 'active-item'` preserved `session` object → orphan. `punctuation-close-map` then set `phase: 'setup'` with the orphan session still dangling.
- **Round 1 MEDIUM × 3**: stale `feedback`/`summary` same pattern; `punctuation-skill-detail-open` accepted arbitrary `skillId` including 5000-char strings and `"__proto__"`; service-contract imported from components/view-model (layer inversion — contract depending on presentational module).

Round-1 follower response:
- New `sanitisePunctuationUiOnRehydrate` helper in `service-contract.js` + new `rehydrate` flag plumbed through `src/platform/core/store.js`'s `sanitiseState` so the hook fires on boot but not on live writes. Locks via two-harness reload test.
- `PUNCTUATION_OPEN_MAP_ALLOWED_PHASES = ['setup', 'summary']` — rejects from `active-item` / `feedback` / `unavailable` / `error`, prevents orphan session.
- `PUNCTUATION_CLIENT_SKILL_IDS` Set validates `detailOpenSkillId` at both handler and normaliser.
- Filter-id + detail-tab constants relocated to `service-contract.js`; view-model pure-re-exports them.

- **Round 2 HIGH adv-219-006**: the rehydrate flag fix only covered `createStore` + learner-switch paths. `reloadFromRepositories` (persistence-retry, learner-deletion, settings switches at `main.js` lines 953/979/1100/1134/2420/2482) also re-reads persisted UI but was calling `sanitiseState(..., { rehydrate: false })`. The bootstrap fix was incomplete; every production hot path that reloaded state while phase was `'map'` exposed the same bug.
- **Round 2 HIGH adv-219-007**: the 5 map-scoped handlers (`status-filter`, `monster-filter`, `skill-detail-open/-close/-tab`) had no `ui.phase === 'map'` guard. A dispatch from `active-item` silently planted `mapUi` + persisted it. Cross-impact with adv-219-006: rogue `mapUi` would survive `reloadFromRepositories` and auto-open U6's modal during active-item.

Round-2 follower response: extended the `rehydrate` flag through `reloadFromRepositories` → `stateFromRepositories` → `buildSubjectUiTree` → subject `sanitiseUiOnRehydrate`. Added 5 explicit phase guards. 6 new adv-232 tests.

- **Round 3 HIGH adv-219-008**: round-2 fix listed "5 Map-scoped handlers" but missed the 6th — `punctuation-close-map`. Same bug class: unconditional `{ phase: 'setup', error: '', mapUi: … }` write regardless of current phase. A stray dispatch from `active-item` would destroy the live session and seed a default `mapUi` into localStorage.

Round-3 follower response: 6th guard + full audit of all 9 action handlers documented in the commit message, confirming `punctuation-open-map` (allowlist), `punctuation-close-map` (new guard), `punctuation-back` (already gates on `ui.phase === 'map' && ui.mapUi` correctly), and the 5 filter/detail handlers (round-2 guards).

- **Round 4 adversarial final pass**: APPROVED. Confidence in state-machine closure HIGH. No new findings across 7 probe vectors including server-sync contamination (verified `reloadFromRepositories` reads local-only, never echoes phase via server projections), Grammar/Spelling regression (verified the new `sanitiseUiOnRehydrate` hook is per-subject opt-in; neither Grammar nor Spelling implements it, so the flag is a true no-op for them).

**Cost/benefit on U5**: 3 follower cycles, 4 reviewer rounds, probably 8–10× the subagent invocations of a normal unit. Absolute benefit: 5 HIGH defects caught before merge, one of which (adv-219-001 localStorage persistence) would have manifested as a visible UX regression (wrong phase on reload) detectable by anyone who opened the app, and one of which (adv-219-007 filter handlers from non-map phase) would have been latent until U6 wired the modal — at which point stale `detailOpenSkillId` would have auto-popped the modal during active-item sessions, a silent bug with no visible cue. The memory rule — "adversarial reviewers pay disproportionately well on state-machine / scheduler logic" — earned its keep 5× on this unit alone.

### U6 — Skill Detail Modal (security HIGH: content leak in 7 skills)

New `PunctuationSkillDetailModal.jsx`. Role=dialog, aria-modal, `aria-labelledby`, focus trap via `useEffect + closeButtonRef.focus()` on skillId change + `data-autofocus="true"` for platform parity. Two tabs (Learn / Practise) consuming U5's `punctuation-skill-detail-tab` state. "Practise this" dispatches `{ mode: 'guided', guidedSkillId, roundLength: '4' }` — NOT cluster mode. Verified against `shared/punctuation/service.js:1281-1283` that `guidedSkillId` is only honoured when `prefs.mode === 'guided'` — dispatching `{ mode: 'speech', skillId: 'speech' }` would silently drop the pin on multi-skill clusters.

Client-side `PUNCTUATION_SKILL_MODAL_CONTENT` (14 skills × 4 pedagogy fields — `rule`, `workedGood`, `workedBad`, `contrastGood`) added to the view-model because `shared/punctuation/*` cannot leak into the client bundle per `tests/bundle-audit.test.js`. Drift test imports `PUNCTUATION_SKILLS` from the shared file in test context and asserts byte-for-byte parity on every entry.

**Security reviewer surfaced a HIGH content leak**. Modal defaults to rendering `workedGood`. For 6 skills, `workedGood` was byte-identical to a `PUNCTUATION_ITEMS.accepted[0]` string for items tagged with that skill:

| Skill | Leak |
|---|---|
| `list_commas` | `workedGood` = `lc_combine_trip_list.accepted[0]` |
| `colon_list` | `workedGood` = `cl_transfer_we_needed.accepted[0]` |
| `semicolon` | `workedGood` = `sc_insert_rain_stopped.accepted[0]` + `sc_combine_rain_pitch.accepted[0]` |
| `dash_clause` | `workedGood` = `dc_insert_path_flooded.accepted[0]` + `dc_combine_path_route.accepted[0]` |
| `semicolon_list` | `workedGood` = `sl_insert_three_cities.accepted[0]` + `sl_transfer_cities.accepted[0]` |
| `bullet_points` | `workedGood` = `bp_transfer_trip.accepted[0]` + 2 others |

Plus adversarial flagged `hyphen.contrastGood` = `hy_insert_little_used.accepted[0]`.

**Attack surface shape**: learner taps skill → sees answer verbatim in Learn tab → taps "Practise this" → queues a Guided round of items tagged with that skill → scheduler serves the exact item whose `accepted[0]` they just read → learner transcribes back → marked correct. Learn tab had become a stealth answer key for 7 of 14 skills.

Plan's existing `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE` had a `comma_clarity` override (`contrastGood` is verbatim `cc_insert_time_travellers.accepted[0]`) but missed the other 7. The follower:
- Rewrote `workedGood` (or `contrastGood` for hyphen) in the client mirror. Client mirror independence from `shared/punctuation/content.js` is permissible — there's no user-visible contract that the two agree verbatim on `workedGood`/`contrastGood` strings.
- Relaxed the drift test: `rule` + `contrastBad` stay canonical (byte-for-byte); `workedGood` + `contrastGood` may diverge when the shared value verbatim-matches `accepted[]`.
- Added a **red-team disjoint test** that iterates every skill, builds per-skill `acceptedSet` from `PUNCTUATION_ITEMS` tagged with that skill, asserts all 3 rendered pedagogy fields are NOT in the set. Bonus: fixed `comma_clarity.contrastGood` (`"Most of the time, travellers worry about delays."`) too even though the override already protected the rendered path — belt-and-braces against a future refactor that drops the override.

**Design-lens found 2 HIGH a11y**: `role="dialog"` was on the scrim (full-screen backdrop), not the inner card — AT would announce the entire page as dialog content. Focus never moved into the modal on open — screen-reader users got no dialog announcement. Follower moved role/aria to inner `.punctuation-skill-modal` div and wired both `data-autofocus` + `useEffect + ref.focus()` (platform autofocus path only covers `.wb-modal-scrim`, not Punctuation's namespace).

**Design-lens MEDIUM**: adult-register rule copy. `semicolon.rule` = "A semi-colon can join two closely related **main clauses**." `fronted_adverbial.rule` = "Put a comma after a **fronted adverbial**." Year 3–4 learners do not know these terms. Follower rewrote the 4 offending rules for Modal display to child register ("A semicolon joins two short sentences that go together.", "Put a comma after the opening phrase that tells when, where, or how."). Intentionally did NOT edit `shared/punctuation/content.js` — that would require Worker regression discipline. Flagged as a Phase 4 content follow-up: the Worker's `guidedTeachBox` (served during Guided sessions started by "Practise this") still serves the adult-register rule, creating a two-surface inconsistency where Modal says "joins two short sentences" and the Session teach box says "main clauses". Full resolution requires a shared-content edit that Phase 3 deliberately scoped out.

### U3 — Session scene (adversarial caught 3 HIGH correctness missed)

New 410-line `PunctuationSessionScene.jsx` handling both `active-item` and `feedback` phases in one file. Per-item-type input via `punctuationSessionInputShape(item.mode)`:

- `insert` / `fix` / `paragraph` → textarea prefilled with `item.stem`
- `combine` / `transfer` → **empty** textarea, source sentences/instruction visible in a non-editable `<blockquote>` above (fixes plan-learning #9: the old monolith's `useState(item.stem || '')` used the source prompt as the answer buffer for these modes)
- `choose` → radio group

GPS delayed-feedback contract preserved: "Save answer" label, "Test mode: answers at the end." chip, no feedback rendered in active-item phase. Guided teach box collapses from a 3-box adult panel to a one-line rule + `<details>`-toggled worked example.

**Adversarial found 3 HIGH that correctness missed**:

- **adv-232-001**: `composeIsDisabled` reads `ui?.pendingCommand`, but **no code path wrote** `subjectUi.punctuation.pendingCommand`. The PR body + in-code comment both claimed "textarea disables during pending" — neither was true. Grammar has the canonical template; Punctuation shipped without the wiring. A learner typing while a submit was in flight would see their keystrokes accepted by the DOM, then vanish when the item rotated on server response. Follower: new `runPunctuationSessionCommand` wrapper around the 5 service mutators (start/submit/continue/skip/end) that sets `pendingCommand: <actionName>` before calling the service and try/finally-clears after. `store.subscribe` observes the intermediate snapshot synchronously, which the wiring-level test locks.

- **adv-232-002**: TextItem `key={item.id || item.prompt || 'text-item'}`. `item.id` falls back to empty string when upstream is non-string (see `worker/src/subjects/punctuation/read-models.js:37`). Two consecutive `combine` items with the same prompt (common for paragraph-repair) collapse to the same key → React reuses the TextItem instance → the `typed` state from item N carries into item N+1. Worse than the learning #9 bug that U3 was meant to fix: pre-fills the PREVIOUS answer (invisible wrong context) instead of the stem (visible, learner knows to edit).

- **adv-232-003**: ChoiceItem had **no `key` prop at all**. Same bug class, worse scope: every consecutive `choose` item inherited the previous radio selection silently. Submit button enabled because `choiceIndex !== ''` — learner could tap Submit without ever interacting with the radio group, score distorted silently. The old monolith had the same bug; U3 had the opportunity to fix both by adding `key` and fixed only TextItem while explicitly adding the key infrastructure.

Follower: both keys now use `${component}-${session.answeredCount || 0}`. `answeredCount` advances on submit AND skip, so every item transition forces remount regardless of item shape.

**Adversarial MEDIUM adv-232-004**: `FeedbackBranch` literal gate `session.mode === 'gps'`. If mode becomes falsy via `punctuationPrimaryModeFromPrefs` coercing a cluster value to `'smart'` on a stale state, the minimal GPS branch falls through and `displayCorrection` renders in `<details>` — violating the GPS "answers at the end" contract (learning #10). Follower switched the gate to `!help.showFeedback` (authoritative via the session-ui table).

**Design-lens HIGH**: `<blockquote>` source block for combine/transfer had no `aria-label` and no bridging copy between source and textarea. Keyboard / screen-reader users saw an unlabelled block then a textarea labelled "Your answer" with no connector. Follower added `aria-label="Source text — read only"` and a visible bridging `<p>Read the text above, then write your answer below.</p>`.

**Design-lens HIGH**: missing session-phase forbidden-terms sweep. Setup + Map + Modal had sweeps from U2 + U5 + U6; session phase did not. Added.

### U2 — Setup scene (prod-routing bypass + 2 rebase cycles)

New `PunctuationSetupScene.jsx` replacing the monolith's 10-button mode grid with Bellstorm hero + Today cards (Secure / Due / Wobbly / Monster progress) + 3 primary mode cards (Smart Review / Wobbly Spots / GPS Check) + 1 secondary "Open Punctuation Map" card + round-length toggle + Active Monsters strip. `PUNCTUATION_MODES` enum stays frozen at 10 entries; the 6 cluster-focus modes are intentionally demoted from primary affordances to scheduler-driven (R16).

**One-shot stale-prefs migration**: on first Setup render, if `prefs.mode` ∈ {6 cluster modes ∪ `'guided'`}, dispatch `punctuation-set-mode { value: 'smart' }` to migrate stored state. `useRef` + store-level `ui.prefsMigrated` latch both compose to prevent re-dispatch. Synchronous-during-render rather than `useEffect` because `renderToStaticMarkup` does not fire effects in SSR tests.

**Correctness reviewer found the most instructive HIGH of the series**:

> `src/main.js:2709` routes `punctuation-set-mode` through `handleRemotePunctuationAction` → `punctuationCommandActions.handle(...)`. Because `punctuation-set-mode` has an entry in `punctuationSubjectCommandActions` (`command: 'save-prefs'`), the handler sends a Worker command and returns true — **execution never falls through to** `handleSubjectAction` → `punctuationModule.handleAction`. The new module handler that sets `ui.prefs` mirror + `ui.prefsMigrated: true` is **only exercised by the test harness** (via `createAppController`, which skips the remote command layer). In production, after the migration dispatch fires, `ui.prefsMigrated` is never set — migration re-fires on every Setup remount.

Same shape as U4's monster-strip bug (below): green tests where the fixture fabricates the exact state shape that production never writes. Follower: latch `prefsMigrated` client-side via `actions.updateSubjectUi('punctuation', { prefsMigrated: true })` BEFORE the dispatch, so the latch lands regardless of downstream routing. Integration test wires the real `createSubjectCommandActionHandler` + mock Worker + asserts (a) exactly one save-prefs call on first mount, (b) `prefsMigrated: true` post-migration, (c) second mount fires zero additional Worker calls.

**Adversarial MEDIUM × 4**:
- `punctuation-set-round-length` had no phase guard (same family as U5 adv-219-007); normaliser `normalisePunctuationRoundLength` accepts `1|2|3|4|6|8|12|'all'` (storage sanitiser superset) while UI only offers `['4','8','12']`. Follower added `if (ui.phase !== 'setup') return false` + narrow `PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS` validation.
- `punctuation-set-mode` had no phase guard either. Follower added. Migration dispatch still works because Setup render implies `phase === 'setup'`.
- `ui.prefsMigrated` header comment said "session-memory only; not persisted" but was actually persisted via `subjectStates.writeUi` (not stripped by `sanitisePunctuationUiOnRehydrate`). Follower corrected the comment to match reality: "persists across reloads; one-shot per learner".
- Parent-Hub backup-restore cascade: if a restore rewrites `prefs.mode` back to a legacy cluster but `prefsMigrated: true` survives, migration never re-fires. Accepted risk — documented in PR body; rare flow; manual `punctuation-set-mode {value:'smart'}` dispatch reruns cleanly.

**Round-2 adversarial** found a 5th MEDIUM **adv-234-006**: Worker `save-prefs` failure (network / 5xx / offline) at the exact migration dispatch would leave `ui.prefsMigrated: true` in storage while the Worker never persisted `prefs.mode = 'smart'`. Stored `prefs.mode` remains `'endmarks'`, latch blocks re-try, learner stuck with Smart Review display but cluster session in reality. Round-3 follower added a `createPunctuationOnCommandError` factory in `command-actions.js` (wired into `main.js`) that clears `prefsMigrated` on `save-prefs` errors, rearming migration for the next render.

**Rebase × 2**: U2 hit the parallel-worker-clobbers-rebase hazard documented as a new learning (see `feedback_autonomous_sdlc_cycle.md`). First rebase landed cleanly after U3 + U6 merged. Round-3 follower then checked out `origin/feat/...` from the **pre-rebase parent** (`013b9be` not the rebased `5d11c86`), force-pushed a new commit (`eed410f` parent `013b9be`) and wiped the rebase. PR went CONFLICTING again. Recovery: second rebase preserving the adv-234-006 fix on top. Future parallel-worker-and-resolver dispatch must serialise OR instruct followers to pull `origin/<branch>` (not just fetch) + use regular push (not force-push) with "retry after rebase" on conflict.

### U7 — Map + Modal read-model redaction audit

Pure characterisation PR. Plan's expected default outcome was "zero new Worker read-model surface area" — verified. U5 + U6 both stayed client-side; grep confirmed no additions to `worker/src/subjects/punctuation/read-models.js` since Phase 2's U8.

New `tests/punctuation-map-redaction.test.js` sweeps every render combination for `FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS`:
- Map phase: 6 status × 5 monster = 30 combinations.
- Skill Detail Modal: 14 skills × 2 tabs = 28 combinations.
- Plus a dimensionality-lock assertion (`FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.length === 12`).

Testing reviewer MEDIUM: the initial sweep seeded no `ui.analytics.skillRows`, so 20 of the 30 Map combinations tagged every skill as `status: 'new'` and the `learning` / `due` / `weak` / `secure` filters rendered empty — only 10 combinations actually exercised SkillCard HTML. Follower seeded synthetic `analytics.skillRows` with one row per non-`new` status so all 30 combinations exercise cards. Also split the forbidden-key match: `CAMELCASE_KEYS` (`correctIndex`, `hiddenQueue`, `rawGenerator`, `queueItemIds`, `unpublished`) use substring match; `WORDBOUNDARY_KEYS` (`accepted`, `answers`, `generator`, `responses`, `rubric`, `seed`, `validator`) use `\b…\b` to avoid false positives on legitimate copy (e.g. the English word "generate"). Content-lock assertion pins the sorted keys against a canonical inline list so a rename trips the test.

### U4 — Summary scene (2 HIGH + the most interesting fixture-shape trap)

New `PunctuationSummaryScene.jsx`. Score chip row (Answered / Correct / Accuracy). Wobbly chips via `summary.focus` → `PUNCTUATION_CLIENT_SKILLS` name lookup → `"{skillName} needs another go"` — never raw skill IDs. Active monster strip iterating `ACTIVE_PUNCTUATION_MONSTER_IDS` only. GPS review cards preserved (Phase 2 contract) with `misconceptionTags` piped through `punctuationChildMisconceptionLabel` (null-mapped hidden, never raw dotted IDs). 4 next-action buttons (Practise wobbly / Open Map / Start again / Back to dashboard).

**Correctness + adversarial CONVERGENT HIGH**: `MonsterProgressStrip` read `ui.rewards?.monsters?.punctuation`. Grep across `src/subjects/punctuation/` + `src/platform/` + `worker/` found **zero writers** to that path. Production reward state lives in `repositories.gameState` (cached as `monster-codex`) and is surfaced by `PunctuationMapScene.jsx` as `ui.rewardState` (flat). Same by `resolveGrammarRewardState` in `GrammarPracticeSurface.jsx`. U4's summary monster strip would have always rendered "Stage 0 of 4" for every active monster in production — a silent UX regression where the summary's celebratory monster display contradicts the Map's correct progress for the same learner.

This is the second instance of the recurring "test harness fixture ≠ production shape" defect in Phase 3:

1. **U2**: `ui.prefsMigrated` latch written only by the module handler, but production routed through the Worker command that bypassed the module. Tests green; production never wrote the latch.
2. **U4**: `ui.rewards.monsters.punctuation` shape fabricated by the summary-scene test fixture, but no production writer populates it.

Both PRs shipped green CI with 100% of plan test scenarios covered. Both were caught only by reviewers who grepped for the `ui.<path>` producer, not for the test assertion. The rule captured in memory: **when wiring new client state, grep for a production writer; if the only writer is a test fixture, the code is dead in prod.**

Follower: changed `rewardStateForPunctuation(ui, propRewardState)` to prefer the threaded `rewardState` prop, fallback to `ui.rewardState` (MapScene pattern), never `ui.rewards.monsters.punctuation`. Added `resolvePunctuationRewardState(repositories, learnerId)` helper in `PunctuationPracticeSurface.jsx` that memoises `repositories.gameState.read(learnerId, 'monster-codex')` — same path as Grammar. Integration test seeds via `harness.repositories.gameState.write` with release-prefixed mastery keys and asserts stage > 0.

**Design-lens HIGH**: headline was `summary.label` default `"Punctuation session summary"` — clinical for KS2. Spelling's `summaryHeadline(summary)` branches on score to produce warm copy; Grammar hardcodes `"Nice work — round complete"`. Follower added `punctuationSummaryHeadline(summary)` to the view-model: `accuracy >= 80` → celebratory ("Great round!"), `accuracy >= 50` → encouraging ("Good try! Here's what you got."), `accuracy < 50` → gentle ("Keep going — every round helps."). Fallback to `summary.label` only when helper returns null (malformed input).

**Adversarial MEDIUM adv-238-002**: Grown-up view placeholder button dispatched `punctuation-open-adult-view` with no handler anywhere (grep-confirmed). Child taps → silent no-op. Plan allowed "no-op placeholder" but reviewer consensus: don't ship dead UX. Follower removed the button entirely; Parent Hub will add it when adult surface ships (documented).

**Adversarial MEDIUM adv-238-003**: Summary → "Open Punctuation Map" → Map top-bar "Back to dashboard" → **Setup** (not Summary). One-way door — learner loses completion screen. `punctuation-close-map` unconditionally set `phase: 'setup'`. Follower introduced `mapUi.returnTo` tracked via `normalisePunctuationMapUi` allowlist `['setup','summary']`; `punctuation-open-map` sets `returnTo` from source phase; `punctuation-close-map` reads it AND guards on `ui.summary` non-null (prevents stranding if summary payload was lost mid-detour). Round-trip test `summary → map → summary` locks the contract. `returnTo` not persisted across rehydrate (stripped alongside other `mapUi` fields).

**Correctness MEDIUM**: "Start again" test asserted `state.phase === 'active-item' || state.phase === 'summary'` — passed whether dispatch started a new session OR silently did nothing. Follower tightened to `phase === 'active-item'` AND `session.mode === <expected>` AND `session` truthy.

**Design-lens MEDIUM**: empty `summary.focus` (all correct) had no positive copy — wobbly chip row simply returned null. Follower added "Everything was secure this round!" chip. Also fixed `borderTopColor: '#2E8479'` → `#B8873F` (Bellstorm gold, matching canonical accent).

### U10 — Child-copy sweep + cluster parity + Phase 3 CSS block

Closing sweep. Three deliverables:

1. **New `tests/react-punctuation-child-copy.test.js`**: fixture-driven sweep across 5 child phases (setup / active-item / feedback / summary / map) + Skill Detail Modal (14 skills × 2 tabs = 28 states). For each rendered SSR HTML, iterate `PUNCTUATION_CHILD_FORBIDDEN_TERMS` (including 6 dotted-tag prefixes + `/\bWorker\b/i` regex + 25+ string entries). Zero hits across 42+ sweep points. Forbidden fixture imported from view-model (single source of truth, no duplication).

2. **Cluster behavioural parity (R16)**: parameterised matrix of all 6 cluster modes (`endmarks` / `apostrophe` / `speech` / `comma_flow` / `boundary` / `structure`) with paired state assertions: dispatch `punctuation-start { mode: <cluster>, skillId: <id> }` → assert `session.mode === <cluster>` AND `item.skillIds` contains the selected skill AND `ui.phase === 'active-item'`. Each mode has a test; renderer registry throws on typos (silent-skip guard).

3. **`styles/app.css` Phase 3 block** (479 lines): dedicated `/* Punctuation — Phase 3 */` section with `.punctuation-*` namespacing, mobile-first stacking at 760px breakpoint, `@media (prefers-reduced-motion: reduce)` scoped to `.punctuation-map-scene` / `.punctuation-session-scene` / `.punctuation-setup-scene` / `.punctuation-skill-modal-scrim`, Bellstorm gold (`#B8873F`) accent on `:focus-visible` + active mode card.

**Stale-comment cleanup**: maintainability reviewer on U1 had flagged a narrative comment in `punctuation-view-model.js` claiming "Grammar and Spelling each keep their own copy of `composeIsDisabled`". Grep confirmed neither subject had such an export — the comment was aspirational, not factual. Rewrote to accurate wording ("Grammar and Spelling do NOT carry an equivalent export today — their scenes inline the same pending/availability gate").

**Design-lens blocking × 2**: filter chips (`.punctuation-map-chips`) and round-length toggle (`.punctuation-length-toggle`) lacked `min-height: 44px` + padding → KS2 mobile tap-target fail. Same elements lacked `:focus-visible` → keyboard a11y gap. Follower added both, mirroring the `color-mix(in oklab, #B8873F 18%, transparent)` Bellstorm-accent focus ring pattern already present on mode cards (preferring the existing token over an inline rgba for CSS-variable parity).

**Design-lens minor**: reduced-motion guard listed `.punctuation-setup-scene` but the class wasn't referenced in the CSS block. Follower verified the class IS applied in `PunctuationSetupScene.jsx:280` — the guard is legitimate, just looked orphaned from the stylesheet alone. Kept.

**Testing reviewer LOW × 3**: fixture realism. Setup-phase child-copy sweep seeded no rewards/today data, so it exercised only the empty-state branch. Follower enriched `renderSetupPhase()` with seeded `stats` + `rewardState` (4 active monsters) so populated `todayCards` + `ActiveMonsterStrip` branches enter the sweep.

---

## Observations and insights

### Adversarial review dominated on state-machine units

Phase 2's SDLC loop ran a single `pr-review-toolkit:code-reviewer` subagent per PR. Phase 3 fanned out 3–4 specialised reviewers per feature PR (correctness + adversarial + maintainability + design-lens or security). The cost overhead was ~2–3× per review pass; the benefit was asymmetric:

| Finding type | Correctness found | Adversarial found | Maintainability found | Design-lens found |
|---|---|---|---|---|
| U5 state-machine HIGH | 0 | 5 across 3 rounds | 1 (the CLUSTER_TO_MONSTER drift test) | 2 (MEDIUM back-button + live count) |
| U6 content leak HIGH | 0 | 1 | 0 | 2 (MEDIUM + HIGH a11y) |
| U3 key-collision + pendingCommand HIGH | 0 (2 LOW) | 3 | 0 | 2 (HIGH blockquote a11y + forbidden-terms sweep gap) |
| U4 dead-path reward state HIGH | 1 (converged) | 1 (converged) | 0 | 1 HIGH (headline tone) |
| U2 prod-routing bypass HIGH | 1 | 0 | 0 | 1 HIGH R15 (over-flagged; re-verified clean) |

Two structural takeaways:

1. **Adversarial earns its keep on state-machine / scheduler logic**. 9 of the 12 HIGH findings in Phase 3 came from adversarial review. Correctness review was better at catching production-path bypasses (U2) and dead-path reads (U4 convergent). Maintainability caught drift-test gaps (CLUSTER_TO_MONSTER) that neither of the other two would have. Design-lens caught a11y gaps nobody else was looking at. The four-lens fan-out is the right default for state-machine-heavy PRs.

2. **4-round convergence is real on deeply recursive state machines**. U5 needed round 3 to catch the 6th handler (close-map) that the 5-handler fix in round 2 missed. Round 4 confirmed no new defects. Budgeting 4 adversarial rounds up-front on state-machine units would have saved latency — dispatching the round-2 reviewer while the round-1 follower is still pushing catches follower-introduced regressions faster.

### The recurring fixture-shape defect

U2 and U4 shipped green CI with tests asserting state shapes that production never wrote. The pattern:

```
Test fixture: harness.store.updateSubjectUi('punctuation', { prefsMigrated: true, ... })
Production:   actions.dispatch('punctuation-set-mode', …) → Worker command → ...
              (module handler's prefsMigrated write is never reached)
```

```
Test fixture: updateSubjectUi('punctuation', { rewards: { monsters: { punctuation: { pealark: {...} } } } })
Production:  repositories.gameState.read(learnerId, 'monster-codex') → 
             PunctuationPracticeSurface passes via rewardState prop
             (ui.rewards.monsters.punctuation path has zero writers)
```

Both are true positives from a plan-test-scenario standpoint and both are silent production failures. The rule is simple to state, harder to enforce: **when wiring new client state, grep for a production writer to the exact path before trusting the test.** If the only hit is in test helper code, the feature is dead on live. This is probably worth a future `ce-*` reviewer variant — "`ce-fixture-realism-reviewer`" — that specifically looks for dispatch-layer / repo-layer writers to each new `ui.<path>` read by the scene under review.

### Content leak is a security-surface reviewer's win

U6's HIGH — 7 of 14 skills rendering verbatim `accepted[]` strings in the Learn tab immediately before queuing the same item via "Practise this" — was only caught by `ce-security-reviewer` with the explicit adversarial instruction to probe the redaction surface. The first security reviewer dispatch on U8 (the context-pack strip) had established a house style for that reviewer class: enumerate every key in the client mirror, cross-reference against the server authoritative source, look for verbatim matches, flag any leak as HIGH.

The byte-for-byte match was already flagged ONCE in the plan (for `comma_clarity`) with a `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE` override. The other 6 skills had both `workedGood` AND `contrastGood` verbatim-matching accept strings. Plan's audit was incomplete but pointed at the right question; the reviewer ran the full audit against `shared/punctuation/content.js`'s `PUNCTUATION_ITEMS.accepted[*]` and surfaced 7 leaks. Without this reviewer, the Modal would have shipped as a stealth answer key for half the skills.

Downstream defence: the follower's **red-team disjoint test** (iterate every skill × every rendered pedagogy field × every item's accept set; assert no verbatim match) is now a structural guard. Future content edits to the client mirror OR the Worker content manifest that introduce a leak will trip the test. The discipline generalises — any time a client mirror shares strings with a server authoritative source that contains accept-lists, add a red-team disjoint test.

### Plan deepening remains non-optional

The plan went through deepening against service code before execution started. The deepening caught one material correction to the origin doc: origin `punctuation-p3.md` implied skill focus would dispatch cluster mode with `skillId`. Plan verified against `shared/punctuation/service.js:1281` and found that `guidedSkillId` is only honoured when `prefs.mode === 'guided'` — dispatching `{ mode: 'speech', skillId: 'apostrophe_contractions' }` would silently drop the pin on multi-skill clusters and scheduler would pick a sibling skill from the cluster. The plan's U6 section rewrote the "Practise this" dispatch from cluster mode to Guided mode + `guidedSkillId` before implementation began.

Without the deepening pass, U6 would have shipped the wrong dispatch shape. A learner tapping "Practise this" on `apostrophe_contractions` would have opened a Guided round that could serve `apostrophe_possession` instead (same cluster, different skill). The test scenario in U6 explicitly locks this (paired state assertion that `session.guidedSkillId === <tapped skill>`, not just any cluster member) — this assertion fails under the old origin dispatch shape.

### Rebase-clobber hazard

Phase 3 hit the parallel-follower-clobbers-rebase failure mode on U2. Sequence:

1. Main advances with U3 + U6 merges. U2 is CONFLICTING.
2. Merge-resolver subagent rebases U2 on latest main; force-pushes `5d11c86`.
3. Round-3 follower subagent is dispatched to fix adv-234-006 (Worker save-prefs error rearm). Follower checks out `origin/feat/punctuation-phase3-u2-setup-scene` — which is `5d11c86` at that moment.
4. **But the follower's worktree, started fresh, caches the pre-rebase `013b9be` as its base for some tool state.** Follower commits a new commit (`eed410f`) with parent `013b9be` (pre-rebase) instead of `5d11c86` (rebased). Force-push with lease succeeds because the follower has the full branch ref.
5. PR is CONFLICTING again; the rebase work is wiped.

Recovery: second rebase preserving `eed410f`'s `createPunctuationOnCommandError` factory + `main.js` wiring + new test, re-applied on top of latest main. Netted three rebases for U2 total (first, round-3-follower-clobber, second).

**Rule added to memory**: when dispatching a follower onto a recently-rebased branch, either serialise (do not dispatch follower until resolver finishes) OR instruct the follower to pull `origin/<branch>` (not just `git fetch`) before starting work AND use regular push (not force-push) with explicit "retry after rebase on conflict" fallback. Parallel-workflow cost dropped sharply when this discipline landed for U4's single rebase.

### The Phase 2 cleanup items actually cleaned up

Phase 2's completion report listed five "will probably need attention in Phase 3" items. Phase 3 closed four of five as U9 + U8:

1. **AI context-pack learner surface** — stripped (U8). `request-context-pack` Worker command still works; `punctuation-context-pack` client action retained as stub; no child UI dispatches it.
2. **Skipped U5 roster test** — audit found it had already been cleared upstream; U9 documented the resolution.
3. **"First Release Scope" doc framing** — renamed to "Current Release Scope" (U9).
4. **Telemetry thresholds without a dashboard** — documented as "aspirational" with a concrete Phase 4 follow-up candidates section naming metric names, thresholds, query surface options (U9).
5. **`CODEX_POWER_RANK` reserved tombstones** — comment-in-place (U9 Option A).

Phase 3's own follow-ups (below) are similarly named and concrete so Phase 4 inherits a clean "will probably need attention" list.

### Scope discipline held

Plan's "Scope Boundaries" enumerated four non-goals:
- Parent / Admin context-pack surface — **deferred** (U8 kept the action stub for future wiring).
- Live telemetry dashboard — **deferred** (U9 documented aspirational marker).
- Broadening the 14-skill set — **untouched** (`PUNCTUATION_ITEMS` manifest unchanged).
- Playwright smoke — **untouched** (node:test + SSR harness preserved per convention).

Nothing slipped. Phase 3 stayed client-UX-only with exactly one Worker-side touch (U8's one-line `contextPack` strip). `shared/punctuation/*` untouched; `contentReleaseId` unchanged; Oracle replay byte-for-byte preserved.

### What will probably need attention in Phase 4

1. **Worker-side `guidedTeachBox` adult-register rule**. U6 Modal renders child-register rules (`semicolon`, `colon_list`, `dash_clause`, `fronted_adverbial`) in the client mirror, but `shared/punctuation/content.js`'s `rule` field still serves adult-register ("main clauses", "fronted adverbial", "complete opening clause") to the Worker's `guidedTeachBox`. A learner tapping "Practise this" from the Modal sees child register → opens Guided session → sees adult register 2 seconds later in the session's teach box. Resolving requires either (a) editing the shared content manifest (risks Oracle replay break — needs verification) or (b) projecting a `ruleChildRegister` field through the read model. Tracked as Phase 4 content-pass candidate.

2. **Back-to-dashboard escape-hatch under `pendingCommand`**. Summary scene's "Back to dashboard" button disables when `composeIsDisabled(ui)` is true — which includes `pendingCommand`. If the Worker stalls, the only escape path is blocked. Pattern likely exists on other scenes too. Needs a cross-unit policy review: is "Back" a mutation control (currently treated as such) or a navigational affordance (should always be enabled)? LOW-severity but the design-lens reviewer flagged it on both U4 and U5.

3. **Per-skill `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE` audit for the 8 leaky skills**. U6 rewrote the client mirror to defang the Learn-tab leak. The shared content manifest (`shared/punctuation/content.js`) still has the original leaky strings. Worker's `guidedTeachBox` sends them to the learner during a Guided session (adult-register problem above AND content-leak problem stacked). A full audit + manifest edit is needed if Phase 4 wants to close both surface issues in one pass.

4. **Fixture-realism reviewer** (process improvement, not code). U2 + U4 both shipped green tests where the fixture fabricated a state shape production never writes. A dedicated reviewer class that specifically probes for producer/consumer mismatch on new `ui.<path>` reads would have caught both. Candidate for a new `ce-fixture-realism-reviewer` subagent type.

5. **React concurrent-mode audit on Setup migration dispatch**. U2's migration dispatch fires synchronously during render. Works today (vanilla client render, no StrictMode wrapper). If the codebase ever adopts React 18 concurrent mode or strict-mode double-invoke, the dispatch may fire twice before the `useRef` gate lands. Not breaking today; flagged for awareness.

### What I'd do differently

1. **Serialise follower + resolver for rebased branches.** The U2 rebase-clobber cost ~40 minutes of orchestrator time (extra rebase + re-review). Costless to serialise when the alternative is recovery.

2. **Dispatch round-2 adversarial in parallel with round-1 follower on state-machine units.** U5 took 3 sequential follower cycles (round 1 → follower → round 2 → follower → round 3 → follower → round 4 approve). Round-2 reviewer could have run against the round-1 follower's push while the orchestrator was waiting for the tests to clear — wall-clock saving of ~10 minutes per cycle.

3. **Add a red-team disjoint test template to the plan.** U6's content-leak HIGH was predicted by plan § "Key Technical Decisions / Skill Detail Modal pedagogy content excludes items that verbatim-match acceptance fixtures" for `comma_clarity` specifically — but the plan listed the principle only for one skill. A plan-level "when shipping any client mirror of server-authoritative pedagogy strings, add a red-team disjoint test" would have caught all 7 leaks at plan-review time instead of at security-review time.

4. **Dispatch the fixture-realism probe earlier.** Both U2 (prefsMigrated in test harness only) and U4 (`ui.rewards.monsters.punctuation` dead path) have the same shape. A template-driven "grep for the producer of each `ui.<path>` read" in the round-1 correctness reviewer prompt would have caught both on first pass.

5. **Track follow-ups with structural IDs, not prose.** Phase 3's follow-ups (above) are named but not ID-stamped. When they land in Phase 4's plan, it would be easier to reference them as `P3-F1`, `P3-F2`, etc. with stable anchors. Low-cost convention change.

---

## Files touched (final tally)

**Production code**

Client:
- `src/subjects/punctuation/components/punctuation-view-model.js` — substantial expansion (U1), U5 additions (filter ids, cluster-to-monster mirror, `punctuationSkillRuleOneLiner`), U6 additions (`PUNCTUATION_SKILL_MODAL_CONTENT`, `PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE`, `punctuationSkillHasMultiSkillItems`), U4 addition (`punctuationSummaryHeadline`), U10 stale-comment cleanup.
- `src/subjects/punctuation/session-ui.js` — new (U1).
- `src/subjects/punctuation/service-contract.js` — `'map'` phase + `normalisePunctuationMapUi` + `sanitisePunctuationUiOnRehydrate` + `PUNCTUATION_OPEN_MAP_ALLOWED_PHASES` + `PUNCTUATION_CLIENT_SKILL_IDS` + filter/tab constants (U5 + U2 + U4).
- `src/subjects/punctuation/module.js` — 7 new map handlers + phase guards + `runPunctuationSessionCommand` wrapper + set-mode/set-round-length narrow validation (U5 + U3 + U2).
- `src/subjects/punctuation/command-actions.js` — `createPunctuationOnCommandError` factory (U2), retention comment on `punctuation-context-pack` (U8).
- `src/subjects/punctuation/client-read-models.js` — `stripForbiddenChildScopeFields` (U8).
- `src/subjects/punctuation/read-model.js` — `PUNCTUATION_CLIENT_SKILLS` promoted to named export (U5).
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx` — router delegations for setup / session / feedback / map / summary phases + `resolvePunctuationRewardState` plumbing (U1 through U4).
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx` — new (U2).
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx` — new (U3).
- `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` — new (U4).
- `src/subjects/punctuation/components/PunctuationMapScene.jsx` — new (U5).
- `src/subjects/punctuation/components/PunctuationSkillDetailModal.jsx` — new (U6).

Platform:
- `src/platform/core/store.js` — `rehydrate` flag threaded through `sanitiseState` / `stateFromRepositories` / `buildSubjectUiTree` (U5 round 2).
- `src/platform/app/create-app-controller.js` — exposed `handleSubjectAction` for direct-dispatch testing (U5 round 2).
- `src/main.js` — wired `createPunctuationOnCommandError` into `punctuationCommandActions`; exposed `actions.updateSubjectUi` in `buildSurfaceActions` for the U2 client-side latch (U2).
- `src/surfaces/home/data.js` — `CODEX_POWER_RANK` reserved-tombstone comment block (U9).

Worker:
- `worker/src/subjects/punctuation/read-models.js` — `contextPack` stripped from default child-scope payload; `safeContextPackSummary` exported (U8, one-line change).

Styles:
- `styles/app.css` — new `/* Punctuation — Phase 3 */` block (~479 lines, U10) with mobile-first stacking, reduced-motion guard, Bellstorm accent focus-visible, 44×44 tap targets on chips + round-length toggle (U10 follower).

Tests:
- `tests/punctuation-view-model.test.js` — new (U1); expanded in U5, U6, U10.
- `tests/punctuation-session-ui.test.js` — new (U1).
- `tests/punctuation-map-phase.test.js` — new (U5); expanded through follower rounds with rehydrate + guard + skill-id validation + returnTo tests.
- `tests/react-punctuation-scene.test.js` — expanded substantially across U2, U3, U4, U5, U6 with paired state-level assertions and integration tests through real command-action handlers.
- `tests/punctuation-read-models.test.js` — updated for `contextPack`-absent child-scope assertion + shallow-strip contract (U8).
- `tests/punctuation-ai-context-pack.test.js` — updated; compiler still exercised, no child-scope attachment (U8).
- `tests/worker-punctuation-runtime.test.js` — 3 `subjectReadModel.contextPack` assertions flipped to key-absent (U8).
- `tests/punctuation-map-redaction.test.js` — new (U7); enriched fixture + word-boundary/substring split + content-lock (U7 follower).
- `tests/react-punctuation-child-copy.test.js` — new (U10); 5-phase + 28-modal-state sweep + enriched setup fixture (U10 follower).

Docs:
- `docs/plans/2026-04-25-005-feat-punctuation-phase3-ux-rebuild-plan.md` — plan itself; `status: completed` via PR #245.
- `docs/punctuation-production.md` — "First Release Scope" → "Current Release Scope", telemetry aspirational block, Phase 4 follow-up candidates section (U9).
- `docs/plans/james/punctuation/punctuation-p3-completion-report.md` — this file.

---

## Conclusion

Phase 3 turned Punctuation from a power-user debug surface into a KS2-native learner experience with the scene-split shape Spelling established, the Map-browse affordance Spelling's Word Bank proved, per-item-type input that fixes the learning-#9 prefill bug, strict child-copy discipline via the frozen forbidden-terms fixture, and defence-in-depth redaction at the Worker read model, the client normaliser, the view-model allowlist, AND a red-team disjoint test that locks out content leaks from the Modal.

The autonomous SDLC loop — per-unit PR, multi-reviewer fan-out with adversarial on state-machine units, follower-on-blocker with round-2 re-review — earned its keep on every feature unit. 7 HIGH defects caught pre-merge. Two of them (U2's prod-routing bypass, U4's monster-strip dead path) are instances of the recurring "test harness fixture ≠ production shape" defect worth codifying as a dedicated reviewer class. One of them (U6's 7-skill content leak) is a full-surface audit that no non-specialised reviewer would have run.

Plan scope discipline held across 10 units. Oracle replay stayed byte-for-byte. `contentReleaseId` unchanged. No Spelling regression. No `shared/punctuation/*` leak into the client bundle.

Ready for Phase 4 when either the shared-content adult-register rule edit, the cross-unit `composeIsDisabled` policy review, or a new content expansion becomes the priority.
