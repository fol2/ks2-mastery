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
    if (key === 'requestBody' || key === 'rawBody' || key === 'body') {
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
