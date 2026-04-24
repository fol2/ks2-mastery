---
date: 2026-04-24
topic: punctuation-production-subject-blend
---

# Punctuation Production Subject Blend

## Problem Frame

Punctuation needs to become a real production subject on `ks2.eugnel.uk`, not a copied legacy HTML app and not only a reward-design concept. The legacy Punctuation engine is valuable because it already models punctuation as durable writing skill: retrieval, discrimination, mark placement, proofreading, paragraph repair, and transfer into learner-authored sentences.

The production product should blend four things into one working subject:

- the legacy engine's pedagogy, content, scheduler, marking, and analytics ideas
- the current KS2 Mastery Worker command runtime and full-lockdown boundary
- the React subject shell, region art, and Monster Codex reward system
- a release plan that can be deployed, verified, and safely expanded

The game layer must make mastery visible through Bellstorm Coast monsters and evolution, but it must sit on top of the learning engine. It must not weaken marking, bypass the Worker boundary, or let client-side generated content become the source of truth.

Evidence used:

- `docs/plans/james/punctuation/punctuation-conversation.md`
- Legacy supplied reference: `ks2_punctuation_mastery_v6_1_engine_review.html`
- Legacy supplied audit: `ks2_punctuation_engine_audit_report_zh-HK.md`
- Current platform references: `docs/subject-expansion.md`, `docs/brainstorms/2026-04-23-full-lockdown-demo-session-requirements.md`, `docs/plans/2026-04-23-001-feat-full-lockdown-runtime-plan.md`, `worker/README.md`, `worker/src/subjects/runtime.js`, `worker/src/subjects/spelling/commands.js`, `src/platform/game/monsters.js`, `src/platform/game/monster-system.js`

---

## Actors

- A1. Learner: Practises punctuation and receives feedback, progress, and rewards.
- A2. Parent or adult evaluator: Reads learner progress and weak spots through reporting surfaces.
- A3. React client: Renders the Punctuation UI, region art, monsters, forms, and returned read models.
- A4. Worker runtime: Owns session creation, item selection, marking, scheduling, progress mutation, events, rewards, and read models.
- A5. Punctuation engine: Deterministic subject service extracted from the legacy donor engine.
- A6. Monster Codex projection: Converts secure Punctuation progress into additive creature unlock, level, and evolution events.
- A7. Deployment verifier: Confirms local tests, bundle audit, preview/demo behaviour, and production behaviour before the subject is claimed live.

---

## Key Flows

- F1. Scientific practice loop
  - **Trigger:** A learner starts Punctuation Smart Review or a focused drill.
  - **Actors:** A1, A3, A4, A5
  - **Steps:** The Worker selects an item from the deterministic Punctuation service, React renders the prompt, the learner answers, the Worker marks the response, updates item and facet memory, records error tags, and returns feedback plus the next authorised state.
  - **Outcome:** The learner improves punctuation skill through spaced, interleaved, production-heavy practice rather than recognition-only quiz behaviour.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R15, R16, R19, R20, R21, R22

- F2. Monster reward projection
  - **Trigger:** A Punctuation reward mastery unit becomes secure for the first time.
  - **Actors:** A1, A4, A6
  - **Steps:** The Worker emits a Punctuation secure-unit event, the reward projection maps it to one of six Punctuation monster lines, aggregate progress updates the grand legendary line, and React shows any caught, level-up, evolve, or mega celebration returned by the command response.
  - **Outcome:** The game layer makes progress exciting without changing the marking or scheduling rules.
  - **Covered by:** R8, R9, R10, R11, R12, R13, R14, R17, R23

- F3. Bellstorm Coast presentation
  - **Trigger:** A learner opens Punctuation setup, practice, summary, or Codex surfaces.
  - **Actors:** A1, A3
  - **Steps:** React uses server read models to choose the current Bellstorm Coast scene and monster state, then renders the already-provided region and monster assets from the standard asset paths.
  - **Outcome:** Punctuation feels like its own world while staying attached to the shared subject shell and reward system.
  - **Covered by:** R10, R11, R14, R18, R24, R25

- F4. Production release gate
  - **Trigger:** The Punctuation implementation is ready to merge or deploy.
  - **Actors:** A4, A7
  - **Steps:** The release runs local tests and checks, verifies the Worker command path, audits the production bundle/public output, smoke-tests demo or logged-in production access, and blocks release if the client bundle exposes forbidden engine authority.
  - **Outcome:** James can trust that Punctuation is live as a server-owned subject rather than a local prototype shipped by accident.
  - **Covered by:** R26, R27, R28, R29, R30

---

## Requirements

**Scientific Learning Layer**

- R1. Punctuation must be treated as a writing-skill subject, not a multiple-choice-only quiz. The practice mix must include recognition, punctuation insertion, proofreading repair, sentence combining, paragraph repair, and transfer into fuller writing.
- R2. The canonical skill map must preserve the 14 legacy atomic skills: sentence endings, list commas, apostrophe contractions, apostrophe possession, speech punctuation, fronted adverbials, parenthesis, comma clarity, colon before list, semi-colons between clauses, dash clauses, semi-colons in lists, bullet points, and hyphens.
- R3. The learning loop must preserve the legacy five-stage Smart Review rhythm: retrieve, discriminate, place marks, proofread, transfer.
- R4. A single correct answer must not equal mastery. Secure status must require repeated clean performance, adequate spacing, streak evidence, and sufficient accuracy.
- R5. The production secure rule should be based on the legacy secure bucket unless planning finds a stronger tested variant: accuracy at least 80%, streak at least 3, spacing interval at least 7 days, and no active weak/lapse state.
- R6. Analytics should preserve the legacy distinction between item mastery and skill-facet mastery. Item mastery may use the legacy weighting of accuracy, spacing, and streak; facet mastery may use a skill plus practice-job key such as `skillId::mode`.
- R7. Marking must be deterministic. Exact-answer tasks may use accepted variants; transfer tasks must use explicit validators or rubric facets such as sentence boundary, target mark present, target position, capitalisation, speech punctuation inside quotes, and unwanted punctuation.
- R8. Misconception tags must be preserved from legacy content and generated items, then exposed through the Punctuation analytics snapshot for future Parent/Admin reporting.
- R9. Generated practice must be deterministic under fixed seed/time inputs. AI context packs may supply safe vocabulary later, but they must not author final questions, mark answers, or bypass the local compiler/Worker engine.

**Reward and Monster Layer**

- R10. Punctuation should use seven main monster lines: six cluster monsters plus one grand legendary aggregate. This keeps the set large enough to feel collectible without turning every atomic punctuation mark into a separate creature.
- R11. The six cluster monsters must cover all 14 atomic skills:
  - Endmarks: sentence endings.
  - Apostrophe: apostrophe contractions and apostrophe possession.
  - Speech: inverted commas and speech punctuation.
  - Comma / Flow: fronted adverbials, comma clarity, and parenthesis.
  - List / Structure: list commas, colon before list, semi-colons in lists, and bullet points.
  - Boundary: semi-colons between clauses, dash clauses, and hyphens.
- R12. Reward progress must be based on stable published reward mastery units, not raw generated item count. Generated items can provide evidence for a unit, but adding more generated templates must not move the denominator after a content release is published.
- R13. Cluster evolution should use percentage thresholds over each cluster's published reward units: stage 0 egg at 0%, stage 1 baby after the first secure unit, stage 2 teen at roughly one third secure, stage 3 adult at roughly two thirds secure, and stage 4 mega at 100% secure for that cluster.
- R14. The grand legendary should aggregate all six cluster lines and reach mega only at 100% secure coverage across the full Punctuation release. If the first production slice ships fewer than all 14 skills, the product must not imply complete KS2 Punctuation mastery until the remaining skills are included.
- R15. Monster progress must be additive. A learner who later becomes due or weak on a previously secured unit should see that learning need in analytics and review queues, but previously earned monster stages should not de-evolve.
- R16. Punctuation reward events must be projected by the server-side reward boundary, following the Spelling pattern. The Punctuation engine may emit secure-unit events, but it must not directly mutate Codex state.
- R17. Working asset routing should use the provided monster asset folders with the existing two-branch, five-stage, multi-size structure. Initial candidate mapping to review during planning: Endmarks `pealark`, Apostrophe `claspin`, Speech `quoral`, Comma / Flow `curlune`, List / Structure `colisk`, Boundary `hyphang`, Grand Legendary `carillon`.
- R18. Bellstorm Coast should use the provided region assets from `assets/regions/bellstorm-coast/`, with daily scenes favouring sets A-C and boss/final scenes favouring sets D-E.

**Production Integration**

- R19. The legacy HTML must remain a donor/reference artefact only. It must not become a production route or browser-owned subject engine.
- R20. Punctuation production runtime must use the existing generic Worker command boundary, conceptually `POST /api/subjects/punctuation/command`, for session creation, item selection, marking, scheduling, progress mutation, reward projection, and read-model aggregation.
- R21. Punctuation must be added as a subject-owned Worker handler in the current subject runtime pattern. It should not create a parallel API style if the generic command runtime can carry the subject.
- R22. The Worker command set should cover the real learner loop: start session, submit answer, continue, skip or end, save preferences, reset learner, and any read-only drill/check actions that must avoid scheduler mutation.
- R23. The Punctuation engine should be extracted into deterministic modules that can run in tests and Worker commands, with serialisable input/output and no dependency on HTML rendering, DOM state, browser storage, or direct `Math.random()`.
- R24. The React Punctuation subject must be a thin UI/read-model client. It may render setup, current item, feedback, summary, Bellstorm Coast backgrounds, monsters, and local form state, but it must not own production scoring, queue selection, scheduler mutation, or reward mutation.
- R25. The current Punctuation placeholder should only become available when a real React practice component and Worker-backed subject flow exist. If the first release is partial, learner-facing copy must frame it as the currently published Punctuation release rather than complete KS2 Punctuation mastery.
- R26. Punctuation state must use the generic platform stores: `child_subject_state`, `practice_sessions`, and `event_log`. Do not add a subject-specific side database or hidden browser store as source of truth.
- R27. The first production slice should prioritise an end-to-end vertical path over a huge local-only port. It should include enough skills and modes to prove the engine, Worker commands, React UI, analytics snapshot, reward projection, assets, and deployment gate all work together.
- R28. The production bundle audit must reject exposed client-owned Punctuation engines, scoring, queue selection, generated-content authority, direct AI keys, or raw local runtime switches.
- R29. The production release gate must include `npm test`, `npm run check`, production bundle/public-output audit, Worker command tests, and browser or HTTP smoke coverage for demo or logged-in Punctuation access.
- R30. After deployment, Punctuation must be verified on `https://ks2.eugnel.uk` with a real logged-in or demo browser session if the release exposes the subject to users.

---

## Production Integration Strategy

Three viable routes exist:

| Approach | Description | Pros | Cons | Best fit |
|---|---|---|---|---|
| A. Full legacy migration in one pass | Extract all 14 skills, all 75 fixed items, all 41 generator families, all modes, UI, rewards, and Worker route before showing Punctuation. | Fastest route to full-subject claim if it succeeds. | High blast radius, harder review, bigger marking-risk surface, easy to accidentally ship client-owned logic. | Only if implementation capacity is high and the release can absorb a large review cycle. |
| B. Production vertical slice | Build the real Worker command path, deterministic engine, React subject UI, analytics, rewards, and assets for a deliberately scoped content/mode subset, then expand content in follow-up passes. | Proves the true production architecture early, keeps release risk bounded, avoids fake local-only progress. | First release cannot claim complete KS2 Punctuation coverage unless all 14 skills are included. | Recommended default. |
| C. Engine-first hidden integration | Extract and test the full deterministic engine behind the Worker while keeping Punctuation hidden until UI/rewards are ready. | Strong engine quality before user exposure. | Delays user-visible value and can drift into a long internal port. | Useful if marking/rubric uncertainty is the main blocker. |

Recommended direction: **B, production vertical slice**, with a hard rule that every slice must run through the real Worker command boundary and production verification path. Follow-up passes can broaden skills, modes, transfer rubrics, and GPS-style practice without changing the authority boundary again.

---

## Minimum Production Definition

Punctuation counts as "working on `ks2.eugnel.uk`" only when:

- The Punctuation card is available in the subject registry and opens a real React subject surface.
- A learner can start a Punctuation session, answer at least one deterministic item, receive feedback, continue or finish, and return to a summary.
- The command response comes from the Worker subject command route, not a browser-local engine.
- Learner state survives refresh, learner switch, import/export restore where supported by the platform, and demo/session boundaries expected by the current app.
- At least one secure-unit path can emit a Punctuation domain event and produce a Monster Codex reward projection.
- Bellstorm Coast region assets and the selected Punctuation monster assets render through the normal asset pipeline.
- Parent/Admin-ready analytics can report attempts, accuracy, weak/due/secure units, skill/facet progress, and misconception tags for the published slice.
- The production bundle/public-output audit confirms that forbidden Punctuation engine authority is not exposed in the client.

---

## Acceptance Examples

- AE1. **Covers R4, R5, R13.** Given a learner answers one Endmarks item correctly for the first time, when the command completes, the item may improve its memory state but the Endmarks monster does not jump to mega because secure status requires repeated spaced evidence.
- AE2. **Covers R7, R8.** Given a learner places a question mark outside the closing inverted comma in a speech item, when the Worker marks the answer, the response is incorrect and the event carries a speech punctuation misconception tag.
- AE3. **Covers R11, R12, R13.** Given a learner secures every published Apostrophe reward unit, when the projection runs, the Apostrophe monster reaches stage 4 regardless of how many extra generated apostrophe templates exist behind the service.
- AE4. **Covers R14.** Given a learner has every cluster at stage 4, when the aggregate projection runs, the grand legendary reaches mega and can be presented as 100% Punctuation mastery for the published release.
- AE5. **Covers R15.** Given a learner previously secured a Boundary unit but later misses a due review, when analytics refreshes, the unit may appear due or fragile for learning purposes, but the Boundary monster does not lose an earned stage.
- AE6. **Covers R19, R20, R28.** Given a production build includes the legacy Punctuation marking engine inside the React bundle, when the bundle audit runs, the release is blocked.
- AE7. **Covers R20, R21, R22, R24.** Given a learner starts a Punctuation session on production, when React dispatches the start command, the response is served by the Worker subject runtime and contains an authorised Punctuation read model.
- AE8. **Covers R25, R27.** Given the first production slice covers only Endmarks and Apostrophe, when the subject dashboard renders, it must not claim complete KS2 Punctuation mastery or unlock the grand legendary as if all 14 skills were published.
- AE9. **Covers R29, R30.** Given the Punctuation release is deployed, when post-deploy verification runs against `ks2.eugnel.uk`, the smoke check proves the subject opens and the Worker command path processes a real learner or demo action.

---

## Success Criteria

- James can explain Punctuation mastery scientifically before mentioning monsters: the subject improves punctuation through spaced, interleaved, production-heavy practice with deterministic marking and skill-facet analytics.
- The game layer feels additive: monsters, Bellstorm Coast scenes, evolution, and the grand legendary make progress visible without weakening the learning criteria.
- All 14 legacy atomic skills have a clear home inside six reward clusters and one aggregate grand legendary.
- Planning can proceed without inventing the mastery model, reward denominator, monster count, secure threshold, or production boundary.
- Punctuation can ship through the same full-lockdown evidence path as Spelling: tests, bundle audit, and Worker-owned command behaviour.
- The implementation plan can be split into reviewable vertical passes without losing the end goal: a real production subject, not a local demo.

---

## Scope Boundaries

- Do not directly merge or serve the legacy HTML as a production subject.
- Do not make AI-generated text the marker or the source of final questions.
- Do not use raw item count from generated templates as the reward denominator.
- Do not de-evolve monsters when a learner later needs review.
- Do not claim complete KS2 Punctuation mastery if the first production slice covers only a subset of the 14 skills.
- Do not build a new cross-subject reward system as part of the Punctuation first slice; extend the existing Monster Codex pattern.
- Do not redesign the whole subject shell, Parent Hub, Admin Hub, or content-management model as part of this feature.
- Do not mark the subject available in production until the Worker command path, read model, persistence, and release gate exist.
- Do not let a hidden local/browser fallback make production appear to work when the Worker command path fails.

---

## Key Decisions

- Use six skill-cluster monsters plus one grand legendary: This matches James's preferred seven-creature shape while still covering the 14-skill engine.
- Use stable reward mastery units: This prevents generated-content volume from changing what 100% means.
- Keep rewards additive: This preserves motivation and matches the existing Spelling monster projection pattern.
- Treat the legacy engine as a donor: Its skill map, content, scheduler, marking, and analytics ideas are valuable, but the production shell and authority model must be rebuilt through the Worker boundary.
- Prefer a production vertical slice over a local-only full port: The first visible release should prove engine, Worker, React, reward, assets, and verification together.
- Withhold full-mastery copy until all 14 skills are in the published release: This keeps learner trust and reward meaning intact.

---

## Dependencies / Assumptions

- The provided Bellstorm Coast region assets and monster assets are intended to be shipped from `assets/regions/bellstorm-coast/` and `assets/monsters/`.
- The candidate asset mapping in R17 is provisional until James confirms the exact creature names and Codex ordering.
- The current Spelling reward projection remains the pattern for server-side monster events.
- The first implementation plan may need to define a published Punctuation content manifest that declares reward mastery units separately from generated item families.
- The full-lockdown runtime plan remains the target production boundary for new real subjects.
- The current Worker runtime already supports generic subject command dispatch for Spelling; planning should extend that pattern rather than invent a separate Punctuation backend shape unless a verified limitation appears.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R12, R13, R27][Technical] Define the exact published reward-unit manifest for each cluster and how generated item evidence rolls into each unit.
- [Affects R17, R24][Product] Confirm the final monster asset mapping, learner-facing names, Codex ordering, accents, and blurbs.
- [Affects R21, R22, R23][Technical] Map the Punctuation Worker command handlers and service boundaries onto the existing subject runtime.
- [Affects R25, R27][Product/Technical] Choose the first production vertical slice: all 14 atomic skills at once, or a smaller published slice with explicit partial-copy.
- [Affects R7][Technical] Specify the first transfer rubric facets and negative tests for speech, comma clarity, parenthesis, semi-colons, dashes, and bullet points.
- [Affects R29, R30][Technical] Define the exact preview and production smoke checks for Punctuation after deployment.

---

## Next Steps

-> /ce-plan for structured implementation planning.
