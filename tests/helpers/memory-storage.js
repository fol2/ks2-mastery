export class MemoryStorage {
  constructor() {
    this.map = new Map();
    // U8: one-shot hook that causes the next `setItem` call (optionally
    // filtered by key) to throw synchronously. Once consumed, the hook
    // resets so subsequent writes succeed normally. Used by the storage-
    // failure warning-surface tests to drive the `feedback.persistenceWarning`
    // path without monkey-patching individual storage instances.
    this._throwNext = null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this._throwNext) {
      const { keyFilter, error } = this._throwNext;
      if (!keyFilter || keyFilter === key) {
        this._throwNext = null;
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
   * fires once, subsequent writes succeed. Pass `{ key: 'ks2-...' }` to only
   * throw on writes to a specific storage key; omit to throw on any next
   * write. Pass `{ error: new Error(...) }` to customise the thrown value
   * (defaults to a QuotaExceededError-shaped Error).
   */
  throwOnNextSet({ key: keyFilter = '', error = null } = {}) {
    const thrown = error || Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this._throwNext = { keyFilter: keyFilter ? String(keyFilter) : '', error: thrown };
  }
}

export function installMemoryStorage() {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  return storage;
}
