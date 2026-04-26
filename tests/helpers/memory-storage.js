export class MemoryStorage {
  constructor() {
    this.map = new Map();
    // U8: one-shot hook that causes the next `setItem` call (optionally
    // filtered by key) to throw synchronously. Once consumed, the hook
    // resets so subsequent writes succeed normally. Used by the storage-
    // failure warning-surface tests to drive the `feedback.persistenceWarning`
    // path without monkey-patching individual storage instances.
    //
    // P2 U9 reviewer-feedback-fix: the hook now carries a `count` so the
    // caller can arm multiple consecutive throws (needed for the
    // `acknowledgePersistenceWarning` bounded-retry test — both the first
    // attempt AND the retry must throw).
    this._throwNext = null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this._throwNext) {
      const { keyFilter, error } = this._throwNext;
      if (!keyFilter || keyFilter === key) {
        this._throwNext.count = (this._throwNext.count ?? 1) - 1;
        if (this._throwNext.count <= 0) this._throwNext = null;
        throw error;
      }
    }
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  clear() {
    this.map.clear();
  }

  get length() {
    return this.map.size;
  }

  /**
   * Arm the storage to throw on the NEXT matching `setItem` call. After it
   * fires `count` times (default 1), subsequent writes succeed. Pass
   * `{ key: 'ks2-...' }` to only throw on writes to a specific storage key;
   * omit to throw on any next write. Pass `{ error: new Error(...) }` to
   * customise the thrown value (defaults to a QuotaExceededError-shaped
   * Error). Pass `{ count: 2 }` to arm consecutive throws — used by the
   * P2 U9 `acknowledgePersistenceWarning` bounded-retry test.
   */
  throwOnNextSet({ key: keyFilter = '', error = null, count = 1 } = {}) {
    const thrown = error || Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this._throwNext = {
      keyFilter: keyFilter ? String(keyFilter) : '',
      error: thrown,
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    };
  }
}

export function installMemoryStorage() {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  return storage;
}
