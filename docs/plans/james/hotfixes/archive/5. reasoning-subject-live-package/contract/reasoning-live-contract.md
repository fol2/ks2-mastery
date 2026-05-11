# Reasoning subject live implementation contract

## Source boundary

Primary implementation evidence is the uploaded lean ZIP snapshot `ks2-mastery-lean-05111050.zip`. The approved Reasoning HTML proof-of-concept was used as the source for the isolated question engine only. The standalone HTML app was not embedded into the production shell.

This contract keeps the same architecture rules already used for Reading, Grammar, Punctuation and Spelling: session creation, marking, scheduling, progress mutation and reward projection are Worker-owned; browser code receives safe read models and sends subject commands.

## Product contract

Reasoning is now a production subject, not a placeholder. It is available from the subject registry, renders through the shared React subject route, launches through the same command/read-model path as the other ready subjects, and participates in the platform monster/reward layer and Hero Mode.

The subject-specific question engine is isolated. Shared UI components are reused for setup, stage layout, HUD, companion panel, progress meter, summary frame, buttons, Hero backdrop and subject theming. Reasoning-specific browser code is limited to a thin surface that renders a Worker read model and dispatches commands.

Reasoning practice supports:

- Smart Review
- Skill Practice
- Trouble Drill
- Worked Examples
- Faded Guidance
- SATs Single
- SATs Mini-Set

The learning loop is independent first attempt by default, minimal nudge after an initial miss, optional support only after effort, exact due retry for recent misses, and later spaced mixed return.

## Content contract

The promoted content release is:

`reasoning-poc-promoted-2026-05-11`

The content bank contains:

- 110 parameterised template families
- 17 KS2 reasoning skills
- 20 misconception tags
- 110 SATs-friendly templates
- 7 practice modes
- deterministic generation by template id and seed
- deterministic marking on the Worker side
- safe serialisation that removes marker/evaluation functions before browser exposure

Content covers number and place value, calculation, fractions/FDP, ratio and proportion, measure, geometry and measure, geometry, statistics, reasoning/checking, and money contexts.

## Worker contract

`worker/src/subjects/reasoning/engine.js` owns Reasoning state transitions.

Commands supported:

- `start-session`
- `submit-answer`
- `save-response`
- `continue-session`
- `move-question`
- `mark-section`
- `mark-session`
- `request-support`
- `end-session`
- `save-prefs`
- `reset-learner`

Domain events emitted include:

- `reasoning.session-started`
- `reasoning.answer-submitted`
- `reasoning.evidence-earned`
- `reasoning.session-completed`

The command handler projects reward reactions through the existing command projection path and returns a subject read model. No browser code marks answers or mutates mastery.

## Monster and reward contract

Reasoning owns its own monster state ids and does not mutate other subject monsters. It reuses existing monster art assets but keeps independent ownership state.

Reasoning monsters:

- `numdrake`
- `fractalon`
- `measuron`
- `georune`
- `proofwyrm`
- `strategon` as the grand monster

Reasoning uses a 100-star high-water evidence model for direct monsters, with separate grand progress for the grand monster. Star evidence is keyed by content release, skill, template, seed and evidence bucket to avoid repeat inflation.

## Hero Mode contract

Reasoning is moved from locked/placeholder to ready subject status for Hero Mode.

The Reasoning Hero provider emits task envelopes only. It does not mark, schedule individual generated items, change subject mastery, or award subject Stars. Launch adapters map Hero envelopes to Reasoning modes:

- `smart-practice` -> `smart`
- `trouble-practice` -> `trouble`
- `mini-test` -> `satsset`
- `guardian-check` -> `smart`
- `gps-check` -> `sats`

This preserves Hero Mode as an orchestrator over ready subjects, not a second mastery engine.

## Safety boundaries

- Browser imports use `shared/reasoning/metadata.js`, not the private marker bank.
- Worker code imports the full content/marker bank.
- Reasoning content does not change Spelling, Grammar, Punctuation or Reading engines.
- Hero Coins are not added or modified by this patch.
- The subject visual adapter marks Reasoning as ready and keeps Arithmetic unavailable.
- Lean ZIP generated build outputs are not included in the patch.

## Acceptance criteria

A release candidate is acceptable when:

1. Reasoning is registered as `available: true` and renders through `ReasoningPracticeSurface`.
2. Worker runtime dispatches Reasoning `start-session` successfully.
3. Content smoke generation and marking pass across all templates.
4. Browser safe read models do not expose marker functions.
5. Reasoning reward projection updates Reasoning-owned monsters and grand monster only.
6. Hero Mode eligibility includes Reasoning when the provider has available envelopes.
7. Build passes from the ZIP snapshot.
8. No live production claim is made without separate deployed evidence.
