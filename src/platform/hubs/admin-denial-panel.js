// U8 (P3): denial normaliser — content-free leaf module.
//
// Normalises the raw denial log response from the server into a shape
// the DenialLogPanel can consume directly. Deliberately kept free of
// any content-heavy or role-helper imports so it can be pulled into the
// production client bundle without triggering the forbidden-module
// audit in `scripts/audit-client-bundle.mjs`.

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalise a single denial entry from the server response.
 * Missing or unexpected fields get safe defaults.
 */
export function normaliseDenialEntry(raw) {
  if (!isPlainObject(raw)) {
    return {
      id: '',
      deniedAt: 0,
      denialReason: '',
      routeName: null,
      accountIdMasked: null,
      isDemo: false,
      release: null,
    };
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    deniedAt: Number.isFinite(Number(raw.deniedAt)) ? Number(raw.deniedAt) : 0,
    denialReason: typeof raw.denialReason === 'string' ? raw.denialReason : '',
    routeName: typeof raw.routeName === 'string' ? raw.routeName : null,
    accountIdMasked: typeof raw.accountIdMasked === 'string' ? raw.accountIdMasked : null,
    isDemo: Boolean(raw.isDemo),
    release: typeof raw.release === 'string' ? raw.release : null,
  };
}

/**
 * Normalise the full denial log response envelope.
 * Returns { generatedAt, entries[] } — always safe to render.
 */
export function normaliseDenialLogResponse(raw) {
  if (!isPlainObject(raw)) {
    return { generatedAt: 0, entries: [] };
  }
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normaliseDenialEntry)
    : [];
  return {
    generatedAt: Number.isFinite(Number(raw.generatedAt)) ? Number(raw.generatedAt) : 0,
    entries,
  };
}
