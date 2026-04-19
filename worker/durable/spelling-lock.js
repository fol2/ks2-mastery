// Per-child Durable Object that serialises every mutation touching a child's
// spelling session + learning state. Cloudflare guarantees that a single DO
// instance processes one `fetch` at a time, so two concurrent /submit calls
// from the same user (double-click, retry, multi-tab) now queue instead of
// racing. D1 remains the source of truth — this DO owns no persistent
// storage of its own; it only holds the lock.
//
// The DO is invoked by functions in `worker/services/spelling-service.js`.
// Routes and contracts stay unchanged: the DO is an implementation detail of
// the service layer. Children CRUD does not route through the DO because
// those writes are not racy in practice (a parent does not double-click
// "save profile") and the extra RPC hop would add latency for no correctness
// win.

import {
  advanceSession,
  buildBootstrapStats,
  createSessionForChild,
  savePrefs,
  skipSession,
  submitSession,
} from "../lib/spelling-service.js";
import {
  deleteSpellingSession,
  getChildState,
  getSpellingSession,
  saveChildState,
  saveSpellingSession,
} from "../lib/store.js";

// Route prefix is semantic only — `env.SPELLING_LOCK.get(id).fetch(url, …)`
// requires an absolute URL but the host never leaves this process.
const LOCK_ORIGIN = "https://spelling-lock.ks2.invalid";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(message) {
  return json(404, { ok: false, message });
}

function validationError(message) {
  return json(400, { ok: false, message });
}

export class SpellingLockDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const payload = await request.json().catch(() => ({}));

    switch (url.pathname) {
      case "/submit":
        return this.submit(payload);
      case "/skip":
        return this.skip(payload);
      case "/advance":
        return this.advance(payload);
      case "/start":
        return this.start(payload);
      case "/prefs":
        return this.persistPrefs(payload);
      default:
        return json(404, { ok: false, message: "Unknown operation." });
    }
  }

  async loadSessionState({ userId, childId, sessionId }) {
    const state = await getSpellingSession(this.env, userId, childId, sessionId);
    if (!state) return null;
    return state;
  }

  async submit({ userId, childId, sessionId, typed }) {
    const sessionState = await this.loadSessionState({ userId, childId, sessionId });
    if (!sessionState) return notFound("Spelling session not found.");
    const childState = await getChildState(this.env, childId);

    const submission = submitSession(childId, childState, sessionState, typed);
    if (!submission.result) {
      return validationError("This spelling card is not accepting an answer right now.");
    }

    await saveChildState(this.env, childId, submission.childState);
    await saveSpellingSession(this.env, userId, childId, sessionId, sessionState);

    const stats = buildBootstrapStats(childId, submission.childState);
    return json(200, {
      result: submission.result,
      session: submission.payload,
      monsterEvent: submission.monsterEvent,
      monsters: stats.monsters,
      childState: submission.childState,
    });
  }

  async skip({ userId, childId, sessionId }) {
    const sessionState = await this.loadSessionState({ userId, childId, sessionId });
    if (!sessionState) return notFound("Spelling session not found.");
    const childState = await getChildState(this.env, childId);

    const skipped = skipSession(childId, childState, sessionState);
    if (!skipped.result) {
      return validationError("This spelling card cannot be skipped right now.");
    }

    await saveChildState(this.env, childId, skipped.childState);
    await saveSpellingSession(this.env, userId, childId, sessionId, sessionState);

    return json(200, {
      result: skipped.result,
      session: skipped.payload,
      childState: skipped.childState,
    });
  }

  async advance({ userId, childId, sessionId }) {
    const sessionState = await this.loadSessionState({ userId, childId, sessionId });
    if (!sessionState) return notFound("Spelling session not found.");
    const childState = await getChildState(this.env, childId);

    const advanced = advanceSession(childId, childState, sessionState);
    await saveChildState(this.env, childId, advanced.childState);

    if (advanced.done) {
      await deleteSpellingSession(this.env, userId, childId, sessionId);
      const stats = buildBootstrapStats(childId, advanced.childState);
      return json(200, {
        done: true,
        summary: advanced.summary,
        monsters: stats.monsters,
        spelling: stats.spelling,
        childState: advanced.childState,
      });
    }

    await saveSpellingSession(this.env, userId, childId, sessionId, sessionState);
    return json(200, {
      done: false,
      session: advanced.payload,
      childState: advanced.childState,
    });
  }

  async start({ userId, childId, payload }) {
    const childState = await getChildState(this.env, childId);
    const result = createSessionForChild(childId, childState, payload);
    if (!result.ok) {
      return validationError(result.reason || "Could not start a spelling session.");
    }

    await saveChildState(this.env, childId, result.childState);
    await saveSpellingSession(
      this.env,
      userId,
      childId,
      result.sessionState.id,
      result.sessionState,
    );

    return json(200, {
      session: result.payload,
      childState: result.childState,
    });
  }

  async persistPrefs({ childId, prefs }) {
    const childState = await getChildState(this.env, childId);
    const nextState = savePrefs(childState, prefs);
    await saveChildState(this.env, childId, nextState);
    return json(200, { childState: nextState });
  }
}

// Small helper so services do not have to juggle the lock-origin convention.
export async function invokeSpellingLock(env, childId, path, payload) {
  const id = env.SPELLING_LOCK.idFromName(childId);
  const stub = env.SPELLING_LOCK.get(id);
  return stub.fetch(`${LOCK_ORIGIN}${path}`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}
