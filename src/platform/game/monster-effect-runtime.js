// Runtime getter factory for the published `effect` sub-document, with
// reference-stable memoisation across calls.
//
// Why this exists: `repositories.monsterVisualConfig.read()` returns a fresh
// clone every call (via `cloneSerialisable` / `JSON.parse(JSON.stringify(...))`),
// so its `effect` slice is also a brand-new object on each call. React
// `useEffect` deps that watch the catalog (`App.jsx`) compare by identity, so
// returning a fresh ref every render fires the effect on every render — which
// in turn re-runs `runtimeRegistration()` and wipes the warn-once state. The
// memoisation here returns the previously cached ref when the new clone is
// structurally identical, breaking that loop.
//
// Equality: a serialised compare (JSON-stringify) is sufficient — the data
// already round-trips through JSON in the repository. We hold both the
// snapshot string and the last returned object so the cheap path on the next
// call is `JSON.stringify` of the new clone vs the cached string.

export function createMonsterEffectConfigGetter(repositories) {
  let lastSnapshot = null;
  let lastEffect = null;

  return function readMonsterEffectConfig() {
    const runtimeConfig = repositories?.monsterVisualConfig?.read?.();
    const candidate = runtimeConfig?.config?.effect;
    if (!candidate || typeof candidate !== 'object') {
      lastSnapshot = null;
      lastEffect = null;
      return null;
    }
    const snapshot = JSON.stringify(candidate);
    if (snapshot === lastSnapshot && lastEffect !== null) {
      return lastEffect;
    }
    lastSnapshot = snapshot;
    lastEffect = candidate;
    return candidate;
  };
}
