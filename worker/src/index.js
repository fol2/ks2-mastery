import { createWorkerApp } from './app.js';
import { json } from './http.js';
import { applySecurityHeaders } from './security-headers.js';

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
    const { pathname } = new URL(request.url);
    return applySecurityHeaders(response, { path: pathname });
  },
};
