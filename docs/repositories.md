# Repository contract boundary

## Why this exists

The original rebuild used the repository contract to make the backend boundary explicit instead of implied.

For production full lockdown, the important boundary is now narrower: React may keep interaction state and cached read models, but production runtime authority sits behind Worker APIs. Local repositories remain available for Node tests, fixtures, and characterisation harnesses; they are not a product browser mode.

## Platform repository contract

A platform repository bundle exposes one persistence-status section, five data sections, and three lifecycle methods.

The persisted collections are versioned through repository metadata so adapters can normalise malformed payloads before the rest of the app sees them.

```txt
hydrate()
flush()
clearAll()

persistence
learners
subjectStates
practiceSessions
gameState
eventLog
```

## Persistence status

The shell does not infer persistence health from transport errors anymore.
It reads an explicit persistence snapshot from the repository adapter.

```txt
read()
subscribe(listener)
retry()
```

Current modes:

- `local-only`
  - No remote backend is active for this adapter.
  - The trusted durable copy is this browser's storage.
- `remote-sync`
  - Remote sync is available and there are no pending unsynced writes.
  - The trusted durable copy is remote.
- `degraded`
  - A remote write failed, a remote bootstrap failed and the adapter fell back to cache, or browser storage itself failed.
  - The shell must treat the state as bounded fallback state, not as confirmed remote durability.

The snapshot also carries:

- `trustedState`
  - `local`, `remote`, `local-cache`, or `memory`
- `cacheState`
  - `local-only`, `aligned`, `ahead-of-remote`, `stale-copy`, or `memory-only`
- `pendingWriteCount`
- `inFlightWriteCount`
- `lastSyncAt`
- `lastError`
- `breakers` (U9) — internal sub-namespace. A map keyed by breaker name
  (`parentHubRecentSessions`, `parentHubActivity`, `classroomSummary`,
  `readModelDerivedWrite`, `bootstrapCapacityMetadata`). Each entry is
  `{ name, state: 'closed' | 'half-open' | 'open', failureCount,
  openedAt, cooldownUntil, cooldownMs }`. Meant for operator
  observability and Playwright scenes; UI components MUST NOT read
  this surface.
- `breakersDegraded` (U9) — minimal boolean map exposed to UI
  components: `{ parentHub, classroomSummary, derivedWrite,
  bootstrapCapacity }`. Aggregates the 5 underlying breakers into 4
  public booleans. Rendering degraded UX (Parent Hub "Recent history
  temporarily unavailable", Admin Hub "Classroom summary temporarily
  unavailable", operator escalation banner for `bootstrapCapacity`)
  reads this alone and never the full state.

The `breakers.*` state vocabulary maps onto the existing
`cacheState` / `mode` grammar rather than inventing new terms: when a
breaker is `open`, the associated read path is effectively a
`stale-copy` regardless of the underlying sync state; the operator
visibility layer is the breaker, not a new cacheState value.

That lets the shell say something truthful about what state is currently safe to trust.

## Learners

Stores the shared learner snapshot used by the shell.

```txt
read()
write(snapshot)
```

The snapshot shape stays platform-wide:

```txt
byId
allIds
selectedId
```

## Child subject state

Stores one generic record per learner and subject.

```txt
read(learnerId, subjectId)
readForLearner(learnerId)
writeUi(learnerId, subjectId, ui)
writeData(learnerId, subjectId, data)
writeRecord(learnerId, subjectId, record)
clear(learnerId, subjectId)
clearLearner(learnerId)
```

The record shape is generic.

```txt
ui
data
updatedAt
```

That keeps the transport and persistence shape generic even though each subject still owns its own `data` payload.

For Spelling today:

- `ui` holds the serialisable subject UI state used for resume and routing
- `data.prefs` holds spelling preferences
- `data.progress` holds the preserved legacy progress map

## Practice sessions

Stores resumable or recent subject sessions separately from subject UI state.

```txt
latest(learnerId, subjectId)
list(learnerId, subjectId?)
write(record)
clear(learnerId, subjectId)
clearLearner(learnerId)
```

The current Spelling reference implementation writes active, completed, and abandoned session records here.

## Reward / game state

Stores reward-layer state separately from learning engines.

```txt
read(learnerId, systemId)
readForLearner(learnerId)
write(learnerId, systemId, state)
clear(learnerId, systemId)
clearLearner(learnerId)
```

The monster codex currently uses `systemId = "monster-codex"`.

## Event log

Optional append-only event storage.

```txt
append(event)
list(learnerId?)
clearLearner(learnerId)
```

The current reference wiring appends both spelling mastery events and reward events.

## Hub read models

Parent Hub and Admin / Operations are read-model surfaces above the repository boundary.
They do not add a separate reporting store.

Current hub inputs are:

- learner profiles
- learner memberships
- child subject state
- practice sessions
- event log
- account-scoped spelling content bundles
- mutation receipts

The Worker assembles those inputs behind permission-checked routes:

```txt
GET /api/hubs/parent?learnerId=...
GET /api/hubs/admin?learnerId=...&requestId=...&auditLimit=...
GET /api/admin/accounts
PUT /api/admin/accounts/role
```

Those routes are intentionally read-only.
Parent Hub requires the account-level `parent` or `admin` platform role plus readable learner membership.
Admin / Operations requires the account-level `admin` or `ops` platform role, and still respects learner membership when exposing learner diagnostics.
Account role management is narrower than general Operations access: only `admin` can list accounts or write `adult_accounts.platform_role`, and the Worker rejects demoting the last remaining admin.

Signed-in React shell rendering now consumes those Worker hub payloads through the shared hub API client.
The main repository bootstrap remains writable-only, so readable viewer learners stay in adult hub context instead of being merged into the subject runtime learner snapshot.
Remote empty bootstrap is also treated honestly: local-reference mode may seed a convenience learner, but signed-in remote mode does not fabricate a default learner when the account has no writable membership.

## Production runtime boundary

Production subject practice no longer writes learner runtime state through broad browser-owned repository calls.

Runtime practice goes through:

```txt
POST /api/subjects/:subjectId/command
```

The Worker validates auth, learner access, demo expiry, idempotency, and expected learner revision, then runs the subject command and returns an authoritative read model. For Spelling, this covers start, answer submission, continue, end, dashboard refresh, and Word Bank drill checks.

Authorised read-only surfaces use Worker read models:

```txt
GET /api/hubs/parent?learnerId=...
GET /api/hubs/admin?learnerId=...&requestId=...&auditLimit=...
GET /api/subjects/spelling/word-bank
GET /api/subjects/spelling/word-bank?slug=...
```

The API repository adapter may still support explicit platform, operator, import, content, and reset flows, but those retained routes must not become hidden subject-engine escape hatches for learner or demo practice.

## Save and sync semantics

### Local adapter

`createLocalPlatformRepositories()` stores the generic collections in localStorage and migrates legacy PoC keys into the new generic repository shape on first load.

The local adapter is a harness for Node tests, fixtures, and local characterisation work. It is not exposed through `?local=1` and should not be used as a production browser fallback.

Write semantics are explicit:

- mutations update the in-memory bundle first
- the adapter then tries to persist the full bundle locally
- if local persistence succeeds, mode stays `local-only`
- if local persistence fails, mode becomes `degraded`
- in that degraded local case, the current browser memory is the only trusted state until persistence recovers
- `flush()` and `persistence.retry()` throw while the local write problem still exists

The local adapter does not silently swallow storage failure anymore.

### API adapter

`createApiPlatformRepositories()` exposes the same repository contract after `hydrate()`.

Write semantics are explicit:

- the mutation is applied to the local cache immediately so the live session can continue
- a semantic pending operation is recorded in the cache
- each write carries a `requestId`, `correlationId`, and expected account or learner revision
- the Worker uses database compare-and-swap plus request receipts
- if the remote write succeeds, the pending operation is cleared
- if the remote write had actually already committed and the client is only retrying, the stored response is replayed and the pending operation still clears safely
- if the remote write fails transiently, the pending operation stays queued and the adapter enters `degraded`
- if the remote write is stale, the adapter reloads the latest remote state, rebases queued local operations over the new revision, and retries the queue
- if rebase cannot complete, the failed operation and later same-scope operations become blocked with explicit `degraded` feedback
- while degraded after a remote failure, the trusted state is the local cache, not the server
- `flush()` and `persistence.retry()` throw until the pending operations are actually cleared

That means the shell no longer has to pretend a remote write succeeded just because the local cache updated.

### Reload and restore behavior

On bootstrap, the API adapter reads the remote bundle and then reapplies any locally cached pending operations.

That keeps unsynced local changes visible after reload instead of letting a stale remote bootstrap wipe them out.
When that happens, the cache is explicitly `ahead-of-remote` until a later retry clears the pending writes.

If the remote bootstrap fails but a local cache exists, the adapter continues from that cache in `degraded` mode.

## What is intentionally still deferred

- billing, invites, and messaging
- semantic merge for concurrent edits beyond the current client-side stale-write rebase
- offline retry scheduling beyond manual retry / flush behaviour
- push-based real-time invalidation across tabs / devices
- read-only viewer participation inside the writable subject shell
- Durable Object coordination beyond the current compare-and-swap backend

The Worker now has production sessions, D1-backed persistence, account-scoped ownership, repository-level authorisation for learner-scoped writes, atomic revision checks, and request-receipt replay. The remaining items are the next SaaS-hardening layer, not this pass.


## Mutation safety layer

The API-backed path now has an explicit mutation policy.

- account-scoped writes use `adult_accounts.repo_revision`
- learner-scoped writes use `learner_profiles.state_revision`
- every write route requires a `requestId`
- repeated retries with the same payload replay the stored response instead of applying twice
- stale writes return `409 stale_write`
- the client does not hide stale conflicts
- queued local operations are rebased over the latest remote state before retry
- retry / resync preserves the current route and replays pending local progress where the operation payload can be safely rebased

## Spelling content repository

Spelling content deliberately lives beside the generic platform repository instead of inside the learner subject-state payload.

The content repository exposes:

```txt
hydrate()
read()
write(bundle)
clear()
```

Current adapters:

- `createLocalSpellingContentRepository()`
  - stores the spelling content bundle in localStorage
  - used only for direct file/local mode
- `createApiSpellingContentRepository()`
  - hydrates from `GET /api/content/spelling`
  - writes through `PUT /api/content/spelling`
  - tracks account revision because content writes and learner-profile writes share `adult_accounts.repo_revision`

The runtime spelling service receives `spellingContent.getRuntimeSnapshot()` and reads published content only. Draft edits do not leak into live learner sessions until the operator publishes the draft. Accounts still pinned to an older seeded published release are supplemented at runtime with missing words from the bundled current seed release, so seed content additions remain available without rewriting account content.

The detailed policy lives in `docs/mutation-policy.md`.

## Portable import and export

The rebuild supports portable JSON snapshots above the repository boundary.

- full app export/import uses `ks2-platform-data`
- learner-scoped export/import uses `ks2-platform-learner`
- legacy one-page spelling progress export/import uses `ks2-legacy-spelling-progress` and always adds learner copies
- legacy snapshots shaped like `{ learners, subjectUi }` are still accepted and normalised into generic subject-state records

That keeps import/export logic aligned with the same generic repository shapes used by local and API-backed adapters.
