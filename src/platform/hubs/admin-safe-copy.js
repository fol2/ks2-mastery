// P5 U2: Safe-copy framework — audience-aware clipboard with redaction.
//
// Provides `prepareSafeCopy(data, audience)` which strips or masks sensitive
// fields according to the target audience, and `copyToClipboard(text)` which
// wraps `navigator.clipboard.writeText` with graceful failure handling.
//
// All Admin*.jsx files MUST use this helper rather than raw navigator.clipboard.

// ---------------------------------------------------------------------------
// Audience enum
// ---------------------------------------------------------------------------

export const COPY_AUDIENCE = Object.freeze({
  ADMIN_ONLY: 'admin_only',
  OPS_SAFE: 'ops_safe',
  PARENT_SAFE: 'parent_safe',
  PUBLIC_PREVIEW: 'public_preview',
});

// ---------------------------------------------------------------------------
// Internal redaction utilities
// ---------------------------------------------------------------------------

const SENSITIVE_HEADER_KEYS = ['cookie', 'authorization', 'x-auth-token', 'set-cookie'];

function isSensitiveHeaderKey(key) {
  return SENSITIVE_HEADER_KEYS.includes(String(key).toLowerCase());
}

/** Mask email to last 6 characters: `****ple.com` */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  if (email.length <= 6) return '******';
  return '****' + email.slice(-6);
}

/** Mask ID to last 8 characters: `****ef123456` */
export function maskId(id) {
  if (!id || typeof id !== 'string') return '';
  if (id.length <= 8) return '********';
  return '****' + id.slice(-8);
}

/**
 * Recursively strip keys whose names imply auth tokens or cookies.
 * Mutates in-place for performance on large bundles.
 */
function stripAuthTokens(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(stripAuthTokens);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (isSensitiveHeaderKey(key)) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripAuthTokens(obj[key]);
    }
  }
  return obj;
}

/** Strip raw request bodies from bundle data. */
function stripRequestBodies(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(stripRequestBodies);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'requestBody' || key === 'rawBody') {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripRequestBodies(obj[key]);
    }
  }
  return obj;
}

/** Strip stack traces (any string value containing multi-line "at " frames). */
function stripStackTraces(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(stripStackTraces);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && /^\s+at\s/m.test(val)) {
      obj[key] = '[stack trace redacted]';
    } else if (key === 'stack' || key === 'stackTrace' || key === 'firstFrame') {
      obj[key] = '[stack trace redacted]';
    } else if (typeof val === 'object') {
      stripStackTraces(val);
    }
  }
  return obj;
}

/** Strip internal notes fields. */
function stripInternalNotes(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(stripInternalNotes);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'internalNotes' || key === 'internal_notes' || key === 'adminNotes') {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripInternalNotes(obj[key]);
    }
  }
  return obj;
}

/** Mask emails throughout object graph. */
function maskAllEmails(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(maskAllEmails);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'email' && typeof obj[key] === 'string') {
      obj[key] = maskEmail(obj[key]);
    } else if (typeof obj[key] === 'object') {
      maskAllEmails(obj[key]);
    }
  }
  return obj;
}

/** Mask account IDs throughout object graph. */
function maskAllAccountIds(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(maskAllAccountIds);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'accountId' && typeof obj[key] === 'string') {
      obj[key] = maskId(obj[key]);
    } else if (typeof obj[key] === 'object') {
      maskAllAccountIds(obj[key]);
    }
  }
  return obj;
}

/** Strip child/learner IDs entirely. */
function stripChildIds(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach(stripChildIds);
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'learnerId' || key === 'learner_id' || key === 'childId') {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripChildIds(obj[key]);
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// String-level redaction (closes the string-passthrough gap)
// ---------------------------------------------------------------------------

// Patterns for ALL audiences (including ADMIN_ONLY):
const RE_BEARER_TOKEN = /Bearer\s+eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g;
const RE_BASIC_AUTH = /Basic\s+[A-Za-z0-9+/=]{8,}/g;
const RE_COOKIE_VALUE = /(?:session|sess_id|token|auth)=[^\s;]{6,}(?:;|$|\s)/gi;

// Patterns for OPS_SAFE and below:
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RE_ACC_ID = /acc_[A-Za-z0-9_-]{6,}/g;
const RE_SESS_ID = /sess_[A-Za-z0-9_-]{6,}/g;
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Patterns for PARENT_SAFE and below:
const RE_LRN_ID = /lrn_[A-Za-z0-9_-]{3,}/g;
const RE_STACK_TRACE = /^[^\n]*\n?\s+at\s.+$/gm;
const RE_INTERNAL_ROUTE = /\/api\/(?:admin|internal)\/[^\s'")]+/g;
const RE_INTERNAL_TABLE = /d1\.[a-z_]+/g;

/**
 * Apply regex-based scanning to detect and mask/strip sensitive tokens
 * from a plain string, according to audience level.
 *
 * @param {string} text — the raw string to scan.
 * @param {string} audience — one of COPY_AUDIENCE values.
 * @returns {{ text: string, appliedRedactions: string[] }}
 */
export function redactString(text, audience) {
  if (!text || typeof text !== 'string') {
    return { text: '', appliedRedactions: [] };
  }

  const appliedRedactions = [];
  let result = text;

  // === ALL audiences: strip auth tokens and cookies ===
  if (RE_BEARER_TOKEN.test(result)) {
    appliedRedactions.push('auth_tokens');
    result = result.replace(RE_BEARER_TOKEN, '[auth redacted]');
  }
  // Reset lastIndex for global regexes (test advances lastIndex)
  RE_BEARER_TOKEN.lastIndex = 0;

  if (RE_BASIC_AUTH.test(result)) {
    if (!appliedRedactions.includes('auth_tokens')) appliedRedactions.push('auth_tokens');
    result = result.replace(RE_BASIC_AUTH, '[auth redacted]');
  }
  RE_BASIC_AUTH.lastIndex = 0;

  if (RE_COOKIE_VALUE.test(result)) {
    appliedRedactions.push('cookie_values');
    result = result.replace(RE_COOKIE_VALUE, '[cookie redacted]');
  }
  RE_COOKIE_VALUE.lastIndex = 0;

  if (audience === COPY_AUDIENCE.ADMIN_ONLY) {
    return { text: result, appliedRedactions };
  }

  // === OPS_SAFE: mask emails, account IDs, session IDs ===
  const emailMatches = result.match(RE_EMAIL);
  if (emailMatches) {
    appliedRedactions.push('emails_masked');
    for (const email of emailMatches) {
      result = result.replace(email, maskEmail(email));
    }
  }

  const accMatches = result.match(RE_ACC_ID);
  if (accMatches) {
    appliedRedactions.push('account_ids_masked');
    for (const id of accMatches) {
      result = result.replace(id, maskId(id));
    }
  }

  const sessMatches = result.match(RE_SESS_ID);
  if (sessMatches) {
    appliedRedactions.push('session_ids_masked');
    for (const id of sessMatches) {
      result = result.replace(id, maskId(id));
    }
  }

  const uuidMatches = result.match(RE_UUID);
  if (uuidMatches) {
    if (!appliedRedactions.includes('session_ids_masked')) {
      appliedRedactions.push('session_ids_masked');
    }
    for (const id of uuidMatches) {
      result = result.replace(id, maskId(id));
    }
  }

  if (audience === COPY_AUDIENCE.OPS_SAFE) {
    return { text: result, appliedRedactions };
  }

  // === PARENT_SAFE (and PUBLIC_PREVIEW): strip learner IDs, stack traces, routes, tables ===
  if (RE_LRN_ID.test(result)) {
    appliedRedactions.push('learner_ids');
    result = result.replace(RE_LRN_ID, '[redacted]');
  }
  RE_LRN_ID.lastIndex = 0;

  if (RE_STACK_TRACE.test(result)) {
    appliedRedactions.push('stack_traces');
    result = result.replace(RE_STACK_TRACE, '[stack trace redacted]');
  }
  RE_STACK_TRACE.lastIndex = 0;

  if (RE_INTERNAL_ROUTE.test(result)) {
    appliedRedactions.push('internal_routes');
    result = result.replace(RE_INTERNAL_ROUTE, '[internal route redacted]');
  }
  RE_INTERNAL_ROUTE.lastIndex = 0;

  if (RE_INTERNAL_TABLE.test(result)) {
    appliedRedactions.push('internal_references');
    result = result.replace(RE_INTERNAL_TABLE, '[internal reference redacted]');
  }
  RE_INTERNAL_TABLE.lastIndex = 0;

  return { text: result, appliedRedactions };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prepare data for safe copying to the clipboard.
 *
 * @param {*} data — the raw bundle/summary to copy (object or string).
 * @param {string} audience — one of COPY_AUDIENCE values.
 * @returns {{ ok: boolean, text: string, redactedFields: string[] }}
 */
export function prepareSafeCopy(data, audience) {
  if (data == null || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return { ok: false, text: '', redactedFields: [] };
  }
  if (typeof data === 'string' && data.trim() === '') {
    return { ok: false, text: '', redactedFields: [] };
  }

  const redactedFields = [];

  // Deep clone so we never mutate the source.
  let working = typeof data === 'string' ? data : JSON.parse(JSON.stringify(data));

  // String-specific path: apply regex-based redaction per audience.
  if (typeof working === 'string') {
    const { text: redacted, appliedRedactions } = redactString(working, audience);
    if (!redacted || redacted.trim() === '') {
      return { ok: false, text: '', redactedFields: [] };
    }
    const fields = appliedRedactions.length > 0
      ? appliedRedactions
      : [];
    return { ok: true, text: redacted, redactedFields: fields };
  }

  // All audiences: strip cookies, auth tokens, raw request bodies.
  if (typeof working === 'object') {
    stripAuthTokens(working);
    redactedFields.push('auth_tokens');

    stripRequestBodies(working);
    redactedFields.push('request_bodies');
  }

  // admin_only — pass through after stripping auth tokens / request bodies.
  if (audience === COPY_AUDIENCE.ADMIN_ONLY) {
    const text = typeof working === 'string' ? working : JSON.stringify(working, null, 2);
    return { ok: true, text, redactedFields };
  }

  // ops_safe — mask email (last 6), mask account ID (last 8), strip internal notes.
  if (audience === COPY_AUDIENCE.OPS_SAFE) {
    if (typeof working === 'object') {
      maskAllEmails(working);
      redactedFields.push('emails_masked');

      maskAllAccountIds(working);
      redactedFields.push('account_ids_masked');

      stripInternalNotes(working);
      redactedFields.push('internal_notes');
    }
    const text = typeof working === 'string' ? working : JSON.stringify(working, null, 2);
    return { ok: true, text, redactedFields };
  }

  // parent_safe — strip child IDs, stack traces, internal notes, request bodies, mask email.
  if (audience === COPY_AUDIENCE.PARENT_SAFE) {
    if (typeof working === 'object') {
      stripChildIds(working);
      redactedFields.push('child_ids');

      stripStackTraces(working);
      redactedFields.push('stack_traces');

      stripInternalNotes(working);
      redactedFields.push('internal_notes');

      maskAllEmails(working);
      redactedFields.push('emails_masked');
    }
    const text = typeof working === 'string' ? working : JSON.stringify(working, null, 2);
    return { ok: true, text, redactedFields };
  }

  // public_preview — strip everything except title and sanitised body text.
  if (audience === COPY_AUDIENCE.PUBLIC_PREVIEW) {
    if (typeof working === 'object') {
      const title = working.title || working.humanSummary || '';
      const body = typeof working.body === 'string'
        ? working.body
        : (typeof working.humanSummary === 'string' ? working.humanSummary : '');
      working = { title, body };
      redactedFields.push('all_except_title_body');
    }
    const text = typeof working === 'string' ? working : JSON.stringify(working, null, 2);
    return { ok: true, text, redactedFields };
  }

  // Unknown audience — reject.
  return { ok: false, text: '', redactedFields: [] };
}

/**
 * Copy text to clipboard. Browser-only — call site must be in a user-gesture
 * context. Returns `{ ok: boolean, error?: string }`.
 *
 * @param {string} text
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'Clipboard write failed' };
  }
}
