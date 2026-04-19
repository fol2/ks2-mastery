---
date: 2026-04-19
topic: overlay-game-system
---

# Overlay Game System

## Problem Frame

KS2 pupils (UK Year 5/6, ages 9–11) using this app to practise SATS-aligned
skills currently see a minimal collection motif: three named monsters
(Inklet, Glimmerbug, Phaeton) that hatch and evolve as unique words reach
`SECURE_STAGE`. The study engine is doing real pedagogic work, but the
motivational surface sitting on top of it is thin — catches and evolutions
are the only celebrated moments, everything between them is flat practice.

The study engine (spelling today, five other subjects coming) must remain
the sole source of truth for mastery. A richer "real game" layer should
wrap the existing practice flow without altering how the engine scores
answers, advances stages, or persists progress. The goal is to turn
every study session into a visibly rewarding adventure while leaving the
pedagogy untouched.

## Requirements

A Word Spirit is the per-word creature that appears in both surfaces —
during a practice question it is the *wild form* (combat framing); in the
Collection and Sanctuary it is the *card / resting form* (collectible
framing). Throughout this document, "wild creature", "Word Spirit
creature", and "Word Spirit card" all refer to the same per-word entity
shown in different contexts.

### Core loop & framing

- R1. Study-first entry — the home screen and subject tabs lead with
  practice. Game surfaces (Collection, Sanctuary) are secondary tabs, not
  the primary front door. No game-mode switch that bypasses study.
- R2. Every practice question is framed as a micro-fight — the word's
  Word Spirit appears in its wild form with an HP bar, a correct answer
  lands a hit, a wrong answer is a miss. When the word reaches the study
  engine's `SECURE_STAGE` the Word Spirit is celebrated as a "catch" and
  thereafter appears in the Collection as a card (its resting form).
  The per-answer HP-bar state is driven by a new **answer-graded event
  contract** (see R15). Subject engines that cannot produce a per-answer
  signal (initially all non-spelling subjects) render no wild form and
  retain today's plain practice UI.
- R3. Cosmetic combat skin only — no type system, no team selection, no
  move choices, no items to pick. The only interaction inside a question
  remains answering the question. The skin adds visuals (HP bar, damage
  numbers, streak combos, catch animation) around the existing form.

### Collection (two-tier)

- R4. Every mastered word is represented in the Collection by its Word
  Spirit card — the resting form of the same creature the kid met during
  the question-fight (see R2). The card is procedurally rendered and
  keyed to the exact word.
- R5. Each Word Spirit card surfaces the word, its example sentence, its
  audio-playback button, and a small piece of bespoke art derived from a
  per-subject template (silhouette + subject palette + the word glyph).
  Includes a reveal-toggle retrieval practice affordance (hidden-by-default
  word, audio-as-prompt); study engine remains the sole review scheduler
  — no spaced-rep integration, no review queue.
- R6. Milestone named monsters retain the existing mastery thresholds
  (10 = hatch, 50 / 80 = evolve, 100 = mega) and the current aggregate
  rule as implemented in `MonsterEngine.AGGREGATES` — today that is just
  Phaeton, whose stage is derived from Inklet + Glimmerbug counts with
  both-caught and both-maxed gates. No threshold changes; the overlay
  only re-frames these moments in the new narrative (the named monster
  is the "family chief" of all the Word Spirits the kid has caught from
  that word pool). Aggregate milestones remain visible in the Collection
  even before their dependencies are satisfied, rendered as the
  pre-hatch silhouette until the gates open.
- R7. Collection tab shows both tiers — a milestone row at the top and a
  Word Spirit grid beneath. Uncaught spirits appear as silhouettes with
  a faint outline of the word.

### Sanctuary (spatial meta-loop)

- R8. The Sanctuary is the primary meta-progression surface — a warm,
  UK-cottage-meets-fairy-grove scene that grows visibly as the kid
  progresses. No currency in v1; progress is spatial, not transactional.
- R9. Each subject owns a named Sanctuary zone (Ink Grove for spelling,
  Number Atrium for arithmetic, Reasoning Orrery, Grammar Gardens,
  Punctuation Plaza, Reading Reading-Room). Caught Word Spirits populate
  their home zone.
- R10. Named monster milestones unlock additional zone states (Phaeton
  mega form unlocks the Observatory, etc.). These unlocks must be
  derivable from existing `MonsterEngine.getMonsterProgress` so the
  Sanctuary does not introduce its own progression counters.
- R11. Sanctuary responds to lightweight interaction — tapping a caught
  Word Spirit plays a bespoke "happy" animation and speaks its home
  word. No persistent petting / care mechanics, no timers, no "hungry"
  states — nothing that would pressure a kid to open the app daily.

### Multi-subject scope (v1)

- R12. The game engine is pool-agnostic from day 1 — adding a new
  subject's mastery stream wires its Sanctuary zone and Word Spirit
  generator with zero changes to the game engine core. (Softened in the
  implementation plan: the overlay consumes an adapter boundary for
  spelling; subject engine #2 may evolve the contract before v1.1.)
- R13. v1 ships Spelling fully lit; the other five subjects show visible
  but locked Sanctuary zones with silhouettes of their future named
  monsters and copy such as "Opens when Year-5 Maths goes live".
- R14. No combat overlay or Word Spirit generation runs against the
  current mock practice content for the five unfinished subjects. No
  fake mastery data is persisted for them. Test-mode spelling sessions
  (`MODES.TEST`) similarly fall back to plain practice UI (no HP bar,
  no wild form); catches still celebrate through existing milestone
  ceremonies when `justMastered` fires.

### Decoupling & safety

- R15. The game engine is **read-only** with respect to study state, and
  subscribes to three surfaces published by the subject-engine layer:
    1. **Submit payload** — every `/api/<subject>/sessions/:id/submit`
       response is the authoritative mastery write. For spelling today
       the payload is `{ session, monsters?, monsterEvent }` (renamed
       to `monsterEvents: Event[]` by Unit 1 of the plan); the overlay
       reads `monsters` (authoritative snapshot) and `monsterEvents`.
    2. **`monster:progress` DOM event** — `spelling-api.jsx` rebroadcasts
       this after every submit/advance; existing subscribers
       (`shell.jsx`, `dashboard.jsx`) stay unaffected. Future subject
       engines must rebroadcast an equivalent event after any response
       that could have mutated mastery.
    3. **`answer:graded` DOM event (new)** — fired by the subject-engine
       adapter on every submit, carrying `{ subjectId, correct, slug,
       phase, streak, done }`. This is the contract R2's per-answer
       HP-bar relies on. Each future engine owns emitting this event.
  The overlay never invokes `KS2App.setSpellingData` or equivalents,
  never mutates `KS2App.state.monsters`, and never calls subject
  submit/advance endpoints directly — it only reads state and listens
  to the events above.
- R16. The game engine owns a single new storage namespace
  (`ks2-overlay-<profileId>`) for game-only state that cannot be
  derived from study state — chiefly Sanctuary decor choices, dismissed
  introductions, and which Word Spirits the kid has actually viewed.
  For v1 this storage is **device-local only** (localStorage on the
  child's device); mirroring to D1 via a new `/api/overlay/*` endpoint
  is explicitly deferred to v2.
- R17. No game item, action, streak bonus, or cosmetic may alter how
  the study engine grades an answer, advances a stage, or persists
  progress. **Equivalence test**: a vitest-pool-workers harness (per
  the existing `auth-security` / `tts-proxy` test pattern) replays a
  scripted sequence of submits through the Worker with and without the
  overlay subscribers mounted (real subscribers with real side-effects,
  not no-ops). For each run the harness asserts byte-equality of
  (a) the ordered `/api/spelling/sessions/*/submit` payload stream and
  (b) the final `KS2App.state.monsters` snapshot. Equivalence is
  defined over the submit-payload stream and the authoritative store
  — *not* over the deprecated `ks2-spell-progress-*` / `ks2-monsters-*`
  localStorage keys, which are no longer written in this build.

## Success Criteria

- A kid practising spelling for ~15 minutes sees a micro-reward on
  every answered question, at least one medium-sized catch celebration,
  and a visible Sanctuary change by the end of the session.
- Opening the app after a session away shows the Sanctuary in a
  distinctly richer state than before — progress is apparent at a
  glance without reading numbers.
- Engine equivalence holds — per R17, for any scripted sequence of
  practice submits the ordered `/api/spelling/sessions/*/submit`
  response stream and the final `KS2App.state.monsters` snapshot are
  byte-identical with or without the overlay subscriber mounted,
  verified by a vitest-pool-workers harness in CI.
- The requirements in this document are sufficient for Claude design
  app to produce a coherent UI exploration covering: question-fight
  frame, catch overlay, Collection tab, Sanctuary main view, and
  locked-zone state — without asking further product questions.
- A new subject becoming real requires only (a) its mastery engine,
  (b) its Word Spirit template, (c) its Sanctuary zone art — no core
  game engine changes (v1.1 may refine the adapter contract).

## Scope Boundaries

- **No PvP** — no head-to-head battles between kids, no code-pairing,
  no leaderboards tied to identity.
- **No real-money purchases, no gacha, no loot boxes.**
- **No chat, no user-generated content, no social feed.**
- **No gameplay items that affect study outcomes** — no hints that
  bypass the engine, no skips that preserve stage, no retries that
  waive a wrong-answer penalty.
- **No daily-streak punishment** — daily visits may be celebrated, but
  missing a day never degrades Sanctuary state or Word Spirit collection.
- **Cosmetic coin shop deferred to v2** — coins, shop SKUs, decor
  purchases, alternate palettes. v1 ships without currency; the engine
  must be forward-compatible so coins can be layered on without
  restructuring.
- **Full multi-subject content deferred** — Word Spirit templates,
  named monsters, and Sanctuary zones for the five mock subjects are
  designed as silhouettes only. They light up when their mastery
  engine ships.
- **No persistent care mechanics** (pet hunger, mood timers, "watering"
  plants) — Sanctuary is a proof-of-progress space, not a Tamagotchi.

## Key Decisions

- **Study-first entry over game-first** — game-first framing (where
  "Battle" is the home button) risks pulling the 15-minute session
  toward mechanics and away from the SATS content. Study-first keeps
  pedagogy central while still delivering full game surfaces.
- **Every question is a fight, not rare boss fights** — frequent small
  dopamine pulses suit the age group better than infrequent big ones,
  and the per-question framing maps naturally onto existing per-answer
  engine events.
- **Cosmetic depth only** — richer mechanical depth (types, teams,
  moves) adds decisions per question, which fights the study-first
  constraint and lengthens sessions.
- **Two-tier collection (Word Spirits + milestone monsters)** —
  granular per-word cards provide constant catch moments while the
  existing named-monster ceremony is preserved. Each Word Spirit is
  also a light flashcard for revision (reveal-toggle only; scheduling
  stays with the engine).
- **Sanctuary over shop for v1 meta-loop** — a spatial progression
  surface communicates progress without conditioning kids to optimise
  for currency.
- **Architecture for six, wire spelling, silhouette the rest** — full
  game coverage on mock subjects would require fake mastery data; a
  Spelling-only game would leave five subjects visibly neglected.
- **Read-only decoupling** — the user's explicit core constraint.
  Treated as an architectural invariant, not a nice-to-have.

## Dependencies / Assumptions

- The app has been **server-authoritative** since PR#1–5 (Turnstile,
  D1, Worker-proxied TTS, server-side spelling engine). Mastery is
  written by the Cloudflare Worker (`worker/lib/spelling-service.js`)
  and hydrated into `KS2App.state.monsters` via `/api/bootstrap` and
  the `/api/spelling/sessions/:id/submit` + `advance` responses. The
  legacy `src/monster-engine.jsx` and its `ks2-monsters-<profileId>`
  localStorage keys are no longer on the write path — `client-store.jsx`
  exposes a no-op `MonsterEngine.recordMastery` kept only for signature
  compatibility.
- The submit payload today carries a **single** `monsterEvent` (or
  `null`) for the directly-updated monster. Aggregate monsters
  (Phaeton) have their progress re-derived at read time via
  `buildMonsterProgress` — no aggregate mastery event is emitted from
  the submit path. The plan (Unit 1) extends the Worker to iterate
  aggregates and return `monsterEvents: Event[]`.
- Subject-engine contract for the overlay: every subject engine that
  wants to light up R2's wild form must emit the `answer:graded` DOM
  event from R15.3 and include `monsters` + `monsterEvents` in its
  submit response. Spelling already satisfies `monsters`/`monsterEvent`
  today; the `answer:graded` emitter is a small addition in
  `spelling-api.jsx`.
- Overlay state (`ks2-overlay-<profileId>`) lives in the browser's
  `localStorage` on the child's device (v1, device-local). No D1
  table, no `/api/overlay/*` endpoint in v1.
- `MonsterEngine.AGGREGATES` stays the declarative place to document
  combined milestone monsters in the client codebase; the Worker's
  `buildMonsterProgress` is the authoritative evaluator.
- The existing fullscreen `MonsterOverlay` and bottom-right
  `MonsterToast` remain the named-monster ceremony surfaces; the
  overlay game system adds new surfaces for Word Spirit catches and
  Sanctuary ambience but does not replace those two.
- The UI handoff to Claude design app consumes this document plus the
  plan's High-Level Technical Design section and the in-line ASCII
  wireframes from the brainstorm. No Figma is in scope.

## Outstanding Questions

### Resolve Before Planning

_(None — all product decisions resolved during the brainstorm.)_

### Deferred to Planning

- [Affects R4] [Technical] Where the Word Spirit component lives
  (likely a new `src/word-spirit.jsx`) and how per-subject templates
  declare palette / silhouette without bloating the game engine.
- [Affects R2] [Technical] Whether the wild form skin is a new wrapper
  component around the existing `SpellingGame` or a conditional render
  inside it. Either path is R15-compliant.
- [Affects R6, R15] [Technical] Ordering rule when a single submit
  produces both a Word Spirit catch (R2) and a named-monster
  `monsterEvent` (R6). Also: whether the current `MonsterOverlay` copy
  is re-worded for the "family chief" framing, or the wild form gets
  its own catch overlay and named monsters keep their existing
  ceremony.
- [Affects R15] [Technical] Whether the Worker's `recordMonsterMastery`
  is extended to iterate `AGGREGATES` and return `monsterEvents: Event[]`,
  or the overlay diffs `state.monsters.<aggregateId>` across submits to
  detect Phaeton transitions. Either is R15-compliant.
- [Affects R2, R15] [Technical] Exact `answer:graded` payload shape
  (fields beyond `{ subjectId, correct, slug, phase, streak, done }`),
  where it is emitted for spelling, and how the overlay throttles
  animations when retry / correction phases replay the same word.
- [Affects R8] [Needs research] Sanctuary art pipeline — hand-drawn
  SVG (matching `monsters.jsx`) vs layered PNG scenes vs
  parallax-friendly composition. Sample one zone before committing.
- [Affects R16] [Technical] Storage schema for `ks2-overlay-<profileId>`
  — what minimal set of keys captures Sanctuary decor choices,
  dismissed intros, and "seen Word Spirits" without duplicating
  anything the study engine already stores. Scope remains
  device-local localStorage for v1 per R16; D1-mirroring deferred to v2.

## Next Steps

→ `/ce:plan` for structured implementation planning, using this
document as the product definition.

→ In parallel, hand this document plus the plan's High-Level
Technical Design section to Claude design app for a UI exploration of:
question-fight frame, Word Spirit catch moment, Collection tab
(two-tier), Sanctuary main view (spelling lit, five zones locked),
and the locked-zone state.
