---
title: "feat: Punctuation Legacy Parity"
type: feat
status: active
date: 2026-04-24
origin: docs/brainstorms/2026-04-24-punctuation-subject-engine-reward-blend-requirements.md
source_plan: docs/plans/2026-04-24-001-feat-punctuation-production-subject-plan.md
---

# feat: Punctuation Legacy Parity

## Overview

Fully port the remaining learner-facing Punctuation functionality from the legacy HTML donor into the current production subject without weakening the Worker-owned runtime that is already live.

The existing production release is real and deployed: it runs through `POST /api/subjects/punctuation/command`, covers all 14 KS2 punctuation skills, uses the Bellstorm Coast / Monster Codex projection, and has a production smoke gate. It is not yet feature-for-feature equivalent to the legacy HTML. This plan covers the missing parity layer: guided learning, dedicated weak spots, sentence combining, paragraph repair, true GPS test mode, richer transfer support, safe AI-assisted context compilation, and Parent/Admin reporting depth.

This plan intentionally creates a new parity line instead of reopening the shipped production subject plan. The production subject plan is now a live checklist for what has deployed; this plan is the implementation map for the remaining legacy functionality.

## Current State

Current production Punctuation already provides:

- Worker-owned command runtime through `worker/src/subjects/punctuation/commands.js`.
- Redacted read models through `worker/src/subjects/punctuation/read-models.js`.
- Deterministic marking, scheduling, service transitions, and reward events in `shared/punctuation/`.
- React setup, active item, feedback, and summary surfaces in `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`.
- All 14 skill ids and 14 stable reward units in `shared/punctuation/content.js`.
- Fixed item modes: `choose`, `insert`, `fix`, and `transfer`.
- Generated practice families for `insert` and `fix`.
- Production smoke coverage through `scripts/punctuation-production-smoke.mjs`.

Known parity gaps against the legacy HTML donor:

| Legacy capability | Current production state | Parity target |
|---|---|---|
| Guided learn | Not a first-class session mode | Add `guided` with teach boxes, worked/faded support, and support-aware mastery updates. |
| Sentence combining / rewrite | Not a first-class item or session mode | Add `combine` items, generators, deterministic validators, and UI copy. |
| Paragraph repair | Not a first-class item or session mode | Add `paragraph` passage items, multiline marking, scheduler weighting, and review UI. |
| Weak spots drill | Only implicit weak weighting inside smart selection | Add explicit `weak` start mode that targets weak skill-by-mode facets. |
| True GPS test mode | Not implemented | Add `gps` with fixed length, no hints, delayed feedback, and end-of-test review. |
| Rich transfer breadth | Constrained transfer exists, but narrower than legacy | Expand transfer validators and evidence without claiming free-writing marking. |
| AI explanation/context pack | Browser API-key flow is intentionally absent | Rebuild as server-side optional enrichment and deterministic compiler input only. |
| Analytics | Skill rows, reward units, recent mistakes exist | Add mode/session analytics, weakest facets, daily goal, streak, and Parent/Admin evidence surfaces. |

## Requirements Trace

- R1. Preserve the existing production authority boundary: Worker commands own item selection, marking, scheduling, persistence, rewards, analytics, and read models.
- R2. Preserve the current 14-skill release and stable reward-unit denominator unless a later content release intentionally changes it.
- R3. Characterise legacy behaviour before porting each missing mode so the implementation does not silently lose donor functionality.
- R4. Add `guided` as a first-class start mode with skill focus, teach material, worked examples, self-check prompts, and faded support.
- R5. Guided support must reduce or label mastery evidence; supported answers must not count the same as unsupported clean retrieval.
- R6. Add `weak` as a first-class drill mode that targets weak or due skill-by-mode facets, not merely broad cluster focus.
- R7. Add `combine` item mode and session routing for sentence combining/rewrite tasks.
- R8. Add `paragraph` item mode and session routing for mixed short-passage proofreading.
- R9. Add `gps` test mode with no self-check/help during the test, delayed feedback, fixed length, session scoring, and detailed end review.
- R10. Expand transfer coverage through deterministic validators and rubric facets only; do not mark unconstrained free writing as fully correct without explicit testable criteria.
- R11. Rebuild the legacy AI lane as optional server-side enrichment that proposes safe vocabulary/context atoms; deterministic code must still compile and mark all score-bearing items.
- R12. Do not store learner-provided AI keys in the browser or call AI providers directly from the client.
- R13. Expand analytics to cover session mode, item mode, skill-by-mode facets, weak/due/secure counts, daily goal, streak, recent mistakes, and misconception patterns.
- R14. Surface Punctuation evidence in Parent/Admin read models without exposing hidden answers, rubrics, generator seeds, or learner-sensitive raw response text beyond existing platform policy.
- R15. Keep bundle/public-output lockdown as a release gate for all new parity code.
- R16. Keep English Spelling and Grammar parity intact while extending shared hubs, command routing, or reward surfaces.

## Scope Boundaries

- Do not serve the legacy HTML as a production route.
- Do not restore the legacy localStorage database as a source of truth.
- Do not move Punctuation marking, queue selection, generated-content authority, rewards, or analytics authority into React.
- Do not ship browser-held AI provider keys or browser-direct provider calls.
- Do not let AI author final score-bearing questions, mark answers, or bypass deterministic validators.
- Do not broaden Monster Codex denominators just because extra generated templates exist.
- Do not redesign the whole subject shell, Parent Hub, Admin Hub, or content-management model.
- Do not change Cloudflare deployment authentication strategy.

## Sources And Existing Patterns

- `docs/brainstorms/2026-04-24-punctuation-subject-engine-reward-blend-requirements.md` remains the origin for production boundary, skill map, reward model, and release-gate requirements.
- `docs/plans/2026-04-24-001-feat-punctuation-production-subject-plan.md` records the shipped production line and current follow-up scope.
- `docs/punctuation-production.md` documents the current release id, fixed modes, generated practice, Worker runtime, reward projection, read-model lockdown, and smoke gate.
- `shared/punctuation/service.js` is the production service boundary for session transitions, marking calls, memory mutation, analytics, and domain events.
- `shared/punctuation/scheduler.js` is the selection boundary for mode, cluster, weak/due weighting, and secure thresholds.
- `shared/punctuation/marking.js` is the deterministic marking and facet boundary.
- `shared/punctuation/content.js` and `shared/punctuation/generators.js` hold the current item and generator manifests.
- `worker/src/subjects/punctuation/read-models.js` is the allowlist boundary for browser-visible state.
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx` is the thin React rendering surface.
- `src/platform/hubs/parent-read-model.js`, `src/surfaces/hubs/ParentHubSurface.jsx`, `src/platform/hubs/admin-read-model.js`, and `src/surfaces/hubs/AdminHubSurface.jsx` are the reporting surfaces to extend carefully.
- `scripts/punctuation-production-smoke.mjs`, `tests/punctuation-release-smoke.test.js`, `tests/worker-punctuation-runtime.test.js`, and `tests/browser-react-migration-smoke.test.js` are the release-gate patterns to follow.

The legacy HTML donor and audit were supplied by James as local reference material. Implementation should import only minimal repo-local fixtures or oracle snapshots where needed; the plan and tests should not depend on an absolute local path.

## Key Technical Decisions

- **Characterise first:** Each missing legacy mode should start with a small parity baseline and explicit acceptance examples before implementation changes. This reduces risk of "ported" UI that lacks the legacy learning behaviour.
- **Add session modes separately from item modes:** Legacy has both session choices such as `guided`, `weak`, and `gps`, and item types such as `combine` and `paragraph`. Production should model that distinction instead of overloading cluster focus modes.
- **Keep cluster focus modes:** Existing `endmarks`, `apostrophe`, `speech`, `comma_flow`, `boundary`, and `structure` modes remain useful focused practice. New modes should coexist with them.
- **Make guided evidence explicit:** Guided help should write support metadata into attempts/facets. A supported correct answer may improve learning state, but should not secure a reward unit by itself.
- **Make GPS evidence explicit:** GPS answers should update learning evidence after the test, but the learner should not receive item-by-item feedback until the end.
- **Use deterministic validators for broader modes:** `combine`, `paragraph`, and richer `transfer` can support variants, but every accepted path must be represented as rules, accepted variants, or tested facets.
- **Treat AI as enrichment, not authority:** AI may propose vocabulary/context atoms behind the Worker, but deterministic sanitisation and compiler code decide what enters practice. No AI response should become a score-bearing item without validation.
- **Keep read models phase-specific:** Active sessions can show prompts, stems, safe options, teach material, and input constraints. Feedback/review may show attempted answers, safe corrections, explanations, and facets. Hidden answer banks, rubric internals, validator definitions, generator seeds, and unpublished pools stay server-only.
- **Expand analytics incrementally:** Add learner evidence first, then Parent/Admin projections. Do not block mode parity on a full analytics redesign.

## Output Structure

Expected touched or new areas:

```text
shared/punctuation/
  content.js
  generators.js
  marking.js
  scheduler.js
  service.js
  events.js
  legacy-parity.js
  context-packs.js
src/subjects/punctuation/
  service-contract.js
  command-actions.js
  client-read-models.js
  components/
    PunctuationPracticeSurface.jsx
    punctuation-view-model.js
worker/src/subjects/punctuation/
  commands.js
  engine.js
  read-models.js
  ai-enrichment.js
src/platform/hubs/
  parent-read-model.js
  admin-read-model.js
src/surfaces/hubs/
  ParentHubSurface.jsx
  AdminHubSurface.jsx
scripts/
  punctuation-production-smoke.mjs
tests/
  fixtures/punctuation-legacy-parity/
  punctuation-legacy-parity.test.js
  punctuation-guided.test.js
  punctuation-combine.test.js
  punctuation-paragraph.test.js
  punctuation-gps.test.js
  punctuation-ai-context-pack.test.js
  punctuation-analytics.test.js
  worker-punctuation-runtime.test.js
  react-punctuation-scene.test.js
  hub-read-models.test.js
  react-hub-surfaces.test.js
```

## Implementation Units

- [x] U1. **Create a Legacy Parity Baseline**

**Goal:** Convert the donor HTML expectations into a durable repo-local parity matrix before changing production behaviour.

**Files:**

- `shared/punctuation/legacy-parity.js`
- `tests/fixtures/punctuation-legacy-parity/legacy-baseline.json`
- `tests/punctuation-legacy-parity.test.js`
- `docs/punctuation-production.md`

**Approach:**

- Record the legacy skill ids, session modes, item modes, settings surface, analytics concepts, and AI context-pack constraints as a static baseline fixture.
- Compare current production capabilities against that baseline and label each row as `ported`, `planned`, `rejected`, or `replaced`.
- Keep rejected rows explicit: browser API-key AI, localStorage authority, and single-file app routing are intentionally not parity targets.
- Use this test as a guardrail for the remaining units, not as a mandate to copy the HTML architecture.

**Test Scenarios:**

- `tests/punctuation-legacy-parity.test.js` confirms all 14 legacy skill ids remain present in `shared/punctuation/content.js`.
- It confirms current production has the shipped `choose`, `insert`, `fix`, and `transfer` item modes.
- It confirms `combine`, `paragraph`, and `gps` are tracked as open parity rows, while `guided` and `weak` are marked ported after U2/U3.
- It confirms browser API-key AI and localStorage authority are marked `rejected`, not accidentally planned.
- It fails if a parity row has no owner unit.

---

- [x] U2. **Add Guided Learn Mode**

**Goal:** Port legacy guided learning as a first-class production session mode with teach material, focused skill selection, worked examples, faded help, and support-aware evidence.

**Files:**

- `src/subjects/punctuation/service-contract.js`
- `shared/punctuation/content.js`
- `shared/punctuation/scheduler.js`
- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/command-actions.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `src/subjects/punctuation/components/punctuation-view-model.js`
- `tests/punctuation-guided.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/react-punctuation-scene.test.js`

**Approach:**

- Add `guided` to normalised start modes while preserving existing cluster focus modes.
- Add safe teach material per skill: rule, common mistake, worked example, and next-step self-check prompt.
- Allow guided sessions to select a skill focus. If no skill is chosen, choose the weakest eligible skill or a sensible new-skill default.
- Add `supportLevel` or equivalent metadata to session state and attempt records.
- Decay guided help after clean answers and restore it after misses.
- Keep answer banks and validator internals out of the active read model.

**Test Scenarios:**

- Starting `guided` returns an active session with `session.mode === 'guided'` and a safe teach box for the chosen skill.
- Starting `guided` with an invalid skill falls back to a valid focus without throwing.
- A supported correct answer updates item/facet evidence but does not immediately secure a reward unit.
- Guided help decreases after a correct answer and increases or remains available after an incorrect answer.
- The active guided read model does not expose accepted answers, rubrics, validators, generator seeds, or hidden pools.
- React renders the guided skill chooser, teach box, and normal submit path.

---

- [x] U3. **Add Dedicated Weak Spots Drill**

**Goal:** Port the legacy `weak` mode as an explicit drill that targets fragile skill-by-mode facets and due items.

**Files:**

- `src/subjects/punctuation/service-contract.js`
- `shared/punctuation/scheduler.js`
- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `tests/punctuation-scheduler.test.js`
- `tests/punctuation-service.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/react-punctuation-scene.test.js`

**Approach:**

- Add `weak` as a start mode separate from `smart`.
- Build candidate selection from weak and due item memory plus weak skill-by-mode facets.
- Prefer production item modes where the learner has missed recently, but keep enough variation to avoid repeating the same item.
- If no weak evidence exists, fall back to due/new mixed review with honest copy.
- Surface weak-focus chips in the read model without exposing hidden scheduler internals.

**Test Scenarios:**

- A learner with a weak `speech::insert` facet starts `weak` and receives a Speech insertion or closely related item before unrelated new content.
- `weak` mode avoids repeating the same recent item when alternatives exist.
- A learner with no weak evidence can still start `weak` and receives a setup/fallback state that is not broken.
- Attempt records include `sessionMode: 'weak'` or equivalent analytics metadata.
- React exposes a Weak spots start control and shows weak-focus information safely.

---

- [ ] U4. **Add Sentence Combining / Rewrite Mode**

**Goal:** Port legacy `combine` tasks for sentence combining and rewrite practice.

**Files:**

- `shared/punctuation/content.js`
- `shared/punctuation/generators.js`
- `shared/punctuation/marking.js`
- `shared/punctuation/scheduler.js`
- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `tests/punctuation-combine.test.js`
- `tests/punctuation-generators.test.js`
- `tests/punctuation-marking.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/react-punctuation-scene.test.js`

**Approach:**

- Add `combine` as a score-bearing item mode.
- Start with deterministic combine validators for legacy-shaped tasks: list-comma combination, fronted adverbial rewrite, parenthesis rewrite, colon-list combination, semi-colon clause combination, and dash clause combination.
- Preserve target words and clause order unless an item explicitly allows variants.
- Add generated `combine` families only after fixed items and validators are covered.
- Add mode-specific scheduler support so `smart`, `weak`, and focused sessions can select `combine` at controlled frequency.

**Test Scenarios:**

- A semi-colon combine item accepts one sentence joining the preserved clauses with a semi-colon and rejects a comma splice.
- A dash combine item accepts a spaced dash between preserved clauses and rejects an unpunctuated join.
- A parenthesis combine item accepts matched commas, brackets, or dashes only when the extra detail is correctly placed.
- Generated `combine` items have deterministic ids and model answers under a fixed seed.
- Active read models expose prompt/stem/input constraints but not validators or accepted variants.
- React renders combine tasks as text-entry rewrite tasks with stable layout.

---

- [ ] U5. **Add Paragraph Repair Mode**

**Goal:** Port legacy short-passage proofreading where one item can exercise several punctuation skills together.

**Files:**

- `shared/punctuation/content.js`
- `shared/punctuation/generators.js`
- `shared/punctuation/marking.js`
- `shared/punctuation/scheduler.js`
- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `tests/punctuation-paragraph.test.js`
- `tests/punctuation-marking.test.js`
- `tests/punctuation-generators.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/react-punctuation-scene.test.js`

**Approach:**

- Add `paragraph` as a score-bearing item mode with multiline-safe normalisation.
- Start with fixed legacy-shaped passage families: fronted adverbial plus speech, parenthesis plus speech, colon plus semi-colon, bullet list consistency, and apostrophe mix.
- Model paragraph marking as a set of required facets rather than one opaque exact answer where variants are legitimate.
- Attribute facet evidence to each skill in the item so analytics can show mixed-passage weaknesses.
- Tune `smart` mode so paragraph repair appears regularly but not on every round.

**Test Scenarios:**

- A paragraph item accepts a fully repaired passage with newline formatting normalised where appropriate.
- It rejects an answer that fixes sentence endings but leaves speech punctuation wrong.
- It returns misconception tags for each failed required facet.
- Skill/facet memory updates every skill included in the mixed item.
- Bullet-list paragraph items preserve line breaks in read models and React output.
- The active read model never exposes the complete accepted answer list before submission.

---

- [ ] U6. **Add True GPS Test Mode**

**Goal:** Port legacy GPS-style test behaviour with delayed feedback and end-of-test review.

**Files:**

- `src/subjects/punctuation/service-contract.js`
- `shared/punctuation/service.js`
- `shared/punctuation/scheduler.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/command-actions.js`
- `src/subjects/punctuation/client-read-models.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `tests/punctuation-gps.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/react-punctuation-scene.test.js`

**Approach:**

- Add `gps` start mode with normalised `testLength` or mapped round length.
- Preselect or lock a bounded test queue at session start so the learner cannot gain advantage from feedback-driven selection during the same test.
- Store per-question responses internally, but return no correctness, correction, model answer, or teach help until the test finishes.
- On completion, return a review model with item result summaries, safe corrections, misconceptions, and next-practice recommendations.
- Keep GPS attempts eligible for learning evidence, but avoid immediate reward celebration until the completed test is processed.

**Test Scenarios:**

- Starting `gps` creates a session with a fixed queue length between the accepted min and max.
- Submitting a GPS answer advances to the next item without exposing correctness or model answers.
- Self-check and guided help are absent in GPS read models.
- The final GPS summary includes score, per-item review entries, misconception tags, and recommended follow-up mode.
- GPS command replay or stale revision does not duplicate attempts or rewards.
- React renders GPS progress, no-feedback active steps, and the final review list.

---

- [ ] U7. **Expand Transfer Validators And Evidence**

**Goal:** Bring the current constrained transfer work closer to the legacy breadth without pretending to judge unconstrained writing.

**Files:**

- `shared/punctuation/content.js`
- `shared/punctuation/generators.js`
- `shared/punctuation/marking.js`
- `shared/punctuation/service.js`
- `tests/punctuation-marking.test.js`
- `tests/punctuation-generators.test.js`
- `tests/punctuation-service.test.js`

**Approach:**

- Review each legacy transfer pattern and classify it as exact, constrained variant, rubric-facet, or unsafe-to-score.
- Add deterministic validators for safe constrained cases only.
- Attach clear `facets` and misconception tags so transfer misses feed analytics.
- Keep unsafe-to-score free writing as prompt-only or future teacher-review material, not automatic mastery evidence.

**Test Scenarios:**

- Transfer validators accept intended variants for fronted adverbials, speech, parenthesis, colon lists, semi-colons, dashes, bullet lists, and hyphens.
- They reject answers that preserve the punctuation mark but change required target words.
- They return useful facet failure labels for missing punctuation, changed words, capitalisation, and terminal punctuation.
- Transfer attempts update `skillId::transfer` facets separately from insertion/fix facets.
- Reward units require durable evidence and do not secure from a single transfer answer.

---

- [ ] U8. **Add Safe AI Context Pack Compiler**

**Goal:** Replace the legacy browser AI lane with a production-safe enrichment path that can help generate vocabulary/context atoms while deterministic code remains the authority.

**Files:**

- `worker/src/subjects/punctuation/ai-enrichment.js`
- `worker/src/subjects/punctuation/commands.js`
- `shared/punctuation/context-packs.js`
- `shared/punctuation/generators.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `scripts/audit-client-bundle.mjs`
- `scripts/production-bundle-audit.mjs`
- `tests/punctuation-ai-context-pack.test.js`
- `tests/worker-punctuation-runtime.test.js`
- `tests/bundle-audit.test.js`

**Approach:**

- Add an optional Worker command for requesting context-pack suggestions only if an environment-backed provider is configured.
- Accept only constrained JSON atoms such as names, places, list nouns, fronted adverbial phrases, speech commands/questions, parenthesis phrases, stems, and hyphen compound rows.
- Sanitise, deduplicate, size-limit, and reject punctuation-bearing atoms before they reach generators.
- Compile generated practice through existing deterministic generator families.
- Return a safe summary to React: accepted count, rejected count, and affected generator families. Do not return provider prompts, raw model text, provider keys, or hidden validation internals.
- Update bundle audit to fail on browser-side AI provider key flows for Punctuation.

**Test Scenarios:**

- The compiler accepts valid atoms and rejects atoms containing punctuation that would leak answer structure.
- Duplicate or oversized atoms are rejected deterministically.
- The Worker command is unavailable or returns a named configuration error when no server provider is configured.
- Generated items from context packs still pass deterministic marking tests.
- Read models expose only safe context-pack summaries.
- Bundle audit fails if browser code contains Punctuation AI API-key storage or provider endpoint calls.

---

- [ ] U9. **Expand Analytics And Parent/Admin Evidence**

**Goal:** Port the legacy analytics depth into production read models and adult reporting surfaces.

**Files:**

- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/read-models.js`
- `src/subjects/punctuation/client-read-models.js`
- `src/platform/hubs/parent-read-model.js`
- `src/platform/hubs/admin-read-model.js`
- `src/surfaces/hubs/ParentHubSurface.jsx`
- `src/surfaces/hubs/AdminHubSurface.jsx`
- `tests/punctuation-analytics.test.js`
- `tests/hub-read-models.test.js`
- `tests/react-hub-surfaces.test.js`

**Approach:**

- Extend attempt records to include session mode, item mode, support metadata, GPS/test flag, and safe facet outcomes.
- Add analytics rows for `bySessionMode`, `byItemMode`, `weakestFacets`, `recentMistakes`, daily goal progress, and streak.
- Add Parent Hub overview values for Punctuation accuracy, due/weak/secure units, current focus, and misconception patterns.
- Add Admin Hub readable diagnostics for published release id, tracked reward units, sessions, weak patterns, and production exposure status.
- Avoid raw answer dumps in adult surfaces; show labels, facets, counts, and timestamps.

**Test Scenarios:**

- Analytics calculate attempts and accuracy by session mode and item mode.
- Weakest facets sort by weak/due state and low mastery.
- Recent mistakes include safe item labels and misconception tags, not hidden answer banks.
- Parent Hub merges Punctuation evidence with Spelling and Grammar without dropping existing fields.
- Admin Hub includes Punctuation release diagnostics without requiring admin-only mutation paths.
- React hub surfaces render Punctuation evidence in empty, partial, and evidence-rich states.

---

- [ ] U10. **Update Production Smoke, Documentation, And Release Gate**

**Goal:** Make full legacy parity independently verifiable before claiming it is deployed.

**Files:**

- `scripts/punctuation-production-smoke.mjs`
- `tests/punctuation-release-smoke.test.js`
- `tests/browser-react-migration-smoke.test.js`
- `tests/punctuation-performance.test.js`
- `tests/bundle-audit.test.js`
- `docs/punctuation-production.md`
- `docs/plans/2026-04-24-002-feat-punctuation-legacy-parity-plan.md`

**Approach:**

- Extend smoke checks to exercise one representative advanced mode without making production smoke slow or brittle.
- Keep the production smoke deterministic: create an isolated demo session, start a mode, answer with source-backed expected answers inside the script, and assert Worker-owned read models.
- Add read-model forbidden-key scans for new review/analytics surfaces.
- Add performance coverage for expanded manifest size and mixed-mode scheduling.
- Update docs with the exact parity claim and remaining rejected legacy behaviours.
- Preserve the existing Spelling smoke assertion so Punctuation work does not regress the reference subject.

**Test Scenarios:**

- Release smoke starts `smart`, one advanced mode, and Spelling successfully through Worker command paths.
- It asserts no active or review read model exposes accepted answers, validators, rubrics, seeds, hidden queues, or raw generators.
- Browser migration smoke can open Punctuation and complete a representative non-choose item through summary.
- Performance tests keep expanded scheduling bounded under a manifest with fixed, generated, combine, and paragraph items.
- Docs state which legacy behaviours are fully ported, replaced, and intentionally rejected.

## Sequencing

Recommended order:

1. U1 first, because it defines the parity contract and prevents scope drift.
2. U2 and U3 next, because guided and weak modes reuse current item types and validate the session-mode architecture.
3. U4 and U5 after that, because `combine` and `paragraph` add new item-mode marking risk.
4. U6 after new item modes are stable, so GPS can test a richer item mix.
5. U7 alongside U4/U5 or immediately after, depending on validator complexity.
6. U8 later, because AI enrichment depends on stable deterministic generators and should not block core parity.
7. U9 after attempts and modes carry the right metadata.
8. U10 at the end of each shipped slice and again before the full parity claim.

Implementation can ship in multiple PRs. Each PR should leave Punctuation production-safe and should not expose a mode before its Worker, read model, React surface, tests, and smoke path are ready.

## Acceptance Examples

- AE1. Given a learner starts `guided` for Speech, the read model shows safe teaching material and a Speech item, but no accepted answer list or rubric internals.
- AE2. Given a learner answers correctly with guided help, the attempt records support metadata and does not secure the Speech reward unit from that one supported answer.
- AE3. Given a learner has weak `apostrophe_possession::fix` evidence, `weak` mode prioritises an apostrophe possession repair task before unrelated new skills when eligible.
- AE4. Given a sentence-combining prompt asks for a semi-colon, the marker accepts preserved clauses joined by a semi-colon and rejects a comma splice.
- AE5. Given a paragraph repair item mixes fronted adverbials, lists, and speech, an answer that fixes only the list commas returns targeted facet failures for the remaining skills.
- AE6. Given a learner is in `gps`, submitting an answer advances without immediate correctness, model answer, self-check prompt, or celebration.
- AE7. Given GPS finishes, the summary shows score, review rows, misconception tags, and follow-up recommendations.
- AE8. Given AI context-pack enrichment is configured, invalid punctuation-bearing atoms are rejected before they can influence generated practice.
- AE9. Given a parent opens Parent Hub after Punctuation attempts, the model includes Punctuation due/weak/accuracy evidence without exposing raw hidden answers.
- AE10. Given the production smoke runs after parity deployment, it proves at least one advanced mode and one Spelling session still work through Worker-owned read models.

## Risks And Mitigations

- **Risk: Parity becomes a browser HTML copy.** Mitigate with U1 rejected rows, bundle audit rules, and Worker-only command paths.
- **Risk: `combine` and `paragraph` marking becomes too permissive.** Mitigate with facet validators, negative tests, and exact acceptance examples per item family.
- **Risk: Guided support inflates mastery.** Mitigate with support metadata and reward gating that requires unsupported clean evidence.
- **Risk: GPS delayed feedback complicates persistence and replay.** Mitigate with fixed queues, per-response records, stale-transition tests, and idempotent completion.
- **Risk: Parent/Admin surfaces overexpose learner answers.** Mitigate with safe summaries, labels, counts, and existing hub permission boundaries.
- **Risk: AI scope expands into runtime marking.** Mitigate by limiting AI to optional context atoms and enforcing deterministic compiler tests.
- **Risk: Expanded content slows Worker commands.** Mitigate with indexed manifests, bounded candidate windows, and performance tests.

## Release Gate

Before any parity slice deploys:

- Run `npm test`.
- Run `npm run check`.
- Run the existing bundle/public-output audit through the package scripts that include it.
- Run targeted Punctuation tests for the affected modes.
- Update `scripts/punctuation-production-smoke.mjs` when the slice changes production-visible modes.

After deployment:

- Run `npm run smoke:production:punctuation`.
- Verify the production UI on `https://ks2.eugnel.uk` with a logged-in or demo session when the slice affects learner-facing flow.
- Confirm Spelling still starts through the smoke path.

## Open Questions

- Should `guided` be exposed as one generic mode with a skill chooser, or as a "Learn" tab inside each cluster focus? Default assumption: one generic mode with a skill chooser because it maps cleanly to legacy behaviour and keeps command routing simple.
- Should `gps` use `roundLength` or a separate `testLength` preference? Default assumption: keep `roundLength` for command compatibility and allow the UI label to present it as test length.
- Should AI context packs be user-visible in the first parity pass? Default assumption: no. Implement the safe Worker compiler first, then decide whether to expose controls.
- How much Parent/Admin reporting belongs in the first parity PR? Default assumption: enough to prove Punctuation evidence is present, then deepen charts later.
