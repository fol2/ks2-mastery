// P1.5 Phase C (U9 / C2-C3) pure helpers: the "Keep mine" and "Use theirs"
// resolution flows that fire when the admin UI renders a 409
// `account_ops_metadata_stale` conflict banner.
//
// The production React component (AccountOpsMetadataRow in
// AdminHubSurface.jsx) wires these to its closures; extracting them here
// lets Node tests exercise the flow without mounting React/JSDOM.
//
// Design notes:
// - `buildKeepMineDispatchPayload` produces the exact `data` object the
//   dispatcher sees for the `account-ops-metadata-save` action when the
//   user clicks "Keep mine". The caller is responsible for dispatching;
//   this module only computes what to dispatch.
// - `applyUseTheirsStateUpdate` returns the next local-state shape the
//   component should adopt, plus the action data the dispatcher should
//   receive. The React component still owns the `setState` calls because
//   React Hooks cannot be invoked outside a render cycle.
// - Every helper is synchronous + pure. No requestId minting happens here
//   — `main.js::updateAccountOpsMetadata` mints a fresh `uid()` per call,
//   so each click naturally carries a new requestId without this module
//   having to own that dependency.

const TAG_MAX_COUNT = 10;

function parseTagsText(tagsText) {
  if (typeof tagsText !== 'string') return [];
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, TAG_MAX_COUNT);
}

function trimmedOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Build the `account-ops-metadata-save` dispatch payload for a "Keep mine"
 * click. The dispatch layer turns this into the HTTP PUT body (see
 * main.js::updateAccountOpsMetadata).
 *
 * Preconditions enforced here (no-op return on violation):
 *   - `accountId` is a non-empty string.
 *   - `currentState` is a plain object with a finite `rowVersion` integer.
 *
 * The expected pre-image is `currentState.rowVersion` (the server's
 * authoritative value at the moment of the 409) so the retry carries a
 * fresh CAS pre-image.
 *
 * @param {object} options
 * @param {string} options.accountId
 * @param {object} options.currentState - Server-side 409 `currentState` echo.
 * @param {string} options.opsStatus
 * @param {string} options.planLabel
 * @param {string} options.tagsText
 * @param {string} options.internalNotes
 * @returns {{ action: string, data: object }|null}
 */
export function buildKeepMineDispatchPayload({
  accountId,
  currentState,
  opsStatus,
  planLabel,
  tagsText,
  internalNotes,
} = {}) {
  if (typeof accountId !== 'string' || !accountId) return null;
  if (!currentState || typeof currentState !== 'object') return null;
  const rowVersion = Number.isInteger(currentState.rowVersion) ? currentState.rowVersion : 0;
  const parsedTags = parseTagsText(tagsText);
  return {
    action: 'account-ops-metadata-save',
    data: {
      accountId,
      expectedRowVersion: rowVersion,
      patch: {
        opsStatus,
        planLabel: trimmedOrNull(planLabel),
        tags: parsedTags,
        internalNotes: trimmedOrNull(internalNotes),
      },
    },
  };
}

/**
 * Compute the next local React state after a "Use theirs" click. The
 * returned `nextState` is what the component should setState to; the
 * returned `dispatch` is the action the dispatcher should see.
 *
 * R25 redaction: when the server 409 body nulled `internalNotes` (the
 * admin-only field was redacted for an ops-role viewer), the adopted
 * local state MUST show an empty string, NOT the literal `null`. The
 * component initialises `internalNotes` state as `account.internalNotes
 * || ''`, so the helper mirrors that normalisation.
 *
 * @param {object} options
 * @param {string} options.accountId
 * @param {object} options.currentState - Server-side 409 `currentState` echo.
 * @returns {{ nextState: object, dispatch: { action: string, data: object } }|null}
 */
export function applyUseTheirsStateUpdate({ accountId, currentState } = {}) {
  if (typeof accountId !== 'string' || !accountId) return null;
  if (!currentState || typeof currentState !== 'object') return null;
  const tags = Array.isArray(currentState.tags) ? currentState.tags : [];
  const nextState = {
    opsStatus: typeof currentState.opsStatus === 'string' ? currentState.opsStatus : 'active',
    planLabel: typeof currentState.planLabel === 'string' ? currentState.planLabel : '',
    tagsText: tags.join(', '),
    internalNotes: typeof currentState.internalNotes === 'string' ? currentState.internalNotes : '',
  };
  return {
    nextState,
    dispatch: {
      action: 'account-ops-metadata-use-theirs',
      data: { accountId, currentState },
    },
  };
}
