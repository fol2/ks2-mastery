import { captureClientError } from '../ops/error-capture.js';

function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').slice(0, length);
}

const INGRESS_REQUEST_ID_PATTERN = /^ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPS_ERROR_EVENT_PATH = '/api/ops/error-event';
const RESPONSE_SNIPPET_MAX_CHARS = 240;

export function isIngressRequestId(value) {
  return typeof value === 'string' && INGRESS_REQUEST_ID_PATTERN.test(value);
}

/**
 * Create the client-owned identifier captured by Cloudflare invocation logs
 * even when the Worker is terminated before application logging completes.
 */
export function createIngressRequestId() {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
  return `ks2_req_${uuid}`;
}

function normaliseEndpointPath(endpoint) {
  return String(endpoint || '').split('?')[0] || '';
}

function isOpsErrorEventEndpoint(endpoint) {
  const path = normaliseEndpointPath(endpoint);
  return path === OPS_ERROR_EVENT_PATH || path.endsWith(OPS_ERROR_EVENT_PATH);
}

/**
 * Stable failure signal for ops fingerprinting. Prefer app codes, then known
 * Cloudflare Error 1102 markers. Avoid unique ids so storms dedupe.
 */
export function summariseIngressFailureSignal({
  status = 0,
  payload = null,
  responseSnippet = '',
  text = '',
} = {}) {
  const code = typeof payload?.code === 'string' && payload.code.trim()
    ? payload.code.trim().slice(0, 64)
    : (typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim().slice(0, 64)
      : '');
  if (code) return code;

  const blob = `${responseSnippet || ''}\n${text || ''}`.toLowerCase();
  if (/\b1102\b/.test(blob) || /exceededcpu/.test(blob)) return 'cf-1102';
  if (/\b1101\b/.test(blob)) return 'cf-1101';
  if (Number(status) === 0) return 'network';
  if (Number(status) >= 500) return `http-${Number(status) || 0}`;
  return 'request-failed';
}

function shouldCaptureIngressFailure(status) {
  const code = Number(status) || 0;
  return code === 0 || code >= 500;
}

function buildIngressFailureMessage({ method, endpoint, status, signal }) {
  // Keep lowercase tokens so the ops all-caps scrub does not blank the line.
  return `status=${Number(status) || 0} method=${String(method || 'GET').toLowerCase()} path=${endpoint || '/'} signal=${signal}`;
}

/**
 * Record a failed browser request. Always logs correlation fields for CF log
 * joins. For transport failures (status 0) and 5xx, also enqueue an ops error
 * event so Admin → Debugging → Error Log Centre can show them. Skips the
 * ingest POST for `/api/ops/error-event` to avoid recursive capture.
 */
export function reportIngressRequestFailure({
  endpoint,
  method,
  status,
  requestId,
  payload = null,
  responseSnippet = '',
  text = '',
} = {}) {
  if (typeof globalThis.window === 'undefined') return;

  const cleanEndpoint = normaliseEndpointPath(endpoint);
  const cleanMethod = String(method || 'GET').toUpperCase();
  const cleanStatus = Number(status) || 0;
  const cleanRequestId = String(requestId || '');
  const snippet = String(responseSnippet || text || '').slice(0, RESPONSE_SNIPPET_MAX_CHARS);
  const signal = summariseIngressFailureSignal({
    status: cleanStatus,
    payload,
    responseSnippet: snippet,
    text,
  });

  globalThis.console?.error?.('[network] request_failed', {
    endpoint: cleanEndpoint,
    method: cleanMethod,
    status: cleanStatus,
    requestId: cleanRequestId,
    signal,
  });

  if (!shouldCaptureIngressFailure(cleanStatus)) return;
  if (isOpsErrorEventEndpoint(cleanEndpoint)) return;

  try {
    captureClientError({
      source: 'network-request',
      error: {
        name: cleanStatus > 0 ? `Http${cleanStatus}` : 'NetworkError',
        message: buildIngressFailureMessage({
          method: cleanMethod,
          endpoint: cleanEndpoint,
          status: cleanStatus,
          signal,
        }),
        stack: `signal=${signal}`,
      },
      info: {
        routeName: cleanEndpoint,
      },
    });
  } catch {
    // Capture must never escalate a network failure.
  }
}
