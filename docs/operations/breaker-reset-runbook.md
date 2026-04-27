# Circuit Breaker Reset Runbook

## Overview

The `bootstrapCapacityMetadata` circuit breaker has `cooldownMaxMs: Infinity`, meaning it never auto-recovers. After three consecutive bootstrap responses arrive without `meta.capacity.bootstrapCapacity`, the breaker trips open and stays open until an operator explicitly resets it.

While the breaker is open, sibling learner stat fetches (the `selectLearner` auto-refetch defence-in-depth path) may fail and get recorded in the store's sticky `attemptedLearnerFetches` Set. Without clearing, those learners would never be retried for the remainder of the session.

## Symptoms

- Parent Hub / Classroom Summary show "data unavailable" banners for capacity metadata.
- Sibling learner stats (for learners added after initial bootstrap) remain at 0 even after the underlying server issue is resolved.
- The `breakersDegraded.bootstrapCapacity` flag reads `true` in the persistence snapshot.

## Diagnosis

1. Open the Admin Hub > Debug panel.
2. Check the `breakers` section in the persistence snapshot:
   - `bootstrapCapacityMetadata.state` will read `open`.
   - `bootstrapCapacityMetadata.cooldownUntil` will be `null` (Infinity is serialised as null).
3. If the server issue has been resolved, proceed with the reset.

## Reset Procedure

### Option A: Server-side operator reset (recommended)

The server includes a `forceBreakerReset` field in the bootstrap response's `meta.capacity` object when an admin header is present.

1. Set the admin header on the next bootstrap request:
   ```
   X-KS2-Force-Breaker-Reset: bootstrapCapacityMetadata
   ```
2. The client's composition root reads `meta.capacity.forceBreakerReset`, validates the name against the closed `RESETABLE_BREAKER_NAME_SET`, and calls `breaker.reset()`.
3. The reset fires the registered `breakerResetListeners`, which clears the store's `attemptedLearnerFetches` Set.
4. The next `selectLearner` call on any empty-cache sibling learner fires a fresh fetch.

### Option B: Natural recovery via successful bootstrap

When the server starts returning valid `meta.capacity.bootstrapCapacity` data again, the bootstrap handler resets the breaker automatically:

1. The `consecutiveMissingBootstrapMetadata` counter resets to 0.
2. `breakers.bootstrapCapacityMetadata.reset()` fires.
3. The registered `breakerResetListeners` fire, clearing the sticky learner-fetch guard.
4. Sibling learner stats become fetchable again on the next `selectLearner`.

## Recovery Verification

After either reset path:

1. The `breakersDegraded.bootstrapCapacity` flag reads `false`.
2. Switch between learners in the Parent Hub.
3. Any learner whose stats previously showed 0 (due to stale fetch guards) will now trigger a fresh fetch and display correct stats.

## Side Effects of Reset

- `attemptedLearnerFetches.clear()` removes ALL entries, not just those that failed during the outage. This is safe: the worst case is a redundant fetch for a learner whose cache is already populated (the cache-hit check short-circuits before the fetch fires).
- `inFlightLearnerFetches` is NOT cleared — any in-flight fetch at the moment of reset continues normally and cleans up via its `.finally()` handler.

## Constraints

- Only breaker names in `RESETABLE_BREAKER_NAME_SET` (`bootstrapCapacityMetadata`) can be force-reset via the admin path. Other breakers use standard cooldown recovery.
- The `clearStaleFetchGuards()` call is wired in the composition root (api.js), NOT in the breaker primitive's `onTransition` callback. This keeps the breaker state machine generic and the recovery side-effect scoped to the application layer.
