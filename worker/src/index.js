import { createWorkerApp } from './app.js';
import { json } from './http.js';
import { applySecurityHeaders } from './security-headers.js';

/**
 * Apply the security wrapper defensively. If `wrap` (by default
 * `applySecurityHeaders`) throws, return the underlying response unchanged
 * so the Worker never emits a 1101 just because header composition failed.
 *
 * Exported so tests can drive the throw path with a stubbed wrapper
 * (review reliability-1).
 *
 * @param {Response} response
 * @param {{ path?: string }} options
 * @param {(response: Response, options: { path?: string }) => Response} [wrap]
 * @returns {Response}
 */
export function applySecurityHeadersSafely(response, options, wrap = applySecurityHeaders) {
  try {
    return wrap(response, options);
  } catch (error) {
    console.error('[ks2-security-headers] wrapper failed', error?.message);
    return response;
  }
}

export class LearnerLock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, durableObject: 'LearnerLock' });
    }
    return json({
      ok: false,
      status: 'not_implemented',
      message: 'LearnerLock remains a future coordination hook for per-learner mutation serialisation.',
    }, 501);
  }
}

const app = createWorkerApp();

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    // U6: single wrap site per plan KTD F-01. Every Worker-generated
    // response (JSON, 302 redirect, 404 plaintext, TTS binary, ASSETS
    // pass-through) flows through applySecurityHeaders here. Do NOT add a
    // second wrap inside http.js::json() — that would double-set headers
    // and make the single-source-of-truth guarantee harder to reason about.
    //
    // Reliability (review reliability-1): if applySecurityHeaders itself
    // throws (unexpected non-Response input, malformed headers bag), we
    // prefer to surface the underlying response than emit a Worker 1101.
    // Availability beats header strictness at the edge.
    const { pathname } = new URL(request.url);
    return applySecurityHeadersSafely(response, { path: pathname });
  },
};
