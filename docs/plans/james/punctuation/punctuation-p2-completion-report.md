# Punctuation Phase 2 — Completion Report

**Date:** 2026-04-25
**Author:** James To (with agent-driven SDLC loop)
**Plan:** [`docs/plans/2026-04-25-002-feat-punctuation-phase2-hardening-plan.md`](../../2026-04-25-002-feat-punctuation-phase2-hardening-plan.md)
**Origin audit:** [`punctuation-p2.md`](punctuation-p2.md)

---

## Executive summary

Punctuation Phase 2 shipped as **10 merged pull requests** over a single continuous SDLC loop (`PR → independent review → follower update → re-review → merge → next unit`). Every audit finding and the monster-roster decision from the origin audit are now live on `main`. The release turns "production-capable but not production-perfect" into a subject that is genuinely honest about what it claims, fail-closed where it matters, and migrates every existing learner's earned progress without a single stored-state rewrite.

**Headline metrics**

- PRs opened / merged: **10 / 10** (no open, no reverted)
- Review passes: **20** (one per PR + one follower re-review per PR)
- Tests written: **71 new** (plus ~15 updated for new expectations)
- Production code touched: **14 files** across `src/`, `shared/`, `worker/`, `scripts/`, `docs/`
- Opportunistic fix: **1** Windows CLI bug in `scripts/audit-client-bundle.mjs` that had been silently failing 7 tests per worktree run
- Final suite state at merge of U10: **1020 / 1019 pass / 1 skipped (U5 deliberate) / 0 fail** on the Phase 2 chain

---

## What shipped, unit by unit

| Unit | PR | Goal | Lines touched | Tests added |
|------|-----|------|---------------|-------------|
| U1 | [#149](https://github.com/fol2/ks2-mastery/pull/149) | Fix `hasEvidence` inflation | 2 src, 130 test | 6 |
| U2 | [#152](https://github.com/fol2/ks2-mastery/pull/152) | Recursive fail-closed redaction scan | 45 src, 240 test | 12 |
| U3 | [#154](https://github.com/fol2/ks2-mastery/pull/154) | Restore guided `skillId` in local-module fallback | 2 src, 135 test | 6 |
| U4 | [#159](https://github.com/fol2/ks2-mastery/pull/159) | Composite `isDisabled` across Setup / ActiveItem / Feedback | 55 src, 90 test | 5 |
| U5 | [#163](https://github.com/fol2/ks2-mastery/pull/163) | Roster reshape: 3 active direct + 1 grand + 3 reserved | 85 src, 40 test | 0 (existing tests updated) |
| U6 | [#164](https://github.com/fol2/ks2-mastery/pull/164) | Read-time Codex normaliser + `publishedTotal` override for grand | 70 src, 180 test | 13 |
| U7 | [#166](https://github.com/fol2/ks2-mastery/pull/166) | Projection-layer `terminalRewardToken` dedupe | 30 src, 155 test | 7 |
| U8 | [#168](https://github.com/fol2/ks2-mastery/pull/168) | Endmarks + Apostrophe focus buttons, honest scope copy, docs | 5 src, 60 test, 50 doc | 6 |
| U9 | [#171](https://github.com/fol2/ks2-mastery/pull/171) | Behavioural golden paths per legacy job type | 0 src, 195 test | 7 |
| U10 | [#173](https://github.com/fol2/ks2-mastery/pull/173) | Smoke matrix + bundle audit regression + Windows CLI fix | 5 src, 180 test | 9 |

---

## What each unit actually fixed

### U1 — `hasEvidence` was leaking "fresh learner has evidence" into adult surfaces

`src/subjects/punctuation/read-model.js:492` evaluated `attempts.length > 0 || itemSnapshots.length > 0 || publishedRewardUnits.length > 0 || sessions.length > 0`. Any stored item snapshot or any published reward-unit entry flipped it to `true`. Parent Hub and Admin Hub consumed the flag directly; a fresh learner with zero activity still triggered "has evidence" panels.

The plan originally flagged `securedRewardUnits: publishedRewardUnits.length` at `:503` and `:516` as a second bug. Investigation showed this was a **false alarm in the plan itself** — `progress.rewardUnits` entries are only written when `nextItemSnap.secure === true` in `shared/punctuation/service.js:835`. The names were misleading but the values were accurate. U1 fixed only `hasEvidence`, which was the real bug; the PR body recorded the investigation so future readers do not repeat the chase.

### U2 — `safeSummary` cloned, leaving non-summary leaf branches unguarded

`safeSummary` was literally `cloneSerialisable(summary)`. The existing per-item allowlist in `safeCurrentItem` covered active items; everything else (analytics, summary branches, stats passthrough, availability) relied on callers knowing to strip. The fix was a recursive `assertNoForbiddenReadModelKeys` that walks the assembled payload and throws on any server-only key at any depth. Forbidden set aligned between `worker/src/subjects/punctuation/read-models.js` and `scripts/punctuation-production-smoke.mjs` with a bidirectional alignment comment on both so drift requires editing both files.

Defence-in-depth layering: the per-phase allowlists (`safeCurrentItem`, `safeFeedback`, `safeContextPackSummary`) still strip first; the recursive scan is belt-and-braces for clone-passthrough paths (stats, prefs, analytics, summary branches the service adds fields to). Tests lock both layers.

### U3 — Local-module fallback dropped `skillId`

`src/subjects/punctuation/module.js` built options for `service.startSession` as `{ ...prefs, mode, roundLength }`. Worker path at `shared/punctuation/service.js:1269` accepted `skillId`/`guidedSkillId`; the local fallback silently stripped them. Guided sessions started in local preview / tests silently defaulted to the weakest skill. Two-line fix, four tests.

Worth noting: follower review added conflict-resolution and cluster-id-as-skillId tests that were not in the original plan — they locked in behaviour the service had all along but nobody had verified.

### U4 — `disabled={false}` literals and composite signal

`ChoiceItem` and `TextItem` accepted a `disabled` prop but `ActiveItemView` hard-coded `false` at call site. Skip / End session buttons had no disable at all. Adapter-level dedupe (`pendingKeys` in `subject-command-actions.js`) already blocked double-submit, but the UI had no visual echo during `pendingCommand`, `runtime.readOnly`, or `availability.status ∈ {degraded, unavailable}`.

The composite signal was extracted as `composeIsDisabled(ui)` and applied to Setup (all 10 mutation buttons + guided-skill `<select>`), ActiveItem (choice/text inputs + Skip + End), and Feedback (Continue + Finish). Follower review was correct that the initial PR missed Setup and Feedback — plan §519 explicitly called for it. Fix landed on re-review. Also widened `normaliseState.availability` to accept `'degraded'` alongside `'ready'`/`'unavailable'` (the old coercion silently dropped the plan's new signal).

### U5 — Monster roster reshape

Structural change: 7 active monsters → 4 active (Pealark, Curlune, Claspin, grand Quoral) + 3 reserved (Colisk, Hyphang, Carillon). Cluster remap: `endmarks/speech/boundary → pealark`, `apostrophe → claspin`, `comma_flow/structure → curlune`. `PUNCTUATION_GRAND_MONSTER_ID: 'carillon' → 'quoral'`. Quoral metadata rewritten from direct Speech creature (`masteredMax: 1`) to grand aggregate (`masteredMax: 14`); Pealark/Curlune `masteredMax` recomputed from cluster totals.

Follower review caught three issues I missed:
1. `pickFeaturedCodexEntry` did not filter `subjectId !== 'punctuationReserve'`, so a learner with pre-flip `carillon.caught: true` would have seen Carillon featured on the Codex hero.
2. `CODEX_POWER_RANK` had Quoral=7 (below Curlune=8, Colisk=9, Hyphang=10, Carillon=11). The grand creature must outrank directs and reserved. Flipped Quoral to 11; reserved moved to 8/9/10.
3. `subjectPriority` iterated `Object.keys(MONSTERS_BY_SUBJECT)`, so after adding `punctuationReserve` it silently slotted between `punctuation` and `grammar`. Replaced with a dedicated `SUBJECT_PRIORITY_ORDER = ['spelling', 'punctuation', 'grammar']` list.

All three were single-line bugs that would have shipped quiet regressions to production if the follower pass had not caught them.

### U6 — Read-time Codex normaliser

The most risky PR in the series because it touches persistent D1 state for every learner who has used Punctuation. The normaliser is **read-only** and preserves every stored entry:

- Unions pre-flip `carillon.mastered` into the grand Quoral view (deduped by mastery key).
- Overrides `publishedTotal: 1` on pre-flip Quoral-as-Speech state to the release denominator (14).
- Keeps reserved entries accessible via `reservedPunctuationMonsterEntries` for Admin tooling.
- Referentially transparent: N calls produce equivalent views, source state is unchanged after N reads.

The plan originally proposed a writer-side seam to bypass the `recordPunctuationRewardUnitMastery` line-139 early-out that short-circuits when `directMastered.includes(masteryKey)`. Investigation during U7 showed the seam was unnecessary: after R18's remap, `speech → pealark`, so a post-flip secure of `speech-core` passes `monsterId: 'pealark'` and the early-out evaluates against `pealark.mastered` (empty for pre-flip-only learners). The aggregate writer runs organically. U6's override also makes stored `publishedTotal` irrelevant for display. Documented in the PR so future readers do not re-introduce the seam.

Reviewer insight that stuck: the JSDoc said "never mutates nested arrays" but the view was a shallow spread, so nested arrays were shared references with source. Callers must treat the view read-only. Tightened the contract in code comments.

### U7 — Projection-layer terminal-token dedupe

Event log uses `ON CONFLICT(id) DO UPDATE`. Pre-flip `reward.monster:...:speech:speech-core:quoral:caught` and post-flip `reward.monster:...:published_release:speech-core:quoral:caught` have different `id` strings (the cluster segment differs), so both rows persist. Without a semantic collapse, downstream consumers see two `caught` events for the same milestone.

The fix is `terminalRewardToken(event)` keyed on `(learnerId, monsterId, kind, releaseId)` applied at projection layer (`combineCommandEvents`). Storage keeps both rows; consumers see one. Cross-release re-emission (`r4` mega → `r5` mega) stays intentional — `releaseId` in the token means a genuine new release celebrates its own milestone.

Levelup/evolve are not terminal milestones; they remain id-only deduped. `caught` and `mega` for the same `(learner, monster, release)` both survive because `kind` is in the token — explicit test locks this.

### U8 — UX + copy + docs

Two focus buttons added (Endmarks, Apostrophe); all six clusters now reachable from setup. Scope copy downgraded from "covers all 14 KS2 punctuation skills" to honest wording that names the modes the behavioural smoke matrix proves end-to-end. Three copy sites kept aligned: `shared/punctuation/content.js` manifest, React fallback string, `module.js` blurb + nextUp.

Docs additions to `docs/punctuation-production.md`:
- **Monster Roster** subsection (active / reserved)
- **Migration from pre-Phase-2 roster** (normaliser, publishedTotal override, writer self-heal, terminal-token dedupe)
- **Rollback** subsection with the actual math (reviewer catch: my original reasoning was inverted — pre-flip bundle reads stored `publishedTotal: 1` through its own `masteredMax: 1` and returns stage 4, which is the lossless path; fixed on re-review)
- **AI Context Pack Decision** (teacher/admin only for this release; learner surface ignores)
- **Read-Model Redaction** (allowlist + recursive fail-closed scan)

### U9 — Behavioural golden paths

The label-based parity matrix can be green while behaviour is broken — a row marked `ported` passes as long as a fixture says so. U9 added 7 tests that start a real session per legacy job type, submit a known action, and assert a mode-specific positive signal plus no forbidden key leaks. Coverage spans Smart, Guided (with `skillId`), Weak Spots (with seeded weak evidence), GPS (delayed-feedback contract), Endmarks + Apostrophe focus, Speech + Comma-flow + Boundary + Structure focus, mixed item modes via Smart Review.

Follower tightened the `weakFocus` assertion from a disjunctive check to a literal `equal` — otherwise a regression that serves the right skill for the wrong reason would slip through.

### U10 — Smoke matrix + bundle audit + opportunistic Windows fix

Smoke matrix expansion: +4 Worker-routed mode starts (Guided, Weak, Endmarks, Apostrophe) appended to the existing Smart + GPS + Parent/Admin + Spelling flow. Each entry asserts a positive signal (`guided.supportLevel > 0`, `session.mode === 'weak'`, etc.) and the absence-of-leak invariants.

Bundle audit regression: browser-local re-export test + per-module loop covering each forbidden `shared/punctuation/*` module (content / generators / marking / scheduler / service). Follower caught that the per-module tests originally shared a loose `/punctuation|forbidden/` regex; tightened to path-specific so a regex drop on any one module surfaces its own failure.

Opportunistic fix: `scripts/audit-client-bundle.mjs` CLI detector was using ``file://${process.argv[1]}``, which breaks on Windows (`process.argv[1]` uses backslashes; `import.meta.url` uses `file:///C:/...`). The 7 "pre-existing" bundle-audit failures in the worktree were actually this bug — the audit was correctly detecting forbidden modules but the CLI was exiting 0 because the module-isMain check silently failed. Switched to `pathToFileURL(process.argv[1]).href`, mirroring the pattern already used in `scripts/backfill-learner-read-models.mjs`. All 7 failures resolved without touching test assertions.

---

## Observations and insights

### The plan's own uncertainty was a feature, not a bug

The plan had been through deepening (`ce-data-migration-expert`) and 5-persona doc review (coherence, feasibility, security, scope-guardian, adversarial) before execution started. Two of its U1 claims were wrong: `securedRewardUnits: publishedRewardUnits.length` was not inflated because `progress.rewardUnits` is only written on secure, and U7's "stuck-at-1" writer seam turned out to be unnecessary because the cluster remap routes pre-flip masked keys away from the line-139 early-out.

Those are not plan failures — they are plan *strengths*. In both cases the plan said "verify the reproduction first" rather than prescribing code changes. The feasibility reviewer had flagged both items as "premise may not reproduce". Both were resolved to *not* code during U1 and U7, saving scope without reopening the plan. A more prescriptive plan would have landed dead code.

### Test-first worked; TDD vs "characterization-first" mattered in different places

- **U1, U2, U3**: pure test-first. Red → green → refactor. Clean.
- **U4**: wrote tests before code, but the first tests over-asserted (regex expected attributes after `data-punctuation-submit` when React actually emitted them before). Had to iterate on the regex shape — a lesson that test-first still requires knowing how the SSR output is formatted before writing the matcher.
- **U5**: characterization-first. The monster-roster flip was a structural change; I ran the full test suite first to see which existing tests broke, then updated them to match the new expectations unit by unit. Test-first would have been theoretical; the repo had 20+ existing assertions that needed reconciling.
- **U6**: test-first for the normaliser, characterization for how existing consumers would see the new view. 13 tests covered every migration path before code.
- **U7**: test-first worked naturally because the projection layer is pure.

### SDLC loop's independent reviewer caught real bugs

Every PR went through the `pr-review-toolkit:code-reviewer` subagent, which had no context from the planning or implementation conversation. Three critical catches:

1. **U4**: SetupView and FeedbackView missed the composite disabled. I had focused on ActiveItem; reviewer noticed the plan's §519 explicitly called for all three views. Fixed on re-review.
2. **U5**: three single-line bugs — `pickFeaturedCodexEntry` missing reserved filter, `CODEX_POWER_RANK` placing grand below directs, `subjectPriority` leaking the reserved subject. All would have shipped quiet regressions.
3. **U8**: my rollback math in the docs was backwards. Reviewer traced the pre-flip bundle's actual read path and corrected it.

Each of these would have been hard to catch in self-review because they were "plausible-but-wrong" rather than "obviously-wrong". The reviewer being a fresh-context agent per PR (vs. one continuing conversation) forced re-derivation from first principles each time.

### The "follower update" step earned its keep

Every review produced at least one non-blocking suggestion. For units where the suggestions were dismissed ("strawman alternative", "speculative"), the follower step made the dismissal explicit in a comment. For units where the suggestions were real, the follower applied the fix and triggered a second review pass. No PR merged on the first reviewer pass — every one had at least one follower commit.

Cost: ~10-15 minutes per PR. Benefit: 3 critical catches plus a more durable code history. Worth it.

### The Windows CLI bug is the most interesting finding

The `scripts/audit-client-bundle.mjs` CLI-detector bug had been dormant in the repo for who knows how long. Every Windows worktree run quietly failed 7 bundle-audit tests, and the failures were chalked up to "pre-existing" because the pattern was consistent across branches. The tests were actually correct — they were exercising the audit logic with throw-when-forbidden expectations — but the CLI wrapper never got the chance to exit non-zero because `import.meta.url === file://${process.argv[1]}` compared a forward-slash URL against a backslash Windows path.

Two lessons:
1. **"Pre-existing failure" is a signal to investigate, not a license to ignore.** Carrying 7 failures for 7 PRs silently normalised them. The fix took 2 lines.
2. **Cross-platform CLI detectors are subtle.** The correct pattern (`process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`) already existed in a sibling script (`backfill-learner-read-models.mjs`). The pattern that worked on Linux was the one that got copied; the pattern that was subtly broken on Windows had been introduced separately. A grep-for-pattern-consistency pass would have caught this earlier.

### Scope discipline: the plan wanted more than what shipped

The plan described a "writer-side seam" to handle stuck-at-1 learners (U7), and an AI context-pack productisation path (U8). Both were deliberately left out:

- **Writer seam**: investigation proved it was unnecessary. Plan updated in U7's PR body; no code.
- **AI context-pack UX**: reserved for Phase 3. The Worker plumbing stays (safe allowlist already); the learner surface does nothing. Phase 3 will decide whether to expose a "Why this question?" button or keep it teacher/admin-only.

Scope creep is easy in a chain of 10 PRs. Each "while I'm here" fix compounds review burden on subsequent units. The plan's discipline held: nothing in `Scope Boundaries` shipped, nothing in `Deferred to Follow-Up Work` shipped.

### What will probably need attention in Phase 3

1. **AI context-pack learner surface.** Decision to defer was deliberate; the field is already harmlessly ignored. Phase 3 must either productise it or strip from the learner read model.
2. **The one skipped test** in U5 (old Comma/Flow cluster reach-stage-4 assertion under pre-flip publishedTotal). Deliberately skipped because Phase 2 reward units no longer match the cluster shape it was written for. Either delete the skip or port the assertion into the new Pealark/Curlune coverage tests.
3. **`docs/punctuation-production.md` still says "First Release Scope"** at the top. That framing is pre-Phase-2; consider a rewrite to "Current Release Scope" or similar to match the ongoing nature of the subject.
4. **Telemetry thresholds** in Operational Notes are stated without a dashboard. The plan itself flagged this — Phase 2 emits structured warnings via `logMutation('warn', …)` but no alerting pipeline consumes them. If "Stuck-at-1 learner count" is a real operational concern, wire up a query or drop the threshold.
5. **`CODEX_POWER_RANK` reserved tombstones** (Colisk=8, Hyphang=9, Carillon=10) are dead weight — the reserved filter in `pickFeaturedCodexEntry` short-circuits before ranking. Harmless but misleading to future readers. Consider moving them out of the active map when the reserved roster is decommissioned.

### What I'd do differently

1. **Install `node_modules` before starting.** The worktree had none on first run; discovered this at U1's first `npm test` invocation. Lost ~2 minutes. Worth a pre-flight check in future SDLC loops.
2. **Use `git pull --ff-only` + explicit conflict check before each PR.** U10 merged into a main that had diverged (the Windows CLI fix landed through a different route), forcing a rebase. A single `git fetch + git log origin/main..HEAD` at the top of each unit would have caught this earlier.
3. **Run the `code-reviewer` subagent with diff-only context for PR re-reviews.** The first review on each PR benefited from full-repo context (pattern lookup, dependency tracing). The re-review only needs the diff of the follower commit. Smaller context = faster response, same signal.
4. **Consider bundling U5 + U6 + U7 into one PR.** They are a single semantic change (roster flip with safe migration). Shipping them separately required the plan's "not deployable until all three land" invariant, which depended on a reviewer noticing the chain. A single PR would have made the invariant structural rather than cultural. Downside: a 300-line PR instead of three ~100-line PRs. Tradeoff.

---

## Files touched (final tally)

**Production code**
- `src/subjects/punctuation/read-model.js` — hasEvidence fix
- `src/subjects/punctuation/module.js` — skillId routing, blurb, nextUp
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx` — composite disabled signal, focus buttons, scope copy fallback
- `shared/punctuation/service.js` — degraded status accepted
- `shared/punctuation/content.js` — cluster monsterId remap, grand monsterId flip, scope copy downgrade
- `src/platform/game/monsters.js` — roster split, Quoral/Carillon metadata, reserved statuses
- `src/platform/game/mastery/shared.js` — PUNCTUATION_GRAND_MONSTER_ID flip, PUNCTUATION_RESERVED_MONSTER_IDS export
- `src/platform/game/mastery/punctuation.js` — normaliser, publishedTotal override, reservedPunctuationMonsterEntries
- `src/surfaces/home/data.js` — codex copy, subject priority, pickFeaturedCodexEntry filter, CODEX_POWER_RANK reorder
- `worker/src/subjects/punctuation/read-models.js` — recursive forbidden-field scan
- `worker/src/projections/events.js` — terminalRewardToken, dedupeEvents dual-set
- `scripts/audit-client-bundle.mjs` — Windows CLI fix
- `scripts/punctuation-production-smoke.mjs` — forbidden-key list alignment comment

**Tests**
- `tests/punctuation-read-model.test.js` (new)
- `tests/punctuation-read-models.test.js` (new)
- `tests/punctuation-guided-routing.test.js` (new)
- `tests/punctuation-monster-migration.test.js` (new)
- `tests/react-punctuation-scene.test.js` (expanded)
- `tests/punctuation-legacy-parity.test.js` (behavioural section)
- `tests/punctuation-rewards.test.js` (roster + idempotency)
- `tests/punctuation-release-smoke.test.js` (smoke matrix)
- `tests/bundle-audit.test.js` (per-module regression)
- `tests/punctuation-content.test.js` (copy assertion)
- `tests/react-grammar-surface.test.js` (blurb assertion)
- `tests/react-punctuation-assets.test.js` (Codex roster update)
- `tests/hub-read-models.test.js` (secured-count fixture)

**Docs**
- `docs/plans/2026-04-25-002-feat-punctuation-phase2-hardening-plan.md` (plan itself)
- `docs/punctuation-production.md` (5 new subsections + updated reward projection + rollback math)
- `docs/plans/james/punctuation/punctuation-p2-completion-report.md` (this file)

---

## Conclusion

Phase 2 was small in individual PR scope and large in cumulative architectural change. Every learner who has ever used Punctuation now has their earned progress preserved through a read-only normaliser; every read-model branch is fail-closed against forbidden server-only fields; the monster roster matches James's 3+1 decision; and the smoke matrix behaviourally proves the modes the subject claims to support. The single coordinated release gate held — nothing in the plan's "Deferred" list slipped into the ship.

The SDLC loop (independent reviewer per PR, follower update, re-review) earned its keep three times over. The plan's willingness to say "verify first" twice saved meaningful dead code. The Windows CLI fix is a bonus: a dormant bug that would have kept inflating future worktree failure counts indefinitely is now gone.

Ready for Phase 3 when content expansion or the AI context-pack surface becomes the next priority.
