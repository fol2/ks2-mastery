export function createNoopTtsPort() {
  return {
    spoken: [],
    speak(payload) {
      this.spoken.push(payload);
    },
    stop() {},
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
