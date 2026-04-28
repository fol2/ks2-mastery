# Punctuation Production Subject

Punctuation is now a production subject slice for KS2 Mastery, built from the legacy engine ideas without shipping the legacy single-page engine to the browser.

The release deliberately keeps the learner engine first. Monsters and Codex rewards are projections from secured learning evidence; they are not the primary game loop and they do not drive scoring.

## Current Release Scope

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

Generated practice now runs through a deterministic compiler. Each published generator family can add extra practice items to the runtime manifest under a fixed release seed, so the Worker can broaden practice without using browser-owned random generation, runtime AI, or changing the published reward denominator. Generated items carry `source: generated` internally, but the browser still receives only the redacted live-item read model.

Generated item guardrails:

- The production runtime service uses `generatedPerFamily: 4`, giving 171 runtime items while keeping the published reward denominator unchanged. Lower-level generator and audit compatibility fixtures still exercise `generatedPerFamily: 1`.
- Each generated item carries a stable `templateId` and opaque `variantSignature`. The scheduler uses recent signatures to avoid equivalent retries, and Star evidence uses signatures before item ids when a generated surface has an available signature.
- Template-bank expansion appends new templates after the first two legacy templates. The first generated runtime variant is preserved when the bank grows.
- The audit command `npm run audit:punctuation-content -- --strict --generated-per-family 4` checks generated family coverage, validator coverage, duplicate variant signatures, distinct signature counts, and generated model-answer marking. Duplicate stems/models remain reported for content review; add `--fail-on-duplicate-generated-content` when a review specifically wants those surfaced as hard failures.

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

- ordered KS2 list-comma patterns; an otherwise-correct Oxford comma before `and` is accepted unless the item explicitly forbids the final comma
- opening phrase commas after fronted adverbials such as `After lunch,`
- opening phrase commas that make meaning clearer, such as `In the morning,`

Boundary marking adds deterministic transfer validators for:

- semi-colons between preserved related clauses
- spaced hyphen, en dash, or em dash marks between preserved related clauses
- exact hyphenated phrases that avoid ambiguity, such as `well-known author`

Structure marking adds deterministic transfer validators for:

- comma-marked parenthesis around preserved extra information
- colons before preserved lists after complete opening clauses
- semi-colons between complex list items
- colon-led bullet lists with preserved bullet items

Combine marking adds stricter one-sentence validators for the first legacy-shaped rewrite families:

- list-comma note combination; an otherwise-correct Oxford comma before `and` is accepted unless the item explicitly forbids the final comma
- fronted-adverbial rewrites with the opening comma
- parenthesis rewrites with matched commas, brackets, or dashes
- colon-list combinations after a complete opening clause
- semi-colon clause combinations that reject comma splices
- spaced hyphen, en dash, or em dash clause combinations that reject unpunctuated joins

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
- `record-event` (Phase 4 — telemetry pipeline)
- `request-context-pack` (Phase 2 — AI context-pack compilation, stub)
- `punctuation-diagnostic` (P7-U8 — admin-only diagnostic read model)

The Worker owns session creation, item selection, marking, scheduling, progress mutation, completed-session writes, domain-event append, reward projection, and the returned read model. The React browser surface sends learner intent and renders the returned state.

## Events And Rewards

Punctuation emits domain events:

- `punctuation.item-attempted`
- `punctuation.misconception-observed`
- `punctuation.unit-secured`
- `punctuation.session-completed`
- `punctuation.star-evidence-updated` (P7-U4 — emitted when live Star evidence exceeds persisted `starHighWater` for a monster)

### Monster Roster (Phase 2)

The Punctuation roster collapsed in Phase 2 to three active direct creatures plus one grand:

- Pealark: Endmarks, Speech, Boundary (5 reward units)
- Claspin: Apostrophe (2 reward units)
- Curlune: Comma / Flow, List / Structure (7 reward units)
- Quoral (grand): full 14 published reward units aggregated across every cluster

Reserved for future Punctuation expansions:

- Colisk
- Hyphang
- Carillon

Reserved creatures stay in the `MONSTERS` manifest so the Monster Visual Config tooling, asset manifest, and Admin review pipeline continue to cover them. They are filtered out of active learner Codex / Parent Hub / Admin Hub summaries via the `PUNCTUATION_RESERVED_MONSTER_IDS` constant.

### Migration from the pre-Phase-2 roster

Pre-flip learner progress is preserved without a stored-state rewrite:

- `src/platform/game/mastery/punctuation.js` exports a read-only `normalisePunctuationMonsterState(state)` that unions stored `carillon.mastered` keys into the new `quoral` grand view on every read.
- `punctuationTotal(entry, fallback, { monsterId })` forces the grand monster to read the release denominator (14) regardless of stored `publishedTotal`. Pre-flip learners with `quoral.publishedTotal: 1` display correctly.
- Reward writes on the new cluster map organically rewrite stored `publishedTotal` on the next post-flip secure, so stored state self-heals without a migration script.
- `worker/src/projections/events.js` adds `terminalRewardToken` — a projection-layer dedupe on `(learnerId, monsterId, kind, releaseId)` that collapses pre-flip + post-flip `caught`/`mega` events for the same milestone. Cross-release mega re-emission stays intentional.

### Rollback

Rollback to the pre-Phase-2 bundle is lossless for learners whose stored Quoral entry has `publishedTotal: 1` with one mastered key. The pre-flip bundle reads the stored `publishedTotal: 1` directly (pre-flip Quoral was a direct Speech monster with `masteredMax: 1`), so `punctuationStageFor(1, 1)` returns stage 4 — exactly the stage these learners saw pre-flip. Quoral only carried `speech-core` under the pre-Phase-2 roster, so no learner could have `publishedTotal > 1` from the old code path. Post-Phase-2, if U7's writer path has rewritten a learner's stored `publishedTotal` upward to 14 before rollback, the pre-flip bundle would read `punctuationStageFor(mastered, 14)` and display stage 1 instead of stage 4. That case is avoided in practice because U6's read-time override provides correct display without requiring a stored-value rewrite; confirm the cohort is empty via production D1 before deploying rollback.

### Domain events

The Punctuation service does not mutate game state directly. It emits domain events; the reward projection records deduplicated mastery keys in the Monster Codex state. Replayed commands or duplicate `unit-secured` events do not double-award the same mastery key. Mastery keys use the stable format:

```txt
punctuation:<releaseId>:<clusterId>:<rewardUnitId>
```

Migration-read coverage for historical mastery keys lives in `tests/punctuation-monster-migration.test.js`.

### 100-Star Evidence Model (Phase 5 + Phase 7)

The child-facing reward display uses a 100-Star scale per direct monster. Stars are derived from four evidence categories, accumulated through practice:

- **Try Stars** — earned from first attempts at items, regardless of correctness.
- **Practice Stars** — earned from repeated practice across varied items.
- **Secure Stars** — earned when reward units reach secured state (repeated clean evidence, accuracy, streak, and spaced return).
- **Mastery Stars** — earned from deep mastery: facet coverage across multiple item modes, spaced return confirmation, and mixed-mode breadth.

Each direct monster (Pealark, Claspin, Curlune) has a maximum of 100 Stars. The stage thresholds for direct monsters are `[10, 30, 60, 100]` Stars for stages 1-4 respectively.

Quoral (grand monster) uses cross-monster breadth rather than per-monster depth. Grand Stars are computed from aggregate evidence across all direct monsters: secured unit count, deep-secured unit count, monster coverage, and overall practice breadth. Grand Star stage thresholds are `[10, 25, 50, 100]`.

#### Secured vs Deep-Secured Reward Units

A **secured reward unit** has reached the scheduler's secure state — repeated clean evidence, accuracy above threshold, streak length, and at least one spaced return.

A **deep-secured reward unit** goes further: the learner has demonstrated facet coverage across multiple item modes (e.g. `choose`, `insert`, `fix`, `transfer`), confirmed spaced return at the facet level, and shown mixed-mode breadth within the reward unit's cluster.

Deep-secured units gate Mega stage eligibility and contribute additional Mastery Stars.

#### Direct Stars vs Grand Stars

**Direct Stars** are per-monster, max 100. They measure depth within the monster's assigned clusters: how much a learner has tried, practised, secured, and mastered the specific skills assigned to that monster.

**Grand Stars** (Quoral) are cross-monster. They measure breadth across the entire Punctuation subject: how many secured and deep-secured units exist across all clusters, how many monsters show evidence, and overall practice coverage.

#### Codex `starHighWater` vs Live Projection

The **live projection** (`projectPunctuationStars`) recomputes Stars from all attempts and reward-unit evidence on every Worker command. This is the source of truth for the child-facing display.

The **codex `starHighWater`** is a persisted latch — it only ratchets upward. It records the highest Star count ever observed for each monster. The latch is used for stage-transition events, toast thresholds, and durable progress markers.

The `mergeMonotonicDisplay` function ensures the child always sees `max(starHighWater, liveProjection)`, so even if a learner's live evidence temporarily dips (e.g. after a poor session), the display never regresses.

#### Star-Evidence Latch Writer (P7-U4)

Prior to P7, `starHighWater` only advanced when a reward unit was secured (`punctuation.unit-secured` events). A learner practising extensively without securing new units would see correct Star display (via live projection) but the persisted latch would not advance.

P7-U4 closes this gap. After every Worker command, the command handler computes Star evidence per monster and compares against the persisted `starHighWater`. If `liveStars > starHighWater` for any monster, a `punctuation.star-evidence-updated` domain event is emitted. The mastery layer subscribes and ratchets:

- `starHighWater = max(existing, computedStars)` (with IEEE 754 epsilon guard: `Math.floor(n + 1e-9)`)
- `maxStageEver = max(existing, derivedStage)`

The latch writer does NOT emit toast events — toast timing remains on reward-unit mastery events only. This preserves existing celebration timing while ensuring the persisted latch accurately tracks accumulated evidence.

Writes are monster-targeted (each monster updates independently) and idempotent (`max` is idempotent, so duplicate event replay is safe).

## AI Context Pack Decision (Phase 2)

The Worker plumbing for an AI-assisted context-pack compiler stays in place, but the learner React surface deliberately ignores the field in Phase 2. The existing `safeContextPackSummary` allowlist ensures any future upstream field addition trips the fail-closed redaction guard added in Phase 2 U2. Phase 3 will decide whether to productise the context pack as a post-feedback learner surface or keep it teacher/admin-only; until then, the Parent / Admin evidence path is the only surface that consumes it.

## Read-Model Redaction (Phase 2)

Every phase output (active item, feedback, summary, GPS review, analytics, Parent / Admin evidence, context-pack summary) is built from explicit allowlists. A recursive `assertNoForbiddenReadModelKeys` scan runs on the assembled payload before it leaves the Worker so a forbidden field added at any depth of any branch (e.g. `summary.metadata.rawGenerator`, `reviewRow.validator`, `analytics.byItemMode[].rubric`) throws in `NODE_ENV=test` and emits a structured warning + strips the field in production.

The forbidden-key set is kept aligned between `worker/src/subjects/punctuation/read-models.js` (`FORBIDDEN_READ_MODEL_KEYS`) and `scripts/punctuation-production-smoke.mjs` (`FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS`). Adding a new forbidden key means editing both files in the same PR; CI will fail with a clear "server-only field: &lt;key&gt;" message if drift is introduced.

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

- manifest validation for the 14-skill map, current release scope, readiness rows, and stable reward keys
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

## Operational Telemetry

This section is split into two parts so readers can tell what the code writes from what the code only promises to write one day. **Wired telemetry** lands in D1 today (behind a feature flag that is OFF by default). **Aspirational telemetry** is the set of log warning codes emitted by Phase 2 that still have no ingesting consumer.

### Wired telemetry (Phase 4 U9)

Phase 4 U9 lands the Worker half of a 12-event telemetry pipeline that the Phase 4 U4 client emitter prepared. Rows are written to the D1 table `punctuation_events` (migration `worker/migrations/0012_punctuation_events.sql`) when the `env.PUNCTUATION_EVENTS_ENABLED` flag is truthy (`'1' | 'true' | 'yes' | 'on'`). With the flag absent or set to `'false'`, the `record-event` command still runs authz + allowlist validation (so a rogue client is still rejected) but skips the D1 insert.

**Event kinds (12, frozen).** The allowlist lives in the shared module `shared/punctuation/telemetry-shapes.js` (imported by both the U4 client emitter at `src/subjects/punctuation/telemetry.js` and the U9 Worker handler at `worker/src/subjects/punctuation/events.js`):

- `card-opened` — `{ cardId }`
- `start-smart-review` — `{ roundLength }`
- `first-item-rendered` — `{ sessionId, itemMode }`
- `answer-submitted` — `{ sessionId, itemId, correct }` (**no `answerText`, `promptText`, or `typed` — the Worker rejects these fields with 400**)
- `feedback-rendered` — `{ sessionId, itemId, correct }`
- `summary-reached` — `{ sessionId, total, correct, accuracy }`
- `map-opened` — `{}`
- `skill-detail-opened` — `{ skillId }`
- `guided-practice-started` — `{ skillId, roundLength }`
- `unit-secured` — `{ clusterId, monsterId }`
- `monster-progress-changed` — `{ monsterId, stageFrom, stageTo }`
- `command-failed` — `{ command, errorCode }` (no raw error messages, no stack traces)

Any field not on the kind's allowlist is **rejected** (not scrubbed) with a 400 `punctuation_event_field_rejected`. Wrong-typed fields are rejected with `punctuation_event_field_type_invalid`. Forbidden-key defence-in-depth also runs (`accepted`, `rubric`, `validator`, etc. plus the PII names `answerText`, `promptText`, `typed` — even if a future allowlist addition matched them).

**Authz.** The `record-event` command routes through `repository.runSubjectCommand` at `worker/src/repository.js` — which fires `requireLearnerWriteAccess`. The `{mutates: false}` flag on the client-side `punctuation-record-event` action mapping (`src/subjects/punctuation/command-actions.js`) controls pending-UI wrapping only; it does NOT bypass Worker authz. A learner cannot write telemetry rows for another learner.

**Query surface.** `GET /api/subjects/punctuation/events?learner={id}&kind={optional}&since={ms}&limit={n}`. Returns an array of `{kind, payload, occurredAtMs}` sorted reverse-chronological. Limit defaults to 100, clamps to 500. Authz via `requireLearnerReadAccess` (parent / admin / owner membership required).

**Rollout steps.**

1. `npm run db:migrate:remote` applies migration 0012 (adds the table + indexes; idempotent).
2. Flip `PUNCTUATION_EVENTS_ENABLED=true` in the staging environment.
3. Smoke: run a 4-question Smart Review round in staging and verify `SELECT COUNT(*) FROM punctuation_events WHERE learner_id = ?` returns the expected 10 rows (1× `card-opened`, 1× `start-smart-review`, 1× `first-item-rendered`, 4× `answer-submitted`, 4× `feedback-rendered`, 1× `summary-reached` — other kinds do not fire in the smart-review flow).
4. Let staging accumulate 72h of real data.
5. Flip the flag in production.

**What Phase 4 U9 does NOT ship:** a dashboard, an alerting pipeline, or any downstream consumer. The events are queryable directly from D1 (ad-hoc via the query endpoint above or a `wrangler d1 execute` call). Wiring a dashboard is deliberately out of scope — see "Aspirational" below and the follow-up candidates.

**Retry idempotency (review follow-on 2026-04-26).** The D1 table carries a `UNIQUE (learner_id, request_id) WHERE request_id IS NOT NULL` index, and the Worker handler issues `INSERT OR IGNORE`. A retried telemetry call with the same `requestId` is silently deduped at the storage layer and returns `{recorded: false, deduped: true}` in the response. The client remains fire-and-forget; the dedup is a defence against a client that aggressively retries network-drop telemetry posts.

**`command-failed.errorCode` enum (review follow-on 2026-04-26).** `command-failed` carries a closed enum of 7 error codes (`backend_unavailable`, `validation_failed`, `rate_limited`, `forbidden`, `timeout`, `read_only`, `unknown`) exported from `shared/punctuation/telemetry-shapes.js` as `PUNCTUATION_TELEMETRY_ERROR_CODES`. An out-of-enum value is rejected by the Worker with `400 punctuation_event_errorcode_not_allowed` and stripped client-side before dispatch. Closes a PII smuggling sibling to the `errorMessage` denylist the forbidden-key scan already blocks.

**Schema hardening (review follow-on 2026-04-26).** Migration 0012 was rewritten in place (rather than landing a 0013 ALTER) because the `PUNCTUATION_EVENTS_ENABLED` flag is OFF in every deployed environment — no production rows are at risk. The hardened schema adds:

- `learner_id TEXT NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE` — GDPR erasure on the parent row cascades to telemetry.
- `CHECK (event_kind IN (...))` anchored to the 12 frozen event kinds — direct `wrangler d1 execute` inserts with arbitrary kind values are rejected at the storage boundary.
- `CHECK (json_valid(payload_json))` — a corrupt payload can never reach the downstream query-helper `JSON.parse`.
- `request_id TEXT` + `UNIQUE (learner_id, request_id)` — the retry dedup described above.

**Time-windowed rate limiting (P7-U6).** Sessionless telemetry kinds (e.g. `card-opened`, `map-opened`) previously used a lifetime per-learner cap. After 50 cumulative events across all sessions, the learner would be permanently rate-limited. P7-U6 replaces the lifetime cap with a rolling 7-day window: `COUNT(*) WHERE learner_id = ? AND event_kind = ? AND occurred_at_ms > ?` using `Date.now() - 7 * 86400000`. After 7 days, old events fall out of the window and the learner can emit again. Per-session caps (when `sessionId` is present) remain unchanged.

Rate-limited and deduped events are distinguishable in the response: `{ recorded: false, rateLimited: true }` vs `{ recorded: false, deduped: true }`.

**Query audit (P7-U6).** Event timeline reads (`queryPunctuationEvents`) accept an `audit` callback. When provided, the callback fires after each query with `{ learnerId, kind, appliedLimit, resultCount, readAtMs }` so the repository layer can record the read in the ops audit surface. Audit failures are best-effort — they never break the read path. All event timeline queries are bounded (`LIMIT` clamped to [1, 500]) and require a learner ID — no unbounded scans.

**Previous rollout deferrals (now resolved).**

- Per-session / per-learner rate-limit: resolved by P7-U6 time-windowed policy. Sessionless kinds use a 7-day rolling window; per-session kinds retain their existing per-session cap.
- Audit trail on query-endpoint reads: resolved by P7-U6 `audit` callback wiring.

### Aspirational telemetry (log warning codes with no consumer) [ASPIRATIONAL]

Phase 2 shipped a set of structured warning codes emitted via the existing `logMutation('warn', …)` path. The codes below are stable so a future observability work item can consume them. The repo does not currently have a dashboard or alerting pipeline that ingests these codes — the thresholds quoted here are **aspirational**, not enforced. Until the pipeline lands, operators reviewing Worker logs after a release should watch for:

- `punctuation-redaction-unknown-key-strip` — expected zero. Any non-zero count indicates an upstream field addition that did not update the allowlist. Investigate immediately.
- `punctuation-normaliser-malformed-key` — expected low baseline. Sustained activity indicates stale or malformed stored mastery keys that the deferred repair script should address.
- `punctuation-command-stale-response-drop` — expected low. Spikes indicate client/server revision drift or flaky network.
- `punctuation-command-dedupe-reject` — expected non-zero for real double-submit cases. Spikes indicate UI regression on the disable state machine.
- "Stuck-at-1" learner count — a diagnostic query on `child_game_state.punctuation.quoral.publishedTotal < 14` run manually from the D1 console during release week. Expected non-zero initially, trending down as learners practise. A non-draining tail should escalate to the deferred repair script.

These codes and queries are not currently wired to a consumer. This section is **aspirational** — the thresholds and metric names are stable but no dashboard or alerting pipeline consumes them. The acceptance criteria for graduating them from aspirational to enforced are listed below under "Phase 4 follow-up candidates".

## Punctuation Doctor (P7-U8)

A server-side diagnostic read model is available via the `punctuation-diagnostic` admin command. The diagnostic is for developers and operators only — there is no child-facing Doctor surface.

**Usage.** Send a `punctuation-diagnostic` command through the subject command boundary (gated behind admin auth). The command branches early and bypasses the engine/projection pipeline — it reads state but does not mutate it.

**Output.** The diagnostic returns a structured object answering:

- Per direct monster (Pealark, Claspin, Curlune): live Stars, `starHighWater`, delta between live and latch, stage, `maxStageEver`, breakdown by evidence category (Try/Practice/Secure/Mastery Stars), Mega blockers, reward units tracked/secured/deep-secured.
- Grand monster (Quoral): grand Stars, grand stage, monsters with secured units, total secured/deep-secured across all clusters.
- Latch state: whether the latch leads live or live leads latch, per monster.
- Telemetry: events accepted/dropped/deduped/rate-limited, last event timestamp, per kind.
- Session context: session ID, command count, last command timestamp.

**Safety.** The output contains only IDs, counts, booleans, timestamps, and safe labels. A recursive forbidden-key scan covers the entire diagnostic payload — no `acceptedAnswers`, `answerBanks`, `correctIndex`, `validators`, or `generatorSeeds` can appear. The diagnostic module lives under `worker/src/subjects/punctuation/` and is forbidden from the client bundle by the `FORBIDDEN_MODULES` audit.

**Admin consumption.** The `normalisePunctuationDiagnostic` normaliser (following the `admin-debug-bundle-panel.js` pattern) provides defensive type coercion and fallbacks for admin panel rendering.

## Phase 4 follow-up candidates

Items deliberately deferred from earlier phases and scheduled for a future Phase 4 (or a dedicated observability work item):

- **[ASPIRATIONAL] Wire the Operational Telemetry warning codes to a consumer.** Concrete acceptance criteria for each code:
  - Query surface: Cloudflare Workers Analytics Engine, Logpush to an ingesting store, or a Grafana / Loki query pane fed by the Worker log stream. Any one of these is acceptable — the choice is a platform decision, not a code decision.
  - Metric names (stable; match the warning code verbatim to avoid rename drift): `punctuation-redaction-unknown-key-strip`, `punctuation-normaliser-malformed-key`, `punctuation-command-stale-response-drop`, `punctuation-command-dedupe-reject`, `punctuation-quoral-stuck-at-1`.
  - Thresholds: `*-unknown-key-strip` must alert on any non-zero 24h window; `*-malformed-key` must alert on > 10 / 24h sustained for 3 consecutive days; `*-stale-response-drop` must alert on > 50 / 24h; `*-dedupe-reject` must alert on a 7-day-over-7-day increase of > 3x; `*-stuck-at-1` must alert only if the count fails to decrease week-over-week for two consecutive weeks post-release.
  - Consumer: an on-call operations rotation (TBD — likely the same consumer as the Admin Ops Console alert feed once that exists). The default is that this lands as a companion PR alongside whichever phase adds the dashboards.
- **AI context-pack learner surface.** Phase 2 deferred this deliberately (`safeContextPackSummary` allowlist is already fail-closed). Phase 3 U8 strips it from the default child read model. A Phase 4 decision is required: either productise it as a Parent / Admin-only "Why this question?" surface, or retire the Worker plumbing entirely. The `punctuation-context-pack` client action remains in place as a stub so either path is reachable without a command-surface rewrite.
- **[ASPIRATIONAL] Dashboard + alerting on `punctuation_events` (post-Phase-4).** Phase 4 U9 ships the D1 table + query endpoint + the 12-event pipeline but deliberately stops short of a dashboard. A post-Phase-4 work item should add: (a) a Cloudflare Workers Analytics Engine or Logpush sink that copies each new row; (b) alert rules on `command-failed` spikes (> 1% of sessions in a 24h window) and on zero-row days (ingest pipeline stalled); (c) a weekly aggregation that joins `punctuation_events.answer-submitted` against the mastery projection to surface under-practising learners. The acceptance criteria mirror the warning-code bullet above — same query-surface options, same consumer rotation.

These items are tracked here (rather than in a GitHub issue) so the doc stays the single source of truth for Punctuation production concerns. When a Phase 4 work item starts, copy the relevant bullet into a tracking issue and link it back to this section.
