// In-memory patches for session bundles after a mutation. Each helper
// reconstructs the bundle the caller would otherwise re-read from D1 —
// avoiding six queries (session+user, children, childState, subscription)
// per write. Purely functional; the caller owns persistence.
//
// Keep the bundle shape aligned with `getSessionBundleByHash` in
// `worker/lib/store.js`.

// A freshly-created child row has no persisted learning state yet.
// Mirrors the default rendered by `normaliseChildState(null)` so the
// bootstrap contract's `childState` assertions succeed without a D1 hop.
function defaultChildLearningState() {
  return {
    spellingProgress: {},
    monsterState: {},
    spellingPrefs: {},
    updatedAt: Date.now(),
  };
}

export function patchBundleForNewChild(bundle, child) {
  return {
    ...bundle,
    session: { ...bundle.session, selected_child_id: child.id },
    children: [...bundle.children, child],
    selectedChild: child,
    childState: defaultChildLearningState(),
  };
}

export function patchBundleForUpdatedChild(bundle, child) {
  const children = bundle.children.map((entry) => (entry.id === child.id ? child : entry));
  const selectedChild = bundle.selectedChild?.id === child.id ? child : bundle.selectedChild;
  return { ...bundle, children, selectedChild };
}

export function patchBundleForSelectedChild(bundle, child, childState) {
  return {
    ...bundle,
    session: { ...bundle.session, selected_child_id: child.id },
    selectedChild: child,
    childState,
  };
}

export function patchBundleForChildState(bundle, childState) {
  return { ...bundle, childState };
}
