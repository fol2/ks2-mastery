/**
 * Worker entry point.
 *
 * workerd module validation requires that the main module exports ONLY:
 *   - default { fetch, scheduled }        (the Worker handler object)
 *   - Named class exports for Durable Objects declared in wrangler.jsonc
 *
 * All other functionality (cron telemetry, security-header helpers) is
 * extracted to dedicated modules that index.js imports but does NOT
 * re-export.  This keeps the workerd module surface clean and unblocks
 * `wrangler dev --local` for the local capacity harness.
 */

import { createWorkerApp } from './app.js';
import { json } from './http.js';
import { applySecurityHeadersSafely } from './security-headers-safe.js';
import { runScheduledHandler } from './cron/scheduled.js';

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

  /**
   * Cloudflare Cron Trigger entrypoint. Fires per `wrangler.jsonc`
   * `[triggers] crons` entries — daily primary + fallback retry one hour
   * later so a crashed/locked primary recovers without waiting 24h.
   */
  async scheduled(event, env, ctx) {
    return runScheduledHandler(event, env, ctx);
  },
};
