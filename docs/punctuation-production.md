# Punctuation Production Subject

Punctuation is now a production subject slice for KS2 Mastery, built from the legacy engine ideas without shipping the legacy single-page engine to the browser.

The release deliberately keeps the learner engine first. Monsters and Codex rewards are projections from secured learning evidence; they are not the primary game loop and they do not drive scoring.

## First Release Scope

Release id:

```txt
punctuation-r4-full-14-skill-structure
```

Published skills:

- Capital letters and sentence endings
- Commas in lists
- Apostrophes for contraction
- Apostrophes for possession
- Inverted commas and speech punctuation
- Fronted adverbial commas
- Commas for clarity
- Semi-colons between clauses
- Dashes between clauses
- Hyphens to avoid ambiguity
- Parenthesis
- Colons before lists
- Semi-colons in lists
- Bullet-point punctuation

This preserves the legacy engine's 14-skill map while shipping only content that has enough fixed items, transfer coverage, misconception tags, and negative tests for the current hidden production slice.

## Measurement Model

Punctuation mastery is measured by release-scoped reward units, not by raw quiz completion.

Current published reward units:

- `sentence-endings-core`
- `apostrophe-contractions-core`
- `apostrophe-possession-core`
- `speech-core`
- `list-commas-core`
- `fronted-adverbials-core`
- `comma-clarity-core`
- `semicolons-core`
- `dash-clauses-core`
- `hyphens-core`
- `parenthesis-core`
- `colons-core`
- `semicolon-lists-core`
- `bullet-points-core`

Each unit has a stable mastery key:

```txt
punctuation:<releaseId>:<clusterId>:<rewardUnitId>
```

A unit is not secured by one correct answer. The scheduler requires repeated clean evidence, accuracy, streak, and spaced return before the item memory reaches secure state. This mirrors the spelling principle of durable recall while fitting punctuation's proofreading and transfer behaviours.

## Practice Engine

The service is deterministic and serialisable. It supports these phases:

```txt
setup -> active-item -> feedback -> active-item | summary
```

Published practice modes include:

- choose: discriminate between correct and near-miss punctuation
- insert: add punctuation to an unpunctuated sentence
- fix: proofread and repair a sentence
- transfer: write or repair a constrained sentence against explicit facets
- combine: join notes, clauses, or extra detail into one score-bearing punctuated sentence
- paragraph: proofread a short passage where several punctuation skills can be exercised together

Generated practice now runs through a deterministic compiler. Each published generator family can add extra practice items to the runtime manifest under a fixed release seed, so the Worker can broaden practice without using browser-owned random generation or changing the published reward denominator. Generated items carry `source: generated` internally, but the browser still receives only the redacted live-item read model.

Sentence-combining practice is now ported as a Worker-owned item mode rather than a separate browser session. Smart review and focused cluster sessions include `combine` at controlled frequency, weak spots can target weak `skill::combine` facets, and unsupported clusters fall back to their available item modes instead of exposing an empty queue.

Paragraph-repair practice is also ported as a Worker-owned item mode rather than a separate browser session. Smart review and focused cluster sessions include `paragraph` after the combine slot, weak spots can target weak `skill::paragraph` facets, and the browser receives only the short passage prompt/stem rather than accepted answers or validators.

The first Speech rubric is deliberately strict:

- accepts matched straight or curly single/double inverted commas
- requires the spoken-word punctuation inside the closing inverted comma
- rejects extra terminal punctuation outside the quote
- checks reporting-clause comma patterns where required
- checks capitalisation and unchanged target words
- returns stable misconception tags such as `speech.quote_missing`, `speech.punctuation_outside_quote`, and `speech.words_changed`

Comma / Flow marking adds deterministic transfer validators for:

- ordered KS2 list-comma patterns without an unnecessary final comma before `and`
- opening phrase commas after fronted adverbials such as `After lunch,`
- opening phrase commas that make meaning clearer, such as `In the morning,`

Boundary marking adds deterministic transfer validators for:

- semi-colons between preserved related clauses
- spaced dashes between preserved related clauses
- exact hyphenated phrases that avoid ambiguity, such as `well-known author`

Structure marking adds deterministic transfer validators for:

- comma-marked parenthesis around preserved extra information
- colons before preserved lists after complete opening clauses
- semi-colons between complex list items
- colon-led bullet lists with preserved bullet items

Combine marking adds stricter one-sentence validators for the first legacy-shaped rewrite families:

- list-comma note combination without an unnecessary final comma
- fronted-adverbial rewrites with the opening comma
- parenthesis rewrites with matched commas, brackets, or dashes
- colon-list combinations after a complete opening clause
- semi-colon clause combinations that reject comma splices
- spaced-dash clause combinations that reject unpunctuated joins

Paragraph marking composes the deterministic validators across a short passage for the first legacy-shaped proofreading families:

- fronted adverbial plus direct speech
- parenthesis plus direct speech
- colon before a list plus semi-colon between clauses
- colon-led bullet lists with consistent line-based punctuation
- mixed apostrophe contractions and possession

## Worker Runtime

Production practice runs through the generic command boundary:

```txt
POST /api/subjects/punctuation/command
```

Supported commands:

- `start-session`
- `submit-answer`
- `continue-session`
- `skip-item`
- `end-session`
- `save-prefs`
- `reset-learner`

The Worker owns session creation, item selection, marking, scheduling, progress mutation, completed-session writes, domain-event append, reward projection, and the returned read model. The React browser surface sends learner intent and renders the returned state.

## Events And Rewards

Punctuation emits domain events:

- `punctuation.item-attempted`
- `punctuation.misconception-observed`
- `punctuation.unit-secured`
- `punctuation.session-completed`

Reward projection maps secure units to Bellstorm Coast creatures:

- Endmarks: Pealark
- Apostrophe: Claspin
- Speech: Quoral
- Comma / Flow: Curlune
- List / Structure: Colisk
- Boundary: Hyphang
- Published release aggregate: Carillon

The Punctuation service does not mutate game state directly. It emits domain events; the reward projection records deduplicated mastery keys in the Monster Codex state. Replayed commands or duplicate `unit-secured` events do not double-award the same mastery key.

## Browser Read Model And Lockdown

The browser read model is an allowlist. It may show the current prompt, stem, safe answer choices, feedback, correction copy, rubric facets, and summary data.

It must not expose server-only fields such as accepted answer lists, `correctIndex`, validators, raw rubric definitions, content generators, hidden queues, unpublished items, or the domain engine.

The production bundle audit now rejects:

- `shared/punctuation/content.js`
- `shared/punctuation/generators.js`
- `shared/punctuation/marking.js`
- `shared/punctuation/scheduler.js`
- `shared/punctuation/service.js`
- `worker/src/subjects/punctuation/*`
- raw Punctuation service/repository entry points under `src/subjects/punctuation/`

Worker-first asset routing also denies `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, and raw `/src/*` paths, except for the built app bundle.

## Verification Gate

The Punctuation release gate includes:

- manifest validation for the 14-skill map, first-release scope, readiness rows, and stable reward keys
- marking tests for exact answers, Speech variants, and misconception tags
- scheduler and service tests for spaced secure thresholds and transition errors
- Worker command tests for start, submit, continue, stale transitions, redaction, and idempotent reward projection
- React scene tests for setup, active, feedback, summary, and hidden-field absence
- subject expansion conformance and golden-path smoke coverage
- deterministic demo release smoke proving default hidden exposure, Smart review, GPS delayed review, Parent Hub evidence, gated Worker command execution, and English Spelling startup
- asset tests for Bellstorm Coast scenes and Punctuation monster artwork
- bundle/public-output audits proving engine/content source and raw source paths are not shipped to the browser
- performance coverage for bounded scheduling across fixed items, generated items, sentence combining, and paragraph repair
- local release smoke coverage for Admin Hub Punctuation evidence redaction; live production smoke does not require an admin session

Production exposure is controlled by the `PUNCTUATION_SUBJECT_ENABLED` Worker env var, which feeds the browser `punctuationProduction` subject exposure gate. The release-smoke gate now covers both sides of the rollout: `false` keeps the Worker command route, dashboard card, and direct subject route unavailable; `true` exposes the subject only after the Worker-backed demo path has been verified.

Before deployment, run:

```txt
npm test
npm run check
```

After deployment, verify the production UI on `https://ks2.eugnel.uk` with a logged-in or demo browser session.

For repeatable HTTP evidence after a Punctuation deploy, run:

```txt
npm run smoke:production:punctuation
```

The smoke creates an isolated demo session on production, confirms `punctuationProduction` is enabled, completes one Worker-backed Smart review item through summary, completes one GPS test item through delayed review, checks Parent Hub Punctuation evidence for hidden-field redaction, and starts a Worker-backed English Spelling session with a redacted prompt token. This keeps the Punctuation rollout gate tied to the live subject command boundary while also proving the reference Spelling subject still starts correctly.

## Expansion Path

The next Punctuation release should deepen one learning cluster or validator family at a time. Each expansion needs enough fixed items, generated templates, negative tests, misconception tags, transfer facets, and reward-unit denominators before learner-facing mastery claims are widened.

Do not expose planned clusters just because monster assets exist. Bellstorm Coast rewards should continue to follow secure learning evidence.

## Legacy Parity Baseline

Full legacy HTML learner-facing parity is now claimed against the repo-local baseline. This means the legacy modes and item behaviours are available through the production Worker-owned subject, not that the old single-file architecture has been copied.

The baseline fixture lives at:

```txt
tests/fixtures/punctuation-legacy-parity/legacy-baseline.json
```

The comparison helper lives at:

```txt
shared/punctuation/legacy-parity.js
```

The baseline currently classifies legacy behaviour as:

- Ported: the 14-skill map, Worker command runtime, Smart review, guided learning, dedicated weak spots, GPS test mode, `choose`, `insert`, `fix`, `transfer`, `combine`, `paragraph`, deterministic transfer validators, safe context-pack compilation, reward-unit analytics, session-mode and item-mode analytics, weakest facets, daily goal, streak, recent mistakes, and Parent/Admin evidence.
- Replaced: legacy standalone `choose`, `insert`, `fix`, `transfer`, sentence-combining, and paragraph-repair session buttons are represented by production item modes inside Smart review, weak spots, guided practice, GPS, and focused cluster sessions. The legacy browser AI lane is represented by a server-side context-pack compiler that can only contribute sanitised atoms to deterministic generators.
- Rejected: the legacy single-file production route, localStorage source of truth, browser-owned marking, browser-stored AI provider keys, browser-direct provider calls, unconstrained free-writing auto-scoring, and AI-authored score-bearing items or marking decisions.

This baseline is deliberately a guardrail, not a demand to copy the legacy architecture. New parity slices should update the fixture status only when the replacement Worker-owned implementation, redacted read model, tests, and release gate exist.
