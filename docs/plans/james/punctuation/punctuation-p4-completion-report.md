---
title: "Punctuation Phase 4 — Completion Report"
type: report
status: completed
date: 2026-04-26
origin: docs/plans/james/punctuation/punctuation-p4.md
plan: docs/plans/2026-04-26-001-feat-punctuation-phase4-visible-child-journey-plan.md
---

# Punctuation Phase 4 — Completion Report

## Executive summary

Phase 4 shipped in a single day (2026-04-26) as **9 merged pull requests** executed via a fully autonomous scrum-master orchestration. The phase closed the visible-child-journey gap Phase 3 left open: a child who opens the app now reaches a real Punctuation question within two taps, sees status that is honest about its own limits, receives child-register feedback, can escape any stalled state, and leaves a machine-readable trail of what they actually did.

- **Units landed**: 9 of 9 (U1, U2, U3, U4, U5, U6, U7, U8, U9).
- **Final merge commits on `main`**: `e0841994` → `bc59c9f` → `856c313` → `9cd8114` → `87f1cc2` → `165b15c` → `201d010` → `986ec0a` → `1e2ae10`.
- **Oracle replay (`tests/punctuation-legacy-parity.test.js`)**: **11/11 green across every single merge**.
- **`contentReleaseId` bumps**: **zero**.
- **Engine files touched** (`shared/punctuation/marking.js`, `generators.js`, `scheduler.js`): **zero**.
- **Real bugs caught by adversarial review and fixed before merge**: **3** (reserved-monster `entry.subjectId` bypass in U2, error-banner cascade in U4, missing `PunctuationSkillDetailModal` threading in U7).
- **Test-harness-vs-production divergences caught**: **4** (U1 prop-threading, U5 scaffold-without-producer, U7 pre-clean fixtures, U8 auth-wipe-masked-as-daemon-wedge).
- **Plan self-contradictions reconciled at review time**: **2** (U3 `'empty'` default, U6 R7-vs-Approach).

Phase 4 was **not a content phase** and **not a refactor phase**. It was a visible-product-quality phase with one measurable goal, now met: a child can complete a Punctuation round and see monster progress move, with no adult-register text on the learner surfaces and no silent-failure UX traps.

---

## Problem frame — what Phase 3 left behind

Phase 3 shipped the scene split (Setup → Session → Feedback → Summary → Map, 10 PRs) and its completion report declared Requirements R1–R18 as delivered. A direction doc by James (`docs/plans/james/punctuation/punctuation-p4.md`) identified seven concrete failure modes the split had preserved or introduced:

1. **Setup card dispatch regression** — primary cards dispatched `punctuation-set-mode` (a preference save) instead of `punctuation-start`. The child tapped "Smart Review" and nothing happened; only `aria-pressed` flipped.
2. **Home hero hardcoded to Spelling** — "Today's words are waiting" + `openSubject('spelling')` above the fold, regardless of where due work actually was.
3. **Map silent-new fallback** — missing analytics snapshot rendered as `'new'` (fresh learner), so a degraded-analytics failure was indistinguishable from a brand-new learner.
4. **Summary Back-button gated by `composeIsDisabled`** — any stalled Worker command also disabled the only escape hatch.
5. **Worker-side adult-register content** — teach-box atoms carrying `fronted adverbial`, `main clause`, `complete clause`, `subordinate` — reviewed OK by engine oracle but not by a child.
6. **SSR harness blind spot** — scene tests dispatched commands directly via `actions.dispatch(...)`; the `onClick` wiring itself was never exercised.
7. **Telemetry promise vs reality** — documented warning codes + thresholds, zero downstream ingest.

Phase 4 mapped these to nine implementation units. What follows is what each landed and what it cost.

---

## Unit-by-unit ledger

Each unit was executed by an independent worker subagent in an isolated git worktree, reviewed by 4–7 specialised reviewer subagents in parallel, and then landed by a review-follower subagent that addressed the convergent findings. The scrum-master (main agent) handled dispatch, decision-synthesis, and merge coordination only — it never touched code itself. This preserved context-window budget across 9 units.

### U1 — Primary-card dispatch fix (PR #261 → `e0841994`)

**What shipped**: five-line change at `PunctuationSetupScene.jsx` `PrimaryModeCard` — `data-action="punctuation-start"` and `onClick` dispatches `punctuation-start` with `{mode: card.id, roundLength: selectedRoundLength(prefs)}`. `aria-pressed` removed (primary cards are action buttons, not radios). Seven click-through tests exercising the **real** `onClick` closure landed alongside. Plan file itself bundled so downstream units branch off `main` with the plan present.

**Adversarial catch**: Reviewers flagged that the 7 click-through tests all mount `PrimaryModeCard` in isolation. A future regression that drops the parent's `roundLength={selectedLengthValue}` prop-threading would pass every test. Review-follower added SSR-observable `data-round-length` attribute on the rendered button and three full-tree tests that assert the parent correctly threads each round-length preference.

**Why it matters**: This was the single largest blast-radius bug in the whole surface. Without U1, every other unit would have shipped onto a broken entry point.

### U2 — Home CTA routed to today's best round (PR #273 → `bc59c9f`)

**What shipped**: `selectTodaysBestRound(dashboardStats, {tiebreakSubjectId})` pure helper in `src/surfaces/home/data.js`. Ranks subjects by `due` scalar descending with Spelling tiebreak. Hero CTA becomes `Start <Subject>` when a recommendation exists; fresh-learner fallback preserves pre-U2 literals ("Today's words are waiting", "Begin today's round", `openSubject('spelling')`) verbatim so no regression for first-time users. A new `tests/helpers/home-surface-render.js` SSR helper mirrors the punctuation-scene pattern.

**Adversarial catch**: Testing reviewer flagged that `pickSubjectCompanion` had two match paths — roster membership (safe) and `entry.subjectId` annotation (trusted). A stale-state entry `{monster.id: 'colisk', subjectId: 'punctuation', caught: true}` would render the reserved `colisk` monster as the Punctuation hero companion — a direct R6 violation ("reserved monsters never learner-facing"). The test was added, the bug was confirmed real, and the fix reordered the match logic so `MONSTERS_BY_SUBJECT[subjectId]` membership is the hard gate before any annotation is trusted.

**Deferred**: Empty-state ambiguity — fresh-learner fallback fires for *both* a brand-new learner AND a learner who has completed everything today. Distinguishing those requires a `completedToday` signal upstream in every subject module; acknowledged in the PR comment as deferred.

### U3 — Map status honesty (PR #269 → `856c313`)

**What shipped**: `deriveAnalyticsAvailability(analytics)` returning `true | false | 'empty'`, attached to the client read-model as `analytics.available`. Map's `assembleSkillRows` (relocated into `punctuation-view-model.js` so tests import it without a custom `.jsx` loader) distinguishes `'new'` (fresh learner) from `'unknown'` (analytics unavailable). Unknown rows show a dashed "Check back later" chip and helper copy "We're still loading your progress."

**Adversarial + design-lens caught a shipping BLOCKER in the original PR**: `deriveAnalyticsAvailability(null)` returned `false`, meaning every production cold-boot rendered 14 "Unknown" chips — a wall-of-error worse than the silent-`'new'` fallback it replaced. Plus the filter-ID list (`PUNCTUATION_MAP_STATUS_FILTER_IDS`) stayed at 6; in the degraded state any non-"All" filter chip emptied the Map with no empty-state message. Review-follower flipped the null-branch default to `'empty'` (reserving `false` for an explicit upstream degraded signal) and extended the filter list to 7 entries. The label softened from the initially-clinical "Unknown" to "Check back later".

**Meta-lesson**: Convergence voting worked. Three reviewers (adversarial + design-lens + testing) traced the same cascade independently. Individual reviewers (correctness, project-standards, maintainability) all said SHIP because each only saw local correctness. The BLOCKER required cross-layer reasoning — exactly what parallel adversarial review is for.

### U4 — Client telemetry emitter (PR #280 → `9cd8114`)

**What shipped**: `emitPunctuationEvent(kind, payload, context)` in `src/subjects/punctuation/telemetry.js`. Frozen 12-kind whitelist with per-kind payload allowlist. `answer-submitted` strictly excludes `answerText`, `promptText`, `typed`. Dispatch uses `{mutates: false}` flag so the emit bypasses `runPunctuationSessionCommand`'s pending-UI wrapping (mirrors the `punctuation-context-pack` precedent) — authz is preserved because `runSubjectCommand → requireLearnerWriteAccess` still fires at the Worker boundary. Smoke integration: `PunctuationSetupScene` mount emits `card-opened` via a `useRef`-gated render-time call.

**Adversarial + correctness independently traced the SAME BLOCKER**: Pre-U9, the Worker command `record-event` doesn't exist, so every `emitPunctuationEvent` triggers a `subject_command_not_found` rejection. The default `createPunctuationOnCommandError` calls `setSubjectError(...)`, which writes `subjectUi.punctuation.error`, which `SubjectRoute.jsx:192` renders as a visible red alert banner reading "Subject message: Punctuation command is not available." **Every Setup mount would paint a broken-app warning to the child.** The worker's PR comment claimed "never propagates to the learner" — demonstrably false via the shared `setSubjectError` path.

Review-follower added a `record-event` early-return branch in `createPunctuationOnCommandError` (analogous to the existing `save-prefs` special case), tightened tests to catch the regression guard, added `dispatch-throws` swallow tests and 256-char cap tests, and exported `PAYLOAD_ALLOWLIST` as a frozen object with a `Object.isFrozen` test. The invisible-error-to-learner invariant is now genuinely preserved.

### U5 — Summary card UX + reward parity proof (PR #288 → `87f1cc2`)

**What shipped**: `PunctuationSummaryScene` result card rebuilt with visible-child feedback — correct count, per-skill chips, next-review hint, monster-progress teaser. Plus a 5-surface reward parity proof (Home `SubjectCard.progress` scalar, Codex monster-summary projection, Setup/Summary/Map direct read) all derived from a single seeded `monster-codex` state via `getDashboardStats`. Three telemetry emits wired: `summary-reached`, `feedback-rendered`, `monster-progress-changed`.

**Adversarial + correctness + testing + design-lens convergent FIX**: The original PR shipped `skillsExercised` and `monsterProgress` fields on the normalised summary payload, then rendered them, then emitted telemetry — but `shared/punctuation/service.js` `sessionSummary()` **never wrote either field**. Three of the four marquee features were unreachable in production; tests passed because fixtures seeded the fields directly via `extraSummary`. Classic test-harness-vs-production divergence. Also: the 5-surface parity test hand-fed `{pct: 7}` to `buildSubjectCards` and asserted `progress === 7/100` — a tautology. Plus `WobblyChipRow` and `SkillsExercisedRow` both rendered `focus` skills, producing duplicate "needs practice" + "needs another go" chips side-by-side.

Review-follower wired the producer: `skillsExercised` from `session.recentItemIds` via `indexes.itemById.skillIds` (dedupe-preserving-order); `monsterProgress` as per-active-monster stage delta via `indexes.rewardUnitByKey` + `indexes.clusterById`, with a local copy of `punctuationStageFor` to avoid a cross-boundary import into the Worker bundle. `WobblyChipRow` gated on empty `skillsExercised` (authoritative display when populated). Home `pct` now genuinely derived via `punctuationModule.getDashboardStats(seededState)`. Separate telemetry refs per event kind with a signature-based gate on `monster-progress-changed` so a genuine later transition (stage advance arriving post-mount) still fires. `extractMonsterProgress` relocated to the view-model and the frozen `ACTIVE_PUNCTUATION_MONSTER_ID_SET` exported.

### U6 — Navigation / mutation separation (PR #278 → `165b15c`)

**What shipped**: `composeIsNavigationDisabled(ui)` sibling helper in `punctuation-view-model.js`. Back affordances on Summary (`NextActionRow`), Map top-bar, and Skill Detail Modal route through the navigation helper, so Back stays enabled during `pendingCommand`, `degraded`, or `unavailable` states. Mutation controls (Practise wobbly spots, Open Map, Start again, filter chips) continue to use `composeIsDisabled`. Mid-flight SH2-U1 `useSubmitLock` landed on `main` during the cycle — merge resolution cleanly unioned both invariants (`isDisabled = composeIsDisabled(ui) || submitLock.locked`; `isNavigationDisabled = composeIsNavigationDisabled(ui)`).

**Plan self-contradiction reconciled at review**: R7 (line 74) said navigation stays enabled in `pendingCommand / degraded / unavailable`. §U6 Approach (line 624) + Test scenarios (lines 636-637) + Key Technical Decision (line 197) said `composeIsNavigationDisabled` returns `true` when `availability === 'unavailable'` OR `runtime === 'readonly'` — the opposite invariant. Worker chose R7 (child-safety: the child is never trapped). Review-follower then patched the plan text to match shipped code so downstream units could not regress.

**Design-lens also caught R7's own missing scope** — "the navigation guard applies to every scene's Back affordance — Map back button, Skill Detail close, Feedback back". `PunctuationFeedbackScene` does not exist (feedback renders inside `PunctuationSessionScene`); the follow-on added a regression guard test asserting the feedback-phase region contains no Back affordance, so a future unit adding one without the nav helper fails a test. `aria-disabled={navigationDisabled ? 'true' : 'false'}` was also added alongside the HTML `disabled` attribute, giving assistive-tech parity.

### U7 — Child-register override + content sweep (PR #293 → `201d010`)

**What shipped**: 15-entry ordered override table `PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES` (longest-match first) with `punctuationChildRegisterOverride(atom)` + `punctuationChildRegisterOverrideString(str)`. Override threaded at every learner-facing display site: Session (`CollapsedTeachBox`, active-item prompt, feedback atom), Summary (GPS review prompt, `displayCorrection`). Edit-safe `rule` string updates in `shared/punctuation/content.js` (4 lines — NOT engine-bound). `PUNCTUATION_CLIENT_SKILLS[5].name` renamed "Commas after fronted adverbials" → "Commas after starter phrases". Four new terms added to `PUNCTUATION_CHILD_FORBIDDEN_TERMS`. Summary copy register pass landed the U5 deferrals: `NextReviewHint`, `MonsterProgressTeaser` sub-line, chip badge strings all routed through new child-register helpers.

**Design-lens caught both a PEDAGOGICAL DEFECT and a MISSING FILE**:

- **Pedagogy**: initial mapping `main clause` → `whole sentence` was mis-teaching. "A semi-colon can join two closely related whole sentences" reinforces the exact mistake the rule teaches children to avoid (comma-splicing, full-stop confusion) — "whole sentence" in a 7-9-year-old's vocabulary means "a complete standalone sentence ending in a full stop". Review-follower remapped to `idea` / `closely related idea` / `whole idea` (for `complete clause`) — preserves the standalone nuance without re-invoking the word children confuse with full-stops.
- **Missing file**: plan explicitly listed `PunctuationSkillDetailModal.jsx` in U7's Files list. Original PR had zero changes to it. The modal renders Worker atoms with rule + workedExample content — without the override threaded, adult terms leak every time a child opens skill detail from the Map.

Review-follower also added: `\b` word-boundary anchors to prevent `insubordinate` → `inadded idea`; sort-at-load for the ordering invariant; atom-walker recursion into `workedExample` / `contrastExample` nested objects; end-to-end adult-term-seed sweep tests; table-driven coverage for all 15 override entries; pronoun disambiguation in the teaser sub-line.

### U8 — Real child-click journey specs (PR #303 → `1e2ae10`)

**What shipped**: 6 journey specs under `tests/journeys/` — `smart-review`, `wobbly-spots`, `gps-check`, `map-guided-skill`, `summary-back-while-pending`, `reward-parity-visual`. `_runner.mjs` + `_driver.mjs` + `_server.mjs` infrastructure. Driver priority: bb-browser (chosen), agent-browser (probe fell through due to broken `.cmd` shim on Windows), Playwright (deferred entirely per user preference). `npm run journey` entrypoint. `/demo` seeding keeps auth headless. Screenshot artefacts under `tests/journeys/artefacts/` (gitignored).

**Adversarial + testing + agent-native caught the real root cause of the "daemon wedged mid-run" the worker had attributed to bb-browser flakiness**: the shared journey pre-amble ran `open('/demo')` (which sets auth cookie + redirects) → `waitForSelector('.subject-grid')` → `clearStorage()`. The `clearStorage()` nuked the fresh auth cookie. Subsequent API calls 401'd. bb-browser wedged on the unexpected 401 response. **This was the exact reason only `smart-review.mjs` ran green — the other 5 specs' downstream API calls silently failed after auth wipe**.

Review-follower reordered every spec: `clearStorage()` FIRST, then `open('/demo')` SECOND. Also removed implicit wipe from `_driver.mjs` `open()` so only explicit calls wipe. Plus:

- `summary-back-while-pending` asserted Back was enabled on a clean render — tautological because the invariant is about Back staying enabled WHILE pending-command is in-flight. Re-emit as `SKIPPED` with structured reason "pending-command injection requires dev-only stall endpoint; deferred to follow-on unit" — no longer ships a false-green on a non-invariant.
- `reward-parity-visual` strict-asserts mastered equality across surfaces (was log-only NOTE).
- GPS banner got a stable `.punctuation-test-mode-banner` class + `data-gps-banner` attribute at `PunctuationSessionScene.jsx`; dead-branch selectors (`.punctuation-empty-state`, `data-punctuation-finish`) dropped.
- `_server.mjs` auto-probes ports 4173-4183 (verified live binding 4175 when 4173 was busy — this was colliding with Playwright's `webServer` config).
- Structured JSON output: `tests/journeys/artefacts/results.json` + `JOURNEY_RESULT_JSON {...}` stdout line, so an agent can parse pass/fail/screenshots without regex-scraping prose.
- Wedge auto-recovery: on probe failure or preflight wedge, delete `~/.bb-browser/browser/cdp-port` and retry once, logging `{"type":"wedge-recovery",...}`.
- `artifacts/` → `artefacts/` UK English rename, aligning with the codebase's own comments.

### U9 — Worker telemetry + D1 + query + docs (PR #301 → `986ec0a`)

**What shipped**: `record-event` Worker command routing through `repository.runSubjectCommand → requireLearnerWriteAccess`. D1 migration **0012** (worker correctly detected `0011` was already taken by `admin_ops_p1_5_hardening` and bumped the number). New `shared/punctuation/telemetry-shapes.js` as single source of truth for BOTH the U4 client emitter and the U9 Worker — frozen 12-kind whitelist, per-kind payload allowlist, per-kind field-type map (needed because `correct` is `boolean` on `answer-submitted` but `number` on `summary-reached`). `GET /api/subjects/punctuation/events?learner=&kind=&since=&limit=` query endpoint. Feature flag `PUNCTUATION_EVENTS_ENABLED` default OFF. `docs/punctuation-production.md` rewritten to separate wired (table exists, events accepted, allowlist enforced, authz chain live) from aspirational (dashboard + alerting still not shipped).

**Five reviewers converged on 6 findings, all landed**:

1. **Query: unknown `kind` silently returned ALL events** → now 400 `punctuation_event_unknown_kind`.
2. **`{changed: false}` retry duplicated rows** — `runSubjectCommandMutation` skips the mutation-receipt write on observed-no-op returns, so the same `requestId` replayed and wrote a second row. Fix: added `request_id TEXT` column + `UNIQUE (learner_id, request_id) WHERE request_id IS NOT NULL` + `INSERT OR IGNORE` statement. Dedup at storage.
3. **Same-ms query order nondeterministic** → added `, id DESC` tiebreaker on the composite ORDER BY.
4. **Schema hardening**: `learner_id TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE`; `CHECK (event_kind IN (...12 kinds))`; `CHECK (json_valid(payload_json))`. Migration 0012 rewritten in place (flag OFF means no live data at risk — decision flagged in SQL comments).
5. **Testing gaps**: +10 new tests covering `since=` filter, `limit=N` in-range, `limit` default 100, `limit=-1/abc/0`, `kind=unknown` rejection, duplicate-requestId dedup, schema constraints, error-code enum enforcement, ORDER BY tiebreaker.
6. **`command-failed.errorCode` PII smuggling vector** — sibling field `errorMessage` is walled, but `errorCode` was free-form 256 chars. Added `PUNCTUATION_TELEMETRY_ERROR_CODES` enum (`backend_unavailable`, `validation_failed`, `rate_limited`, `forbidden`, `timeout`, `read_only`, `unknown`). Enforced in Worker + aligned in client emitter.

**Explicitly deferred to follow-on units** (documented in the production doc): per-session rate-limit on `record-event` (addresses flood-D1-cost concern when the flag flips ON); audit trail on the query endpoint (mirrors the admin-ops PR #188 pattern). Neither blocks the OFF-by-default rollout posture.

---

## Requirements trace

| R-ID | Requirement | Shipped by | Evidence |
|------|-------------|------------|----------|
| R1   | Primary card tap dispatches `punctuation-start` | U1 | `PunctuationSetupScene.jsx:PrimaryModeCard`, tests in `react-punctuation-scene.test.js` |
| R2   | Home hero shows recommended subject | U2 | `selectTodaysBestRound` in `src/surfaces/home/data.js`, 13 tests in `react-home-surface.test.js` |
| R3   | Bellstorm dashboard feel on Setup | partial (U1) | Above-fold layout present; visual polish deferred to a future Setup sub-unit |
| R4   | Map distinguishes `new` vs `unknown` | U3 | `deriveAnalyticsAvailability`, `punctuationChildUnknownHelperCopy` |
| R5   | Guided "Practise this" dispatches `punctuation-start { guidedSkillId }` | pre-existing + U6 | Map skill-card dispatch path exercised via `map-guided-skill.mjs` scaffold |
| R6   | Reward parity across 5 surfaces | U5 | 5-surface parity test using `getDashboardStats`, reserved-monster filter at U2 `pickSubjectCompanion` + U5 `extractPunctuationMonsterProgress` |
| R7   | Back affordance enabled under pending/degraded/unavailable | U6 | `composeIsNavigationDisabled`, `aria-disabled` parity, feedback-scene regression guard |
| R8   | Zero forbidden-term occurrences in learner-displayed text | U7 | 15-entry override + content.js `rule` updates + cross-boundary disjoint sweep test |
| R9   | Six browser journey specs | U8 | `tests/journeys/*.mjs` + bb-browser driver + structured JSON output |
| R10  | Events table + emitter + query surface | U4 (client) + U9 (worker) | `punctuation_events` table, `record-event` handler, shared allowlist, query endpoint |
| R11  | `release-id impact: none` across the chain | all 9 | Zero `contentReleaseId` references in any PR diff |
| R12  | Phase 3 invariants preserved | all 9 | `PUNCTUATION_PHASES` = 7, oracle 11/11, phase-guard green, `ACTIVE_PUNCTUATION_MONSTER_IDS` iteration preserved |
| R13  | No Spelling regression | U2 | Pre-U2 fresh-learner fallback literally preserved; Spelling scenes untouched |
| R14  | No regression of child-facing surfaces | all 9 | `react-punctuation-scene.test.js` and sibling tests all green at every merge |

---

## Adversarial-review findings table — what would have shipped broken

This is the most actionable artefact in the report: **9 findings that adversarial / convergent review caught before merge, ordered by severity**.

| Unit | Finding | Severity | Class |
|------|---------|----------|-------|
| U2 | `pickSubjectCompanion` `entry.subjectId` annotation bypass → reserved monsters (`colisk`, `hyphang`, `carillon`) could appear on Home hero | HIGH (R6 violation) | Trusted-input weakness |
| U3 | `deriveAnalyticsAvailability(null)` returned `false` → every production cold-boot rendered 14 "Unknown" chips — worse than pre-U3 silent-`'new'` | BLOCKER (UX regression) | Cascade: null→false→degraded-render |
| U3 | `PUNCTUATION_MAP_STATUS_FILTER_IDS` at 6 entries, but degraded state made every skill `'unknown'` → any non-"All" filter emptied the Map | BLOCKER (dead-end trap) | Missing enum extension |
| U4 | Worker `record-event` doesn't exist pre-U9 → every `card-opened` emit → `subject_command_not_found` → `setSubjectError` → visible red alert banner on every Setup mount | BLOCKER (direct UX regression) | Optimistic "never propagates to learner" claim, shared-handler default fallback |
| U5 | `sessionSummary()` NEVER writes `skillsExercised` or `monsterProgress` → 3 marquee features unreachable in production; tests passed because fixtures seeded fields directly via `extraSummary` | HIGH | Test-harness-vs-production scaffold-without-producer |
| U5 | 5-surface parity test hand-fed `{pct: 7}` to `buildSubjectCards`, asserted `progress === 7/100` — tautology | HIGH | Test asserts same input as output |
| U7 | `PunctuationSkillDetailModal.jsx` was plan-listed as U7-required but entirely absent from initial diff → modal Worker atoms would leak adult terms into learner's skill detail view | HIGH (R8 violation) | Missing-file diff-vs-spec |
| U7 | `main clause → whole sentence` mapping mis-taught semicolon rule — "Join two whole sentences with a semicolon" reinforces comma-splicing by re-invoking the word children confuse with full-stops | HIGH (pedagogical defect) | Copy change preserves surface form but inverts teaching intent |
| U8 | `clearStorage()` nuked the `/demo` auth cookie in shared pre-amble → 5 of 6 specs silently hit 401 on back-end calls; worker misattributed to "bb-browser daemon wedge" | HIGH | Test-harness-vs-production cascade masquerading as flakiness |

**Observation**: Every finding except U3's two BLOCKERs was framed correctly by ONE reviewer persona. The two BLOCKERs required CONVERGENCE across three reviewers (adversarial + design-lens + testing) — that's why cross-layer reasoning is not optional.

---

## Execution-pattern notes

The orchestration pattern ran as follows for every unit:

1. **Fresh worktree off `origin/main`** — prevented parallel-worker file-collision incidents (per the `U1+U9 shared-path incident` memory from Post-Mega Spelling).
2. **Worker subagent** — writes failing test → implements → verifies oracle + layer tests → commits → pushes → opens PR. Scrum-master never touched code.
3. **Parallel reviewer fan-out** — 4–7 specialised reviewers in a single message, each with scoped context. Reviewers are orchestrator-only (can't be nested), so the scrum-master dispatches them, never a worker.
4. **Convergence synthesis** — scrum-master reads all reviewer outputs, looks for 2+ independent persona agreement on the same root cause, weights BLOCKERs, ignores solo-LOW nitpicks.
5. **Review-follower subagent** — lands the substantive fix, merges main if needed, pushes, waits for CI, squash-merges (with `--delete-branch`). Never force-merges.
6. **Next unit dispatched** — against freshly-pulled `main` HEAD.

Budget consumption: main agent's context sat at ~80-90% for the final 3 units but never required compaction. Each worker/reviewer ran in its own isolated context window, so context-overflow was a worker concern, not the scrum-master's.

**Two recurring Windows pitfalls surfaced** (per `project_windows_nodejs_pitfalls` memory):
- `git stash pop` lost working-tree changes twice during follow-on work (U4 worker, U6 follow-on, U5 follow-on). Each time the worker recovered from context snapshot. Recommend updating memory with explicit "do not stash during follow-on flows" guidance.
- `.cmd` shim EINVAL on Windows handled via `shell: true` in `_driver.mjs` — worked correctly once diagnosed.

---

## Outside-the-diff: Cloudflare audit regression

During U7's post-merge Cloudflare deploy, the production audit began failing with three specific errors:

1. `Cache-Control: no-store, no-store` stacked on `/`
2. `Cache-Control: no-store, public, max-age=31536000, immutable` on static assets (`no-store` prefix should not be there)
3. Missing `Clear-Site-Data: "cache", "cookies", "storage"` on logout HEAD probe

A forensic investigator agent proved **this was NOT caused by U7** — U7 touched zero header / wrangler / auth files. The regression traced to **PR #202 (sys-hardening U8, 2026-04-25, SHA `dfc910a`)**:

- `_headers:12` has a `/*` wildcard block setting `Cache-Control: no-store`. Cloudflare Pages merges that with path-specific blocks (`/`, `/assets/app-icons/*`, `/manifest.webmanifest`), producing `no-store, <specific>`. `assertCacheSplitRules` at `scripts/lib/headers-drift.mjs:168` only checks single-block contents — textbook test-harness-vs-production.
- `worker/src/app.js:737` logout handler guards on `method === 'POST'`. The audit probe at `scripts/production-bundle-audit.mjs:203` uses HEAD. HEAD falls through to `env.ASSETS.fetch(request)` → 404 without `Clear-Site-Data`. Existing unit tests at `tests/security-headers.test.js:237, 592` use POST, masking the bug.

Fix scope: 2 production files + 2 drift-gate test files, ~20 lines total. Single PR recommended. **Not dispatched as part of Phase 4** — flagged for a separate session per user's triage preference. Diagnosis and fix plan are already captured in the investigator agent output.

---

## Insights — what worked, what to keep, what to change

### What worked

1. **Scrum-master pattern with subagent teams**. 9 units shipped in one day with full adversarial coverage. Main agent was coordination-only; workers and reviewers consumed their own contexts. This model scales as long as reviewer dispatch remains parallel.
2. **Convergence voting**. Single-reviewer HIGH on its own is noise. Two independent reviewers on the same root-cause root is signal. Three is a BLOCKER. The pattern saved U3 and U4 from shipping visible UX regressions.
3. **Always-fresh worktrees**. Every worker got `git fetch origin` + fresh checkout off `origin/main` at dispatch time. Zero cross-worker conflicts occurred.
4. **Test-harness-vs-production vigilance**. Caught 4 divergences. Every time, the pattern was "tests pass because fixtures seed the shape; production never writes the shape, or the test bypasses the real call path". Reviewers should default-suspect tests that set up exactly the state being asserted.
5. **Plan as living document**. U3 and U6 both revealed plan self-contradictions only at review-time. The review-follower patching the plan file keeps future units from re-regressing. Plan is a decision artefact, not a spec — it must be editable in response to code-truth.
6. **Explicit deferrals in PR bodies**. Every deferred item (U2 `completedToday`, U5 copy-register pass, U9 rate-limit, U9 audit trail) was documented in the PR body AND the production doc. Future units discovering the deferrals can find them in `git log --grep` without the scrum-master needing a hand-off document.

### What to keep

- **`release-id impact: none` discipline** across every PR body. Downstream ops engineers rely on this as a signal that oracle replay stays valid.
- **Oracle replay 11/11 as the floor**. No unit can merge if `tests/punctuation-legacy-parity.test.js` drops a test. Engine scope-lock held.
- **Shared allowlist refactor (U9)**. `shared/punctuation/telemetry-shapes.js` imported by both client + worker is the correct shape for any data contract that crosses the boundary. Pattern worth replicating for future cross-boundary enums.
- **Investigation agents for operational issues**. The Cloudflare forensic investigator produced a fix plan in 10 minutes without blocking Phase 4. Use this pattern whenever a production symptom is ambiguous in origin.

### What to change

- **`.cmd` EINVAL on Windows** and `git stash pop` data loss are recurring pitfalls. Update `project_windows_nodejs_pitfalls` with explicit guidance: prefer `git stash` + `git stash show -p > /tmp/stash.patch` + `git apply` over `git stash pop` when the working tree has overlapping uncommitted work.
- **Browser journey auth pre-amble** was fragile. Document in `AGENTS.md` or equivalent that any test that calls `/demo` must follow the `clearStorage() → open('/demo')` order, never the reverse.
- **Dev-only stall endpoint** is now a known gap. `summary-back-while-pending` cannot assert its R7 invariant without one. Suggested follow-on: small Worker route guarded by `env.ENVIRONMENT !== 'production'` that stalls a subject-command for N ms on request. Unlocks multiple pending-state assertions.
- **Rate-limit patterns need codifying**. U9 documents deferred rate-limit, but no project-wide rate-limit helper exists yet. When that helper lands, retrofit U9's `record-event` as the first consumer.

### What to investigate further

- **The Cloudflare audit regression** is a test-harness-vs-production defect in `scripts/lib/headers-drift.mjs`. The unit tests at `tests/security-headers.test.js` use POST; audit uses HEAD. The drift-gate at `scripts/lib/headers-drift.mjs:168` only checks single-block contents. Pattern: **audit tooling and unit tests must agree on verbs and merge semantics**. Worth a dedicated hardening pass.
- **`sessionSummary()` producer gap in U5** was only caught by three-reviewer convergence. Similar scaffold-without-producer risks likely exist elsewhere. Useful lint: grep for fields declared in `service-contract.js` normalisers that have zero producer writes anywhere in `shared/`, `worker/src/`.

---

## Artefacts

- **Plan**: `docs/plans/2026-04-26-001-feat-punctuation-phase4-visible-child-journey-plan.md` (1002 lines, status `completed`, deepened 2026-04-26).
- **Origin direction**: `docs/plans/james/punctuation/punctuation-p4.md` (James's prose direction doc).
- **Phase 3 completion report** (predecessor): `docs/plans/james/punctuation/punctuation-p3-completion-report.md`.
- **Forbidden terms**: `PUNCTUATION_CHILD_FORBIDDEN_TERMS` in `src/subjects/punctuation/components/punctuation-view-model.js`.
- **Override table**: `PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES` (15 entries, sorted longest-first at module load).
- **Production doc**: `docs/punctuation-production.md` (§293 rewritten by U9 to separate wired from aspirational).
- **Telemetry shapes**: `shared/punctuation/telemetry-shapes.js` (single source of truth for client + worker).
- **Journey specs**: `tests/journeys/*.mjs` with `_runner.mjs` + `_driver.mjs` + `_server.mjs` + `README.md`.
- **D1 migration**: `worker/migrations/0012_punctuation_events.sql`.

---

## Phase 4 is closed.

Next scope for Punctuation belongs to the deferred items surfaced during this phase:

1. **Dev-only stall endpoint** (unblocks `summary-back-while-pending` real assertion).
2. **Per-session rate limit + audit trail on `record-event`** (unblocks flipping `PUNCTUATION_EVENTS_ENABLED` to `true` in production with confidence).
3. **`completedToday` signal** across all three subject modules (distinguishes fresh learner from completed-today state on Home hero — a design-lens HIGH deferred from U2).
4. **Cloudflare audit regression fix** (not Phase 4, but surfaced during it — diagnosis complete, fix ready to dispatch).
5. **Dashboard + alerting pipeline** for the now-wired `punctuation_events` table (plan's `docs/punctuation-production.md:293` still labels these aspirational).

Plan file status flips to `completed`. Phase 4 workflow terminates here.
