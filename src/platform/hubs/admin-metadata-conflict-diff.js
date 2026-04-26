// P1.5 Phase C (U9) pure helper: compute the field-level diff rows the
// account-ops-metadata conflict banner surfaces on a 409
// `account_ops_metadata_stale` response.
//
// Exported from this module (not AdminHubSurface.jsx) so Node tests can
// import it without needing a JSX loader. The JSX surface re-exports it
// for component-local use.

export function buildAccountOpsMetadataConflictDiff(draft, currentState) {
  if (!isPlainObject(draft)) return [];
  if (!isPlainObject(currentState)) return [];
  const rows = [];
  pushIfDifferent(
    rows,
    'opsStatus',
    'Ops status',
    draft.opsStatus ?? null,
    currentState.opsStatus ?? null,
  );
  pushIfDifferent(
    rows,
    'planLabel',
    'Plan label',
    draft.planLabel ?? null,
    currentState.planLabel ?? null,
  );
  pushIfDifferent(
    rows,
    'tags',
    'Tags',
    Array.isArray(draft.tags) ? draft.tags : [],
    Array.isArray(currentState.tags) ? currentState.tags : [],
    (value) => (Array.isArray(value) ? value.join(', ') : ''),
  );
  // R25: hide the internal-notes diff row when the server echo nulled that
  // field (ops-role redaction) so the banner does not leak the existence
  // of an admin-only note.
  if (currentState.internalNotes !== null && currentState.internalNotes !== undefined) {
    pushIfDifferent(
      rows,
      'internalNotes',
      'Internal notes',
      draft.internalNotes ?? null,
      currentState.internalNotes ?? null,
    );
  }
  return rows;
}

export function formatAccountOpsMetadataConflictValue(value) {
  if (value === null || value === undefined) return '—';
  if (value === '') return '(empty)';
  return String(value);
}

function pushIfDifferent(rows, field, label, draftValue, serverValue, format) {
  if (fieldEquals(draftValue, serverValue)) return;
  rows.push({
    field,
    label,
    draftValue: format ? format(draftValue) : draftValue,
    serverValue: format ? format(serverValue) : serverValue,
  });
}

function fieldEquals(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return false;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
