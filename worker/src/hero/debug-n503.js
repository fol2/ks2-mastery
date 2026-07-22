// Temporary, non-identifying production trace for the Nelson 503
// investigation. Remove this module once the root cause is fixed and proved.

export function logN503HeroCheckpoint(capacity, phase, counts = {}) {
  if (!capacity) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[DEBUG-N503]', JSON.stringify({
      event: 'n503.hero-read-model.phase',
      requestId: capacity?.requestId || null,
      phase,
      subjectCount: Number.isFinite(counts.subjectCount) ? counts.subjectCount : null,
      recentSessionCount: Number.isFinite(counts.recentSessionCount) ? counts.recentSessionCount : null,
      taskCount: Number.isFinite(counts.taskCount) ? counts.taskCount : null,
      rowCount: Number.isFinite(counts.rowCount) ? counts.rowCount : null,
      itemCount: Number.isFinite(counts.itemCount) ? counts.itemCount : null,
      wordCount: Number.isFinite(counts.wordCount) ? counts.wordCount : null,
      byteCount: Number.isFinite(counts.byteCount) ? counts.byteCount : null,
    }));
  } catch { /* best-effort diagnostic only */ }
}
