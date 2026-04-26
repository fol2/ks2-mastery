// U6 hot-path helper shared by Spelling / Grammar / Punctuation command
// handlers. Wraps `repository.readLearnerProjectionInput(...)` with the
// telemetry + legacy-compat adapter the subject handlers need so they can
// stay lean:
//   - Calls `capacity.setProjectionFallback(mode)` so the per-request
//     `meta.capacity.projectionFallback` reflects the hot-path outcome.
//   - Normalises the closed-union reply into a `{projectionState, tokens,
//     projection, mode, bootstrap}` shape:
//       * `projectionState` mirrors the legacy `readLearnerProjectionState`
//         bundle shape (`{gameState, events}`) so existing reward/event
//         projection code paths are unchanged for miss-rehydrated and
//         stale-catchup. For `hit` the `events` list is empty and the
//         handler should use `tokens` to dedupe via `combineCommandEvents`.
//       * `tokens` is the persisted token ring (strict superset of the
//         bounded window) — `null` for `newer-opaque` since we cannot trust
//         the row's shape.
//       * `projection` is the parsed projection payload.
//       * `mode` is the closed-union string.
//       * `bootstrap` carries the bounded-fallback game state + events for
//         the non-hit modes so the caller can still hydrate rewards.
//
// Returning `null` is NEVER used — a `ProjectionUnavailableError` flows
// directly from the repository to the command route's 503 handler.

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

export async function resolveProjectionInput(context, {
  learnerId,
  currentRevision = 0,
  capacity = null,
} = {}) {
  const input = await context.repository.readLearnerProjectionInput(
    context.session.accountId,
    learnerId,
    {
      currentRevision,
      // U6 queryCount budget: runSubjectCommandMutation already ran
      // requireLearnerWriteAccess; skip the duplicate membership read.
      skipAccessCheck: true,
    },
  );
  if (capacity && typeof capacity.setProjectionFallback === 'function') {
    capacity.setProjectionFallback(input.mode);
  }

  if (input.mode === 'hit') {
    const rewardState = input.projection?.rewards?.state || {};
    const gameState = { [MONSTER_CODEX_SYSTEM_ID]: rewardState };
    return {
      mode: input.mode,
      projectionState: { gameState, events: [] },
      tokens: Array.isArray(input.projection?.recentEventTokens)
        ? input.projection.recentEventTokens
        : [],
      projection: input.projection,
      bootstrap: null,
      rawRow: input.rawRow || null,
    };
  }

  if (input.mode === 'newer-opaque') {
    // Row present but opaque — we cannot trust any of its fields (they may
    // belong to a future schema). Fall back to a fresh bounded read so the
    // command still makes progress. Token ring is intentionally `null`
    // because a newer-opaque row's tokens may not align with the current
    // dedupe semantics.
    const bootstrap = await context.repository.readLearnerProjectionState(
      context.session.accountId,
      learnerId,
    );
    return {
      mode: input.mode,
      projectionState: {
        gameState: bootstrap.gameState || {},
        events: bootstrap.events || [],
      },
      tokens: null,
      projection: input.projection,
      bootstrap,
      rawRow: input.rawRow || null,
    };
  }

  // miss-rehydrated or stale-catchup: bounded fallback data was read so
  // the existing reward/event machinery can consume it unchanged.
  return {
    mode: input.mode,
    projectionState: {
      gameState: input.bootstrap?.gameState || {},
      events: input.bootstrap?.events || [],
    },
    tokens: Array.isArray(input.projection?.recentEventTokens)
      ? input.projection.recentEventTokens
      : [],
    projection: input.projection,
    bootstrap: input.bootstrap || null,
    rawRow: input.rawRow || null,
  };
}
