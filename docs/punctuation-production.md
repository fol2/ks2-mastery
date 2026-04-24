# Punctuation Production Subject

Punctuation is now a production subject slice for KS2 Mastery, built from the legacy engine ideas without shipping the legacy single-page engine to the browser.

The release deliberately keeps the learner engine first. Monsters and Codex rewards are projections from secured learning evidence; they are not the primary game loop and they do not drive scoring.

## First Release Scope

Release id:

```txt
punctuation-r1-endmarks-apostrophe-speech
```

Published skills:

- Capital letters and sentence endings
- Apostrophes for contraction
- Apostrophes for possession
- Inverted commas and speech punctuation

Planned but not yet public:

- Commas in lists
- Fronted adverbial commas
- Parenthesis
- Commas for clarity
- Colons before lists
- Semi-colons between clauses
- Dashes between clauses
- Semi-colons in lists
- Bullet-point punctuation
- Hyphens to avoid ambiguity

This preserves the legacy engine's 14-skill map while shipping only the content that has enough fixed items, transfer coverage, misconception tags, and negative tests for the first production slice.

## Measurement Model

Punctuation mastery is measured by release-scoped reward units, not by raw quiz completion.

Current published reward units:

- `sentence-endings-core`
- `apostrophe-contractions-core`
- `apostrophe-possession-core`
- `speech-core`

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

The first Speech rubric is deliberately strict:

- accepts matched straight or curly single/double inverted commas
- requires the spoken-word punctuation inside the closing inverted comma
- rejects extra terminal punctuation outside the quote
- checks reporting-clause comma patterns where required
- checks capitalisation and unchanged target words
- returns stable misconception tags such as `speech.quote_missing`, `speech.punctuation_outside_quote`, and `speech.words_changed`

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
- Comma / Flow: Curlune, planned
- List / Structure: Colisk, planned
- Boundary: Hyphang, planned
- Published release aggregate: Carillon

The Punctuation service does not mutate game state directly. It emits domain events; the reward projection records deduplicated mastery keys in the Monster Codex state. Replayed commands or duplicate `unit-secured` events do not double-award the same mastery key.

## Browser Read Model And Lockdown

The browser read model is an allowlist. It may show the current prompt, stem, safe answer choices, feedback, correction copy, rubric facets, and summary data.

It must not expose server-only fields such as accepted answer lists, `correctIndex`, validators, raw rubric definitions, content generators, hidden queues, unpublished items, or the domain engine.

The production bundle audit now rejects:

- `shared/punctuation/content.js`
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
- asset tests for Bellstorm Coast scenes and Punctuation monster artwork
- bundle/public-output audits proving engine/content source is not shipped to the browser

Production exposure is controlled by the `PUNCTUATION_SUBJECT_ENABLED` Worker env var, which feeds the browser `punctuationProduction` subject exposure gate. The default production value is `false`: the Worker command route, dashboard card, and direct subject route stay unavailable until the full gate has passed and the env var is intentionally flipped.

Before deployment, run:

```txt
npm test
npm run check
```

After deployment, verify the production UI on `https://ks2.eugnel.uk` with a logged-in or demo browser session.

## Expansion Path

The next Punctuation release should add one cluster at a time. Each cluster needs enough fixed items, generated templates, negative tests, misconception tags, transfer facets, and reward-unit denominators before it becomes public.

Do not expose planned clusters just because monster assets exist. Bellstorm Coast rewards should continue to follow secure learning evidence.
