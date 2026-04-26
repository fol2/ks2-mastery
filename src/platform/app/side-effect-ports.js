export function createNoopTtsPort() {
  // SH2-U4: the noop port gains `abortPending` + `getStatus` so adapters
  // that substitute this port in tests never crash when the route-change
  // handler fans out both `stop()` and `abortPending()`. Behaviour is a
  // no-op (the contract the noop port has always honoured).
  return {
    spoken: [],
    speak(payload) {
      this.spoken.push(payload);
    },
    stop() {},
    abortPending() {},
    getStatus() { return 'idle'; },
    warmup() {},
  };
}

export function createAppSideEffectPorts(overrides = {}) {
  return {
    confirm: () => true,
    prompt: () => null,
    reload: () => {},
    onPersistenceRetryFailure: () => {},
    ...overrides,
  };
}
