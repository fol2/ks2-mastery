// repository-helpers.js — Shared pure-utility helpers used by repository.js
// and its sibling modules. Extracted from repository.js (P3 U6 split) with
// ZERO behaviour change. These are NOT re-exported from repository.js
// because they were never public API — they are internal plumbing.

import {
  cloneSerialisable,
} from '../../src/platform/core/repositories/helpers.js';

// ─── JSON / type guards ──────────────────────────────────────────────────────

export function safeJsonParse(text, fallback) {
  if (text == null || text === '') return cloneSerialisable(fallback);
  try {
    return JSON.parse(text);
  } catch {
    return cloneSerialisable(fallback);
  }
}

export function asTs(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isMissingTableError(error, tableName) {
  const message = String(error?.message || '');
  return new RegExp(`no such table:\\s*${tableName}\\b`, 'i').test(message);
}

// ─── Stable JSON helpers ─────────────────────────────────────────────────────

export function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((output, key) => {
        output[key] = stableClone(value[key]);
        return output;
      }, {});
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableClone(cloneSerialisable(value)));
}

export function mutationPayloadHash(kind, payload) {
  return stableStringify({ kind, payload: cloneSerialisable(payload) });
}

// ─── Mutation meta / errors ──────────────────────────────────────────────────

export const MUTATION_POLICY_VERSION = 1;

export function logMutation(level, event, details = {}) {
  const payload = {
    event,
    ...cloneSerialisable(details),
    at: new Date().toISOString(),
  };
  const fn = globalThis.console?.[level] || globalThis.console?.log;
  if (!fn) return;
  try {
    fn('[ks2-worker]', JSON.stringify(payload));
  } catch {
    fn('[ks2-worker]', payload);
  }
}
