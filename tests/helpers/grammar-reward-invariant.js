// U3 helper — `snapshotGrammarRewardState` analogous to
// `snapshotNonScoredGrammarState` in tests/grammar-transfer-scene.test.js.
//
// Deep-clones a game-state map (e.g. the monster-codex branch) with
// timestamp-like and ring-buffer fields stripped so the composite property
// test in `tests/grammar-concordium-invariant.test.js` can deep-equal
// before/after samples for equality-under-no-op without false negatives from
// timestamp drift. The helper targets the Grammar reward state shape
// (bracehart / chronalyx / couronnail / concordium / retired-id entries)
// and is safe to call with the raw output of the ensureMonsterBranches
// seed path.
//
// Shape targeted:
//   {
//     [monsterId]: {
//       caught: boolean,
//       conceptTotal?: number,
//       releaseId?: string,
//       branch?: string,
//       mastered: Array<string>,
//       ...possibly timestamps / lastSeenAt / updatedAt
//     }
//   }
//
// Strip rules:
//  1. Top-level keys in `CHANGING_TOP_LEVEL_KEYS` (updatedAt, lastSeenAt,
//     lastWriteAt, savedAt) are removed.
//  2. Per-monster entry keys in `CHANGING_ENTRY_KEYS` (updatedAt,
//     lastSeenAt, lastWriteAt) are removed from each monster's entry.
//  3. The output is JSON-stringifiable (deep-clone via JSON parse/stringify),
//     so any non-serialisable payload (Date, Map, Set, function) is dropped
//     silently — this is the correct behaviour for a game-state record that
//     contract-wise only holds JSON primitives.
//  4. Input is never mutated; the helper returns a fresh object on every
//     call.

const CHANGING_TOP_LEVEL_KEYS = new Set([
  'updatedAt',
  'lastSeenAt',
  'lastWriteAt',
  'savedAt',
  'lastUpdatedAt',
]);

const CHANGING_ENTRY_KEYS = new Set([
  'updatedAt',
  'lastSeenAt',
  'lastWriteAt',
  'savedAt',
  'lastUpdatedAt',
  'createdAt',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripEntry(entry) {
  if (!isPlainObject(entry)) return entry;
  const stripped = {};
  for (const [key, value] of Object.entries(entry)) {
    if (CHANGING_ENTRY_KEYS.has(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}

export function snapshotGrammarRewardState(state) {
  if (!isPlainObject(state)) return {};
  const out = {};
  for (const [key, value] of Object.entries(state)) {
    if (CHANGING_TOP_LEVEL_KEYS.has(key)) continue;
    out[key] = isPlainObject(value) ? stripEntry(value) : value;
  }
  // Serialise/parse so the returned object is a deep clone — protects
  // callers from accidentally mutating the source through nested arrays
  // when writing assertions like `snap.concordium.mastered.push('x')`.
  return JSON.parse(JSON.stringify(out));
}

// Named export kept bundle-small for the one production caller + future
// shape-census fixture.
export const GRAMMAR_REWARD_STATE_CHANGING_TOP_LEVEL_KEYS = Object.freeze([
  ...CHANGING_TOP_LEVEL_KEYS,
]);
export const GRAMMAR_REWARD_STATE_CHANGING_ENTRY_KEYS = Object.freeze([
  ...CHANGING_ENTRY_KEYS,
]);
