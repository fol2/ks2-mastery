// U4 (Cluster D): flush pending microtasks up to maxTicks. The
// persistence-retry dispatcher chains multiple awaits (U5 storage-CAS
// routes through navigator.locks), so one `await Promise.resolve()` is
// insufficient; the actual depth depends on the lock-availability
// feature detect. 8 ticks is generous headroom without introducing
// timing-dependence.
export async function flushMicrotasks(maxTicks = 8) {
  for (let i = 0; i < maxTicks; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- intentional serial flush
    await Promise.resolve();
  }
}
