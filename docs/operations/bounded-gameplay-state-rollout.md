---
module: platform-runtime
tags: [cloudflare, d1, gameplay-state, capacity, rollback]
problem_type: architecture-migration
---

# Bounded gameplay state rollout

Migration `0023_bounded_gameplay_state.sql` removes lifetime item history from
the normal gameplay document for Spelling, Grammar, Reading and Punctuation.
Migration `0024_post_mega_seed_preimages.sql` keeps the destructive Post-Mega
QA seed compatible with that boundary by archiving and restoring rows inside
D1. The six-subject application and Hero Camp remain one platform; this is a
storage-authority change, not a Spelling-app migration.

## Runtime contract

Normal play loads a bounded live/session record and only the item rows needed
by the current command. Lifetime history remains durable and addressable in D1
but is never parsed, cloned, returned or rewritten as one learner-sized JSON
blob. Bootstrap and Hero use compact read models and counters. Hero claim
evidence comes from the bounded `practice_sessions` lifecycle record and D1
projects only its `heroContext` fragment; it never falls back to a subject
document. R2 remains an audio/object store and is not part of command-state
authority.

This follows the same separation used by authoritative online-game servers:
the server owns the current match/session transition, while durable history and
ranking/read projections are separate from the latency-critical loop. Nakama's
[authoritative multiplayer model](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/)
and [leaderboard storage guidance](https://heroiclabs.com/docs/nakama/concepts/leaderboards/best-practices/)
describe that boundary. D1 batches provide ordered transactional writes, so
one command's bounded state, receipt and learner CAS remain atomic; see the
[D1 batch contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

A Durable Object is not introduced for this change. These are turn-based,
request/response commands, the existing learner revision is the concurrency
authority, and another network hop would not remove the historical-blob cost.

The bound is explicit rather than aspirational:

- Spelling answer and continue commands point-read the active round roster,
  plus a fixed achievement evaluator projection. The projection contains the
  three saturated progress records, singleton/current-pattern unlock latches
  and at most the eight newest Boss unlocks. A one-word answer can therefore
  return no more than 29 item-and-achievement rows, regardless of lifetime
  history.
- A Spelling start that needs weighted selection may inspect the current
  published catalogue once. That catalogue is product content, not learner
  history; retired words remain outside the query. `stats_json` holds the six
  pool counters, a catalogue fingerprint and due/trouble histograms, so the
  request clock can advance and an answer can update exact counters without a
  catalogue or history scan.
- Grammar and Reading hydrate only active session, retry and scheduler keys.
  Punctuation keeps compact Star evidence and aggregate item totals in the
  live record, then point-reads only the command candidate/session set.
- Every historical Spelling unlock remains an exact row in
  `spelling_achievement_state`. Only the three internal threshold evaluators
  are semantically saturated at the amount of evidence that can still affect
  a future transition. The original legacy document remains in the migration
  archive for exact rollback.

Punctuation deliberately treats its 15,072 generated prompt IDs as attempt
evidence, not as 15,072 independent curriculum authorities. After 0023,
weak/due and guided scheduling, learner summaries and Hero review signals use
bounded skill-by-mode facets plus recent misses. Hydrated item memory can
weight only the fixed candidate window and remains available as exact Star
evidence and lifetime history. This is an intentional scheduling-model change,
not a claim of byte-for-byte legacy item-selection parity: it removes lifetime
prompt history from the command authority while retaining every item row.

The selected-learner bootstrap keeps the same compact Spelling counter
semantics used before 0023. The first content-aware Spelling command stamps the
catalogue fingerprint and exact pool/schedule projection. A later content
release invalidates that fingerprint and triggers the same bounded,
current-catalogue rebuild; lifetime rows are never involved.

## Local proof gates

The automated capacity fixtures deliberately seed 10,000 retired rows for
each split subject. The Spelling fixture also seeds 10,000 historical Boss
unlocks. It proves that one answer reads only its one-word roster and the
fixed achievement projection while all cold rows remain byte-for-byte
untouched. Migration, rollback verification and re-forward verification use
set-wise comparisons; the fat Spelling fixture must complete the full local
round trip in under five seconds so an accidental correlated learner-by-item
scan fails the suite.

## Why the rollout uses a write drain

The new Worker is intentionally compatible with the pre-0023 schema. Before
the readiness row exists it reads and writes legacy documents; after readiness
it uses the split stores. A request admitted just before migration could finish
after the final backfill and otherwise become a late legacy write.

`GAMEPLAY_MUTATIONS_PAUSED=1` closes that handover race. It returns a retryable
`503 gameplay_mutations_paused` with `Retry-After: 30` for learner/gameplay
mutations before auth or D1 work, while health, bootstrap, Hero read models and
all other reads remain available. The flag is checked in memory and has zero D1
cost in normal operation. This is a controlled write drain, not a claim of
zero-downtime mutation migration.

## Production rollout

Do not change the order. Code must be live before schema authority changes.

1. Prepare and prove the compatibility Worker locally:

   ```bash
   npm test
   npm run build
   npm run build:worker
   npm run check
   npm run db:migrations:list:remote
   ```

2. Deploy the compatibility Worker with normal writes enabled:

   ```bash
   npm run deploy
   ```

   Verify the production build/version and perform a logged-in start/submit
   smoke on the old schema. Do not continue if any route writes split tables
   before readiness or returns a missing-table error.

3. Deploy the same Worker with the release fence enabled:

   ```bash
   npm run deploy:gameplay-pause
   ```

   A POST to a subject command or Hero command must return status 503, code
   `gameplay_mutations_paused`, `retryable: true`, and `Retry-After: 30`.
   `GET /api/health`, bootstrap and Hero read-model traffic must continue.

4. From the first confirmed paused response, allow at least 60 seconds for
   already-admitted commands to finish. Keep the production tail open and do
   not migrate while a pre-fence subject, Hero, learner-reset or seed mutation
   is still in flight.

5. Capture the rollback point, then apply the migration through the repository
   scripts:

   ```bash
   npm run db:backup:remote
   npm run db:migrate:remote
   npm run db:verify:0023:remote
   npm run db:verify:0024:remote
   ```

   Every verification row must report `ok = 1`. The proof exposes counts and
   value-mismatch totals only, never learner content. Keep the write fence
   active if readiness, row counts, item values or embedded-map checks
   disagree.

   The 0023 proof compares the live split authority with its frozen cutover
   archive. Run it only while the fence is active, before any post-cutover
   gameplay write; legitimate new history will make that parity proof fail
   closed after mutations resume.

6. Resume mutations by deploying the normal configuration:

   ```bash
   npm run deploy
   ```

7. In a logged-in production browser on `https://ks2.eugnel.uk`, smoke start
   and submit for all six subjects, open Hero Camp, and confirm bootstrap/Hero
   read models. Tail the release and require zero CPU-limit, D1-overload and
   unplanned 5xx signals before closing the rollout.

## Rollback

Cloudflare correctly warns that reverting Worker code does not revert D1 data
structures. Never deploy an old Worker directly after bounded writes have
landed; see [Workers rollback constraints](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

1. Deploy `GAMEPLAY_MUTATIONS_PAUSED=1`, prove the fence, drain admitted writes
   for at least 60 seconds, and capture a fresh D1 backup.
2. Materialise the current split authority into the legacy JSON documents:

   ```bash
   npm run db:recover:0023:materialise:remote
   npm run db:recover:0023:verify:remote
   ```

3. Require every verification row to report `ok = 1`. This includes the
   `legacy-authoritative` marker, bidirectional per-learner item parity for all
   four split subjects, and complete Spelling learner-row parity. If proof
   fails, stop: keep the new Worker paused and investigate.
4. Roll the Worker back only after proof passes, then run the old-version
   logged-in gameplay smoke.

The materialiser preserves all split tables and the archive, but changes the
0023 marker to `legacy-authoritative` only after the legacy documents are
complete. This is an authority hand-off, not a runtime feature flag: current
isolates can cache positive readiness, which is why the fence and full drain
are mandatory. Do not rerun the materialiser after an old Worker has received
traffic; doing so would overwrite its newer legacy writes from stale split
rows.

To return to the bounded Worker after an old Worker has written legacy state:

1. Deploy the current Worker with `GAMEPLAY_MUTATIONS_PAUSED=1`, prove the
   fence, drain admitted old-Worker writes, and capture a fresh D1 backup.
2. Reconcile the current legacy authority into split rows and verify it:

   ```bash
   npm run db:recover:0023:reforward:remote
   npm run db:verify:0023:remote
   npm run db:verify:0024:remote
   ```

3. Require every verification row to report `ok = 1`, then deploy the normal
   current Worker and repeat the logged-in six-subject and Hero Camp smoke.

The re-forward command deliberately executes the idempotent 0023 SQL directly;
the D1 migration ledger already records 0023 and therefore cannot perform this
second authority transfer through `db:migrate:remote`.

Post-Mega seed rollback is separate from a Worker rollback. An overwrite after
0023 returns a small `preimageId`; the authoritative learner and item rows stay
in `spelling_seed_preimages`, `spelling_seed_preimage_items` and
`spelling_seed_preimage_achievements`, never in an HTTP response or mutation
receipt. An admin can restore that exact snapshot through
`POST /api/admin/spelling/restore-post-mega` with `learnerId`, `preimageId` and
a unique mutation request id. The restore is idempotent, learner-revision
guarded and copies item and achievement history D1-to-D1.

## Failure handling

- Migration failure: keep the fence active, inspect the error, and safely
  re-run `npm run db:migrate:remote`; the backfills and cleanup are idempotent.
- Verification failure: do not resume writes. Compare the latest backup and
  count-only proof before changing data.
- Application failure after cutover: prefer a forward code fix. Use the
  materialiser only when an old Worker rollback is genuinely required.
- Never trim, discard or cap lifetime learner history to recover capacity. The
  performance invariant is that history size is absent from normal gameplay
  work, not that a learner is prevented from accumulating history.
