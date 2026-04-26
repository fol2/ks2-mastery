// P2 U5 — monotonic writeVersion + WriteVersionStaleError (stale-read rejection)
// + 2^30 wraparound telemetry.
//
// Contract:
//  - Every persisted repository bundle carries a `bundle.meta.writeVersion`
//    integer >= 1. Pre-U5 bundles without the field are treated as
//    writeVersion === 0 on first read (see `readWriteVersion`).
//  - `nextWriteVersion(current)` returns `current + 1`, wrapping to `1` and
//    logging a telemetry event when the ceiling (2^30) is reached.
//  - `assertNotStale(expected, actual)` throws a `WriteVersionStaleError`
//    when an optimistic-CAS caller sees `actual > expected`. The typed
//    error carries `.expected` / `.actual` / `.reason` fields so the
//    service layer can distinguish it from generic write failures.
//
// Per plan (M2 finding): the ceiling is theoretical — ~1k writes/day takes
// ~3,000 years to reach 2^30. The wrap-to-1 behaviour is defensive: if the
// counter ever does wrap, writeVersion stale detection catches the resulting
// `N > M` comparison. We do NOT reach for 2^53 because the plan explicitly
// ties the ceiling to 32-bit-bounded storage contexts (B5 final review).

export const WRITE_VERSION_CEILING = 2 ** 30;

/**
 * Typed error raised when a caller observes a stale writeVersion. Carries
 * structured fields so the service layer can surface a soft warning without
 * mistaking the optimistic-CAS failure for a generic storage exception.
 */
export class WriteVersionStaleError extends Error {
  constructor({ expected, actual, reason = 'write-version-stale' } = {}) {
    super(`Write version stale: expected ${expected}, got ${actual}.`);
    this.name = 'WriteVersionStaleError';
    this.expected = expected;
    this.actual = actual;
    this.reason = reason;
  }
}

/**
 * Extract writeVersion from a bundle-shaped object or a raw meta record.
 * Returns 0 for missing / non-numeric / negative input so the first post-U5
 * write bumps to 1. Fractional / non-finite values also collapse to 0.
 */
export function readWriteVersion(source) {
  if (!source || typeof source !== 'object') return 0;
  const raw = typeof source.writeVersion === 'number'
    ? source.writeVersion
    : (source.meta && typeof source.meta.writeVersion === 'number' ? source.meta.writeVersion : 0);
  if (!Number.isFinite(raw)) return 0;
  const floored = Math.floor(raw);
  return floored > 0 ? floored : 0;
}

/**
 * Compute the next writeVersion. Wraps to 1 and invokes `telemetry`
 * (if provided) when the counter reaches the ceiling. `telemetry` is a
 * plain callback so production can route it to the event-log / analytics
 * adapter without adding a dependency here.
 */
export function nextWriteVersion(current, { telemetry = null } = {}) {
  const base = Number.isFinite(Number(current)) && Number(current) > 0
    ? Math.floor(Number(current))
    : 0;
  if (base + 1 >= WRITE_VERSION_CEILING) {
    if (typeof telemetry === 'function') {
      try {
        telemetry({
          kind: 'write-version-wraparound',
          previous: base,
          ceiling: WRITE_VERSION_CEILING,
          wrappedTo: 1,
        });
      } catch (_error) {
        /* Telemetry failures must not break the write path. */
      }
    }
    return 1;
  }
  return base + 1;
}

/**
 * Throw `WriteVersionStaleError` if the on-disk version moved ahead of the
 * caller's snapshot. Used at the lock-wrapped entry point after the
 * read-latest-on-acquire step so a duplicate-leader race is surfaced rather
 * than silently overwriting a fresher write.
 *
 * Semantics: `expected` is the version the caller READ; `actual` is what
 * the pre-write re-read returns. If `actual > expected`, someone else
 * wrote in between and the caller's computed `next` is stale relative to
 * that write.
 */
export function assertNotStale({ expected, actual } = {}) {
  const exp = Number.isFinite(Number(expected)) ? Math.floor(Number(expected)) : 0;
  const act = Number.isFinite(Number(actual)) ? Math.floor(Number(actual)) : 0;
  if (act > exp) {
    throw new WriteVersionStaleError({ expected: exp, actual: act });
  }
}

/**
 * Diagnostic helper: is this value a writeVersion stale error? Used by the
 * service-layer warning surface to distinguish optimistic-CAS rejection
 * from other storage failures.
 */
export function isWriteVersionStaleError(error) {
  return Boolean(error) && error.name === 'WriteVersionStaleError';
}
