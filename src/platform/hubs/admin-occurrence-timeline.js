// U5 (P3): occurrence timeline rendering helpers — content-free leaf.
//
// Normalises raw occurrence rows from the Worker API into the shape the
// error drawer expects. Each occurrence carries a timestamp, release,
// route, masked account id, and user agent. The normaliser is defensive
// against missing / null fields so the drawer renders cleanly on partial
// data (e.g. anonymous errors, pre-migration events, NULL releases).

import { formatAdminTimestamp } from './admin-refresh-envelope.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normaliseOccurrence(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    eventId: typeof raw.eventId === 'string' ? raw.eventId : '',
    occurredAt: Number.isFinite(Number(raw.occurredAt)) ? Number(raw.occurredAt) : 0,
    release: typeof raw.release === 'string' && raw.release ? raw.release : null,
    routeName: typeof raw.routeName === 'string' ? raw.routeName : null,
    accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null,
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent : null,
  };
}

export function normaliseOccurrenceTimeline(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const occurrences = Array.isArray(raw.occurrences)
    ? raw.occurrences.map(normaliseOccurrence)
    : [];
  return { occurrences };
}

// Format a timestamp for occurrence rows. Returns a compact ISO-like
// string suitable for the drawer detail list. Null / zero timestamps
// return the stable fallback so the drawer never renders blank cells.
export function formatOccurrenceTimestamp(ts) {
  return formatAdminTimestamp(ts);
}
