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

/**
 * Record the browser half of a failed request without creating another
 * server request. Cloudflare invocation logs remain authoritative for the
 * server outcome; this event supplies the request id needed to join them.
 */
export function reportIngressRequestFailure({ endpoint, method, status, requestId } = {}) {
  if (typeof globalThis.window === 'undefined') return;
  globalThis.console?.error?.('[network] request_failed', {
    endpoint: String(endpoint || '').split('?')[0],
    method: String(method || 'GET').toUpperCase(),
    status: Number(status) || 0,
    requestId: String(requestId || ''),
  });
}
