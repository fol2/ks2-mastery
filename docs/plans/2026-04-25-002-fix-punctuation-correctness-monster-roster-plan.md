---
title: "fix: Punctuation Correctness and Monster Roster"
type: fix
status: active
date: 2026-04-25
origin: docs/plans/james/punctuation/punctuation-p2.md
---

# fix: Punctuation Correctness and Monster Roster

## Overview

The production Punctuation subject has five correctness bugs and a stale monster-roster mapping that together undermine trust in the feature. This plan fixes them without touching the 14-skill learning scope, the six learning clusters, or the two existing parity plans.

The audit document (`docs/plans/james/punctuation/punctuation-p2.md`) identifies two related but separable problem areas:

1. **Correctness bugs** — secured-unit count incorrect, `safeSummary` redaction too permissive, `skillId` dropped in local module start path, UI submit controls never disabled.
2. **Monster roster** — the active roster is still the original seven-monster design (`pealark`, `claspin`, `quoral`, `curlune`, `colisk`, `hyphang`, `carillon`). The revised design collapses to three direct monsters plus one grand (`pealark`, `curlune`, `claspin`, grand `quoral`), with `colisk`, `hyphang`, and `carillon` reserved for future expansion.

These must be treated together because the roster change requires a compatibility normaliser (old Quoral state means "direct Speech monster"; new Quoral state means "grand all-14 monster") and the correctness fixes depend on knowing which mastery keys are authoritative.

---

## Problem Frame

The audit states the biggest danger is "false confidence from '14-skill/full parity' wording while analytics, redaction, guided routing, and smoke coverage still have holes." The correctness bugs let the product show incorrect mastery data (wrong secured-unit count), leak server data (clone-based summary), and allow duplicate submits (no disabled state). The roster mismatch means the current `PUNCTUATION_GRAND_MONSTER_ID = 'carillon'` keeps awarding and displaying the old seven-monster system.

(see origin: `docs/plans/james/punctuation/punctuation-p2.md`)

---

## Requirements Trace

- R1. `securedRewardUnits` in the client read model must reflect demonstrated mastery, not published-unit count.
- R2. `safeSummary` in the Worker read model must be allowlist-based and pass a recursive forbidden-field scan.
- R3. The local module `startSession` path must pass `skillId` through for guided/focus modes.
- R4. React submit controls must disable while a submit command is pending, after feedback, and in GPS mode.
- R5. The active Punctuation monster roster must be `['pealark', 'curlune', 'claspin', 'quoral']`.
- R6. `PUNCTUATION_GRAND_MONSTER_ID` must be `quoral`.
- R7. `colisk`, `hyphang`, and `carillon` must remain in `MONSTERS` but move to a reserved list.
- R8. Old Quoral-as-Speech mastery state and old Carillon grand state must be normalised on read/projection without destroying stored evidence.
- R9. Cluster `monsterId` values in `shared/punctuation/content.js` must match the new active roster.
- R10. Existing Spelling monster tests must still pass.
- R11. Overclaiming copy in the React setup surface and production docs must be corrected.
- R12. The release smoke must be expanded to cover the full parity matrix before copy is upgraded to "complete".

---

## Scope Boundaries

- Do not change the 14 skill ids or their cluster membership.
- Do not change the six learning cluster ids (`endmarks`, `apostrophe`, `speech`, `comma_flow`, `structure`, `boundary`).
- Do not remove `colisk`, `hyphang`, or `carillon` from `MONSTERS` — they remain for Admin visual review and asset validation.
- Do not change the existing `SPELLING_MONSTER_IDS` or any Spelling reward behaviour.
- Do not redesign the production smoke framework; extend it with the parity matrix.
- Do not change the Worker command API shape or learner state schema.
- Do not implement any of the deferred parity features (paragraph repair, combine, GPS, AI context packs, richer analytics) — those belong to the legacy parity plan.

### Deferred to Follow-Up Work

- Expanded production smoke parity matrix (U6): this plan puts the scaffold in place and adds the minimal missing paths; a full parity sweep is separate work.
- Deeper Parent/Admin evidence surfaces: already tracked in the legacy parity plan (U9 there).

---

## Context & Research

### Relevant Code and Patterns

- `src/subjects/punctuation/read-model.js:503` — `securedRewardUnits: publishedRewardUnits.length` is the bug; should be `publishedRewardUnits.filter(u => u.secured || u.securedAt).length` or equivalent.
- `worker/src/subjects/punctuation/read-models.js:163-166` — `safeSummary` currently returns `cloneSerialisable(summary)` with no field filtering.
- `src/subjects/punctuation/module.js:55-61` — `startSession` spreads `roundLength` but silently drops `data?.skillId`.
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx` — active item controls use `disabled={false}`.
- `src/platform/game/monsters.js:184-188` — `MONSTERS_BY_SUBJECT.punctuation` currently lists seven ids including `colisk`, `hyphang`, `carillon`.
- `src/platform/game/mastery/shared.js:22` — `PUNCTUATION_GRAND_MONSTER_ID = 'carillon'` must become `'quoral'`.
- `shared/punctuation/content.js` — cluster `monsterId` values must be remapped to the new active roster.
- `src/subjects/punctuation/event-hooks.js` — `recordPunctuationRewardUnitMastery` is called with `monsterId` derived from `cluster.monsterId`; safe once content.js is updated.
- `src/platform/game/mastery/punctuation.js` — reward projection / compatibility normaliser target.
- `tests/punctuation-release-smoke.test.js` — current smoke; needs the parity matrix extension.
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx` — setup grouping, focus buttons for Endmarks and Apostrophe, copy fallback text.

### Institutional Learnings

- Build-sensitive checks in this repo must run sequentially; do not parallelise `npm test` and `npm run check`.
- Deterministic Worker/HTTP evidence is preferred over browser-smoke as the release gate.
- Monster visual config plan intentionally keeps dormant monsters in the asset manifest for Admin use.

### External References

- No external framework research needed; all patterns are present in the repo.

---

## Key Technical Decisions

- **Fix `securedRewardUnits` by filtering on reward-unit secured state, not publication state.** The current `publishedRewardUnits` list contains only keys that are tracked; we additionally need a `securedAt` or `status === 'secured'` field on each row to distinguish "tracked" from "actually secured".
- **Make `safeSummary` allowlist-based.** The summary phase must expose score, item count, mode, session duration, and per-item feedback rows — but must not expose accepted answers, validators, rubrics, or generator internals. Add an explicit allowlist function rather than cloning the raw summary.
- **Pass `skillId` through the local module start path.** The fix is a one-line spread addition. Keep the production Worker path as the canonical route; this fixes the local/dev inconsistency without adding new production surface.
- **Introduce a minimal UI state machine enum for submit controls.** Rather than a full state machine, add an `isSubmitting` boolean derived from a pending-command flag (already tracked in the React command adapter). Disable answer controls and the submit button when `isSubmitting` is true, `phase === 'feedback'`, `phase === 'summary'`, or `mode === 'gps'` before summary.
- **Move colisk/hyphang/carillon to a `punctuationReserve` key in `MONSTERS_BY_SUBJECT`.** This keeps them discoverable for Admin/asset workflows without including them in active Punctuation reward summaries.
- **Change `PUNCTUATION_GRAND_MONSTER_ID` from `carillon` to `quoral` with an explicit reservation constant.** Export `PUNCTUATION_RESERVED_MONSTER_IDS` at the same time so downstream code has a safe list to exclude from active display.
- **Remap cluster `monsterId` values in `shared/punctuation/content.js`.** Endmarks → `pealark`, Speech → `pealark`, Boundary → `pealark`; Apostrophe → `claspin`; Comma/flow → `curlune`, Structure → `curlune`. Published grand → `quoral`.
- **Add a compatibility normaliser in mastery/punctuation.js.** On read/projection, union old mastered keys from reserved monsters into their active-monster equivalents using the cluster mapping. Old Carillon grand state counts toward Quoral grand. Old Quoral direct Speech state counts toward Pealark. Do not delete stored entries.
- **Update `quoral` metadata to reflect the grand role.** `masteredMax: 14`, blurb updated to "The grand Bellstorm Coast creature for full Punctuation mastery."
- **Update `carillon` metadata to reflect the reserved state.** Blurb updated to indicate it is reserved for future expansion, not the active grand monster.
- **Fix overclaiming copy last (U6).** Copy should only change after the correctness bugs are fixed and the smoke matrix is expanded; the copy gate is the last thing to flip, not the first.

---

## Open Questions

### Resolved During Planning

- **Should old Quoral direct Speech evidence be discarded?** No. Normalise it into Pealark-direct and Quoral-grand buckets on read/projection, preserving the stored mastery keys.
- **Should old Carillon aggregate evidence be migrated?** Yes, into Quoral-grand read/projection only; the stored keys remain as-is.
- **Does `masteredMax` on `quoral` need to be 14 or 1?** 14. The current value of `1` reflects the old direct-Speech role. With the grand role, the denominator is all 14 published reward units.
- **Should the setup surface immediately say "full 14-skill complete"?** No. The plan's U6 fixes the copy to be accurate: the surface should describe what modes are strongest, then upgrade to "complete" copy only after the expanded smoke matrix passes.

### Deferred to Implementation

- Exact field names in the reward-unit state (e.g. `securedAt` vs `status === 'secured'`): implementer should read the current Worker reward-projection output format before writing the fix.
- Exact allowed fields in `safeSummary` allowlist: implementer should audit what the summary phase actually needs to expose to the React surface.
- Whether `masteredMax` on `quoral` should stay at 14 or dynamically derive from `publishedRewardUnits.length`: safe to hardcode 14 for the first release since the denominator is declared in the manifest.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
Cluster→Monster mapping (after this plan):
  endmarks   → pealark   (sentence endings, boundary)
  speech     → pealark
  boundary   → pealark
  apostrophe → claspin
  comma_flow → curlune
  structure  → curlune
  (all 14)   → quoral  [grand]

Reserved monsters (stay in MONSTERS, absent from active reward summaries):
  colisk, hyphang, carillon

Compatibility normaliser on read/projection:
  old quoral direct Speech mastered keys → add to pealark bucket (direct)
                                         + add to quoral bucket (grand)
  old carillon mastered keys             → add to quoral bucket (grand)
  old colisk/hyphang mastered keys       → add to curlune/pealark bucket (direct)
                                         + add to quoral bucket (grand)
  NOTE: stored entries are NOT deleted; the normaliser is a read-time view transform.
```

```text
securedRewardUnits fix:
  Before: publishedRewardUnits.length          (always equals tracked count)
  After:  publishedRewardUnits.filter(u => isSecured(u)).length
          where isSecured = u.securedAt is set OR u.status === 'secured'
```

---

## Implementation Units

- U1. **Fix securedRewardUnits and hasEvidence in client read model**

**Goal:** Correct `securedRewardUnits` in `src/subjects/punctuation/read-model.js` so it counts actually-secured units, not just tracked/published ones.

**Requirements:** R1

**Dependencies:** None.

**Files:**
- Modify: `src/subjects/punctuation/read-model.js`
- Modify: `tests/punctuation-read-model.test.js` (create if not present)

**Approach:**
- Identify what fields `currentPublishedRewardUnits` returns per row (check Worker reward projection output shape).
- Add an `isSecured(unit)` predicate — `true` if `unit.securedAt` is set and non-zero, or `unit.status === 'secured'`, or `unit.secured === true`.
- Replace `securedRewardUnits: publishedRewardUnits.length` with `securedRewardUnits: publishedRewardUnits.filter(isSecured).length` in both `progressSnapshot` and `overview`.
- Leave `trackedRewardUnits` as `publishedRewardUnits.length` (tracked ≠ secured).

**Patterns to follow:**
- `src/subjects/punctuation/read-model.js:181-190` — `currentPublishedRewardUnits` already filters by mastery key; extend the mapped shape here.

**Test scenarios:**
- Happy path: brand-new learner has 14 tracked reward units and 0 secured reward units.
- Happy path: a learner with 3 secured units shows `securedRewardUnits: 3`, `trackedRewardUnits: 14`.
- Happy path: `hasEvidence` is `true` when `attempts.length > 0` (unchanged) and `false` when `securedRewardUnits > 0` but `attempts.length === 0` is not a valid state (edge case: ensure `hasEvidence` is never driven by secured count alone).
- Edge case: a learner whose reward-unit state lacks `securedAt`, `secured`, or `status` fields shows 0 secured units.
- Edge case: `securedRewardUnits` never exceeds `trackedRewardUnits`.

**Verification:**
- Snapshot test for a zero-state learner confirms `securedRewardUnits: 0`.
- Snapshot test for a fully-secured learner confirms `securedRewardUnits === trackedRewardUnits`.

---

- U2. **Harden safeSummary with an allowlist in Worker read model**

**Goal:** Replace the clone-based `safeSummary` in `worker/src/subjects/punctuation/read-models.js` with an explicit allowlist and add a recursive forbidden-field scan across all read-model phases.

**Requirements:** R2

**Dependencies:** None (can run in parallel with U1).

**Files:**
- Modify: `worker/src/subjects/punctuation/read-models.js`
- Modify: `tests/worker-punctuation-runtime.test.js`

**Approach:**
- Define the summary allowlist: `total`, `correct`, `incorrect`, `sessionMode`, `label`, `rewardUnits` (as safe array of `{ rewardUnitId, clusterId, secured }`), `misconceptionTags`, `facets` (safe subset), `completedAt`, `sessionId`.
- Explicitly exclude: `accepted`, `answers`, `correctIndex`, `rubric`, `validator`, `seed`, `generator`, `hiddenQueue`, `unpublished`, full `items` with answer banks.
- Extend `FORBIDDEN_ITEM_FIELDS` to also be used as a recursive scan over summary and GPS review payloads.
- Add `assertNoForbiddenFields(obj)` — walks all nested keys, throws if any is in the forbidden set.
- Call `assertNoForbiddenFields` on summary, feedback, and GPS review before returning them.

**Patterns to follow:**
- `worker/src/subjects/punctuation/read-models.js:184-191` — existing `assertNoForbiddenItemFields` pattern; extend to recursive version.

**Test scenarios:**
- Happy path: a valid summary with `total`, `correct`, `sessionMode`, and `rewardUnits` passes the allowlist.
- Error path: a summary containing `accepted` throws the redaction error.
- Error path: a summary containing nested `rubric` inside a `facets` entry throws.
- Error path: a GPS review payload containing `validator` throws.
- Edge case: an empty summary returns a safe empty model without throwing.

**Verification:**
- Read-model tests fail if summary contains any field from `FORBIDDEN_ITEM_FIELDS`.
- Passing tests confirm GPS review and feedback phases do not expose forbidden fields.

---

- U3. **Pass skillId through local module start path**

**Goal:** Fix the `src/subjects/punctuation/module.js` `handleAction` for `punctuation-start` so that `data.skillId` is included in `service.startSession` options.

**Requirements:** R3

**Dependencies:** None.

**Files:**
- Modify: `src/subjects/punctuation/module.js`
- Modify: `tests/punctuation-module.test.js` (create if not present)

**Approach:**
- In the `punctuation-start` / `punctuation-start-again` block, add `...(data?.skillId ? { skillId: data.skillId } : {})` to the spread passed to `service.startSession`.
- No other changes to module.js.

**Patterns to follow:**
- `src/subjects/punctuation/module.js:55-61` — existing `roundLength` spread pattern.

**Test scenarios:**
- Happy path: `punctuation-start` with `data: { mode: 'guided', skillId: 'speech_direct' }` passes `skillId: 'speech_direct'` to `service.startSession`.
- Happy path: `punctuation-start` without `data.skillId` passes no `skillId` (unaffected default behaviour).
- Integration: guided start with `skillId: 'speech'` produces a speech-focused guided session in the local service path (not just Worker path).

**Verification:**
- Unit test confirms the spread includes `skillId` when present and omits it when absent.

---

- U4. **Add pending/read-only disabled state to React submit controls**

**Goal:** Disable answer input and submit button while a command is in-flight, after feedback is shown, in GPS mode before summary, and when the read model is in read-only/degraded state.

**Requirements:** R4

**Dependencies:** None (UI-only change).

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- Modify: `tests/react-punctuation-scene.test.js`

**Approach:**
- Derive `isDisabled` from: `isPending` (command in flight, sourced from the command adapter's pending flag), `phase === 'feedback'`, `phase === 'summary'`, `session?.mode === 'gps' && phase !== 'summary'`, or `availability?.status !== 'ready'`.
- Pass `disabled={isDisabled}` to all answer controls (choice buttons, text input) and the submit button.
- Do not add a full state machine — a single derived boolean is sufficient and keeps the component simple.

**Patterns to follow:**
- `src/subjects/spelling/components/SpellingPracticeSurface.jsx` — existing pending-disable pattern.

**Test scenarios:**
- Happy path: controls are enabled when `phase === 'active-item'` and `isPending === false`.
- Edge case: controls are disabled when `isPending === true` (double-click prevention).
- Edge case: controls are disabled when `phase === 'feedback'` (no late submit).
- Edge case: controls are disabled when `session.mode === 'gps'` and `phase !== 'summary'`.
- Edge case: controls are disabled when `availability.status !== 'ready'`.
- Happy path: controls re-enable when `phase` returns to `active-item` after feedback is cleared.

**Verification:**
- React tests confirm `disabled` attribute on submit button for each disabled scenario.
- No double-submit event log entries in smoke tests.

---

- U5. **Remap monster roster and add compatibility normaliser**

**Goal:** Change the active Punctuation monster roster from seven to four (`pealark`, `curlune`, `claspin`, `quoral`), move `colisk`/`hyphang`/`carillon` to a reserved list, update `PUNCTUATION_GRAND_MONSTER_ID`, remap cluster `monsterId` values, update `quoral` and `carillon` metadata, and add a compatibility normaliser for old mastery state.

**Requirements:** R5, R6, R7, R8, R9, R10

**Dependencies:** U1 (read model should use correct keys before normalisers run).

**Files:**
- Modify: `src/platform/game/monsters.js`
- Modify: `src/platform/game/mastery/shared.js`
- Modify: `shared/punctuation/content.js`
- Modify: `src/platform/game/mastery/punctuation.js` (create if not present)
- Modify: `tests/monster-system.test.js`
- Modify: `tests/punctuation-rewards.test.js`

**Approach:**
- In `monsters.js`: change `MONSTERS_BY_SUBJECT.punctuation` to `['pealark', 'curlune', 'claspin', 'quoral']` and add `punctuationReserve: ['colisk', 'hyphang', 'carillon']`. Update `quoral.masteredMax` to `14` and its blurb to reflect the grand role. Update `carillon.blurb` to reflect reserved/future status.
- In `shared.js`: change `PUNCTUATION_GRAND_MONSTER_ID` from `'carillon'` to `'quoral'`. Export `PUNCTUATION_RESERVED_MONSTER_IDS = Object.freeze(['colisk', 'hyphang', 'carillon'])`.
- In `shared/punctuation/content.js`: update each cluster's `monsterId` to the new active roster (endmarks/speech/boundary → `pealark`, apostrophe → `claspin`, comma_flow/structure → `curlune`). Update the grand entry `monsterId` to `quoral`.
- In `mastery/punctuation.js` (or equivalent projection file): add `RESERVED_TO_ACTIVE_PUNCTUATION_MONSTER` and `PUNCTUATION_CLUSTER_MONSTER_ID` maps. Add `normalisePunctuationMonsterState(rawState)` that returns a view with old reserved/stale keys merged into active-monster buckets. Called on read/projection, never mutating stored state.

**Compatibility normaliser rules:**
- Old `carillon` mastered keys → count toward `quoral` grand denominator.
- Old `quoral` Speech direct mastered keys (those whose mastery key contains `speech`) → count toward `pealark` direct AND `quoral` grand.
- Old `colisk` mastered keys → count toward `curlune` direct AND `quoral` grand.
- Old `hyphang` mastered keys → count toward `pealark` direct AND `quoral` grand.

**Patterns to follow:**
- `src/platform/game/mastery/shared.js` — existing monster-state helpers.
- `worker/src/projections/rewards.js` — existing reward projection that calls `recordPunctuationRewardUnitMastery`.

**Test scenarios:**
- Happy path: `MONSTERS_BY_SUBJECT.punctuation` is exactly `['pealark', 'curlune', 'claspin', 'quoral']`.
- Happy path: `MONSTERS_BY_SUBJECT.punctuationReserve` is exactly `['colisk', 'hyphang', 'carillon']`.
- Happy path: `PUNCTUATION_GRAND_MONSTER_ID` is `'quoral'`.
- Happy path: Speech reward units award `pealark` direct progress and `quoral` grand progress.
- Happy path: Structure reward units award `curlune` direct progress and `quoral` grand progress.
- Happy path: Boundary reward units award `pealark` direct progress and `quoral` grand progress.
- Happy path: securing all 14 reward units takes `quoral` to stage 4/grand.
- Edge case: `colisk`, `hyphang`, and `carillon` do not appear in active Punctuation summaries.
- Edge case: old `carillon` aggregate mastery state reads as `quoral` grand progress via the normaliser.
- Edge case: old `quoral` direct Speech state does not leave `quoral` stuck with `publishedTotal: 1`.
- Edge case: duplicate unit-secured events do not double-award mastery keys.
- Regression: existing Spelling tests for `inklet`, `glimmerbug`, `phaeton`, and `vellhorn` still pass unchanged.

**Verification:**
- `PUNCTUATION_GRAND_MONSTER_ID === 'quoral'` in the exported constant.
- Monster roster test confirms exactly four active and exactly three reserved.
- Spelling regression suite passes without changes.

---

- U6. **Fix overclaiming copy and expand release smoke**

**Goal:** Correct the learner-facing setup copy in `PunctuationPracticeSurface.jsx` and `docs/punctuation-production.md`, add missing Focus practice buttons (Endmarks, Apostrophe), and extend `tests/punctuation-release-smoke.test.js` to cover the parity matrix.

**Requirements:** R11, R12

**Dependencies:** U1, U2, U4, U5 (copy should only update once correctness bugs are fixed and roster is correct).

**Files:**
- Modify: `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- Modify: `docs/punctuation-production.md`
- Modify: `tests/punctuation-release-smoke.test.js`

**Approach:**
- Replace the hardcoded fallback "This Punctuation release covers all 14 KS2 punctuation skills" with an accurate description: "Punctuation covers the 14-skill progression, with production practice strongest in Smart Review, guided focus, GPS test, combining, paragraph repair, and transfer tasks."
- Add Endmarks and Apostrophe buttons to the Focus practice section (currently missing from the setup surface; all six focus clusters should be present).
- Rework setup grouping into three sections: Recommended (Smart Review, Guided Learn, Weak Spots, GPS Test), Focus practice (End marks, Apostrophes, Speech, Commas/flow, Sentence boundaries, Structural punctuation), Advanced writing tasks (Sentence combining, Paragraph repair, Transfer).
- In `docs/punctuation-production.md`: update the Events and Rewards section to reflect the new four-monster active roster plus three reserved. Fix the mastery key example from `punctuation:::` to `punctuation:<releaseId>:<clusterId>:<rewardUnitId>`. Add a sentence clarifying reserved monster status.
- In `tests/punctuation-release-smoke.test.js`: extend the smoke to add at minimum: Guided Speech mode (starts with teach box, no accepted answer leakage), Weak Spots with seeded weak evidence (selects weak unit first), GPS test (no feedback until summary), one focus-mode path (Endmarks), and Parent/Admin analytics (secured count correct for brand-new learner).

**Patterns to follow:**
- `tests/punctuation-release-smoke.test.js` — existing `smart` and GPS paths.
- `src/subjects/spelling/components/SpellingPracticeSurface.jsx` — setup grouping.

**Test scenarios:**
- Happy path: setup surface renders all three groups with all expected buttons.
- Happy path: Endmarks focus button sends `mode: 'endmarks'` command.
- Happy path: Apostrophe focus button sends `mode: 'apostrophe'` command.
- Happy path: setup copy does not contain "all 14 KS2 punctuation skills" as a hardcoded claim.
- Integration (smoke): Guided Speech path returns a teach box and no accepted answer in the read model.
- Integration (smoke): Weak Spots with seeded weak evidence selects the weak unit first.
- Integration (smoke): GPS test completes without exposing per-item feedback until summary.
- Integration (smoke): brand-new learner shows `securedRewardUnits: 0` in Parent/Admin analytics.

**Verification:**
- Setup surface renders without any hardcoded overclaiming string.
- Extended smoke passes with at least five distinct mode paths.
- `docs/punctuation-production.md` describes exactly four active monsters and three reserved ones.

---

## System-Wide Impact

- **Interaction graph:** `MONSTERS_BY_SUBJECT`, `PUNCTUATION_GRAND_MONSTER_ID`, and cluster `monsterId` values are imported by `event-hooks.js`, `mastery/shared.js`, `monster-system.js`, and `worker/src/projections/rewards.js`. All four must be consistent after this plan.
- **Compatibility normaliser:** Must be called before any active-monster stage display is computed. It is a read-time view transform, never a write mutation.
- **securedRewardUnits fix:** Affects client read model, Parent Hub overview, Admin Hub diagnostics, and any component that derives mastery % from this field.
- **safeSummary fix:** Any test that snapshots the summary phase of the Punctuation read model will need updating to reflect the allowlisted shape.
- **UI disabled state:** Affects all item-input and submit-button renders in `PunctuationPracticeSurface.jsx`. Does not affect the Worker command path.
- **Unchanged invariants:** The Worker command API (`POST /api/subjects/punctuation/command`), the learner state schema, and the 14-skill / 14-reward-unit manifest are all unchanged. Spelling reward behaviour is explicitly unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Old Quoral-as-Speech state leaves Quoral stuck at a wrong stage display | Compatibility normaliser merges old speech mastery keys into pealark + quoral grand buckets on read. Test explicitly for old state shapes. |
| safeSummary allowlist is too narrow, breaking the summary UI | Audit what `PunctuationPracticeSurface.jsx` actually reads from `summary` before writing the allowlist. Add a snapshot test for the summary phase. |
| Monster roster change breaks existing Codex display for learners with progress | Normaliser ensures old mastery keys count forward. Reserved monsters are hidden from active summaries but preserved in stored state. |
| securedRewardUnits fix changes displayed mastery % for learners who had inflated values | Expected and correct. Test confirms the new value is accurate. No learner loses stored mastery keys. |
| Spelling regression from touching shared mastery files | Explicitly run Spelling reward and monster-system tests after each change to shared.js and monsters.js. |
| Copy fix claims correctness before correctness bugs are fixed | U6 depends on U1-U5. Do not update copy or docs until the correctness bugs pass tests. |

---

## Documentation / Operational Notes

- Update `docs/punctuation-production.md` Events and Rewards section (in U6).
- Fix the mastery key example (`punctuation:::` → `punctuation:<releaseId>:<clusterId>:<rewardUnitId>`).
- Add sentence about reserved monsters being in asset manifest and Admin tooling only.
- Do not update docs until U1-U5 tests pass.

---

## Sources & References

- **Origin document:** [docs/plans/james/punctuation/punctuation-p2.md](james/punctuation/punctuation-p2.md)
- Upstream production plan: [docs/plans/2026-04-24-001-feat-punctuation-production-subject-plan.md](2026-04-24-001-feat-punctuation-production-subject-plan.md)
- Legacy parity plan: [docs/plans/2026-04-24-002-feat-punctuation-legacy-parity-plan.md](2026-04-24-002-feat-punctuation-legacy-parity-plan.md)
- `src/subjects/punctuation/read-model.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/module.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `src/platform/game/monsters.js`
- `src/platform/game/mastery/shared.js`
- `shared/punctuation/content.js`
- `src/subjects/punctuation/event-hooks.js`
- `tests/punctuation-release-smoke.test.js`
