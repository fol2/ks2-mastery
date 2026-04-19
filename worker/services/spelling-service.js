import { buildSignedInBootstrapResponse } from "../contracts/bootstrap-contract.js";
import {
  buildSpellingAdvanceContinueResponse,
  buildSpellingAdvanceDoneResponse,
  buildSpellingDashboardResponse,
  buildSpellingSessionCreatedResponse,
  buildSpellingSkipResponse,
  buildSpellingSubmitResponse,
} from "../contracts/spelling-contract.js";
import { invokeSpellingLock } from "../durable/spelling-lock.js";
import { HttpError, NotFoundError, ValidationError } from "../lib/http.js";
import { buildBootstrapStats } from "../lib/spelling-service.js";
import { patchBundleForChildState } from "./bundle-patches.js";

function requireSelectedChild(bundle) {
  if (!bundle.selectedChild) {
    throw new ValidationError("Create a child profile first.");
  }
  return bundle.selectedChild;
}

// Every mutation that touches (spelling session, child state) for a single
// child is funnelled through the per-child Durable Object so two concurrent
// requests cannot race each other's read-modify-write. The DO turns an HTTP
// response into the shape the caller wants; any non-2xx becomes an HttpError
// with the DO's own `message` preserved for clients.
async function lockedMutation(env, childId, path, payload) {
  const response = await invokeSpellingLock(env, childId, path, payload);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || "Spelling mutation failed.";
    if (response.status === 404) throw new NotFoundError(message);
    if (response.status === 400) throw new ValidationError(message);
    throw new HttpError(response.status, message, {
      payload: { ok: false, message },
    });
  }
  return body;
}

export async function persistSpellingPrefs(env, bundle, _sessionHash, prefs) {
  const selectedChild = requireSelectedChild(bundle);
  const result = await lockedMutation(env, selectedChild.id, "/prefs", {
    childId: selectedChild.id,
    prefs,
  });
  return buildSignedInBootstrapResponse(
    patchBundleForChildState(bundle, result.childState),
    env,
  );
}

export async function startSpellingSession(env, bundle, payload) {
  const selectedChild = requireSelectedChild(bundle);
  const result = await lockedMutation(env, selectedChild.id, "/start", {
    userId: bundle.user.id,
    childId: selectedChild.id,
    payload,
  });
  return buildSpellingSessionCreatedResponse(result.session);
}

export async function submitSpellingAnswer(env, bundle, sessionId, payload) {
  const selectedChild = requireSelectedChild(bundle);
  const result = await lockedMutation(env, selectedChild.id, "/submit", {
    userId: bundle.user.id,
    childId: selectedChild.id,
    sessionId,
    typed: payload.typed,
  });
  return buildSpellingSubmitResponse({
    result: result.result,
    session: result.session,
    monsterEvent: result.monsterEvent,
    monsters: result.monsters,
  });
}

export async function skipSpellingSession(env, bundle, sessionId) {
  const selectedChild = requireSelectedChild(bundle);
  const result = await lockedMutation(env, selectedChild.id, "/skip", {
    userId: bundle.user.id,
    childId: selectedChild.id,
    sessionId,
  });
  return buildSpellingSkipResponse({
    result: result.result,
    session: result.session,
  });
}

export async function advanceSpellingSession(env, bundle, sessionId) {
  const selectedChild = requireSelectedChild(bundle);
  const result = await lockedMutation(env, selectedChild.id, "/advance", {
    userId: bundle.user.id,
    childId: selectedChild.id,
    sessionId,
  });

  if (result.done) {
    return buildSpellingAdvanceDoneResponse({
      summary: result.summary,
      monsters: result.monsters,
      spelling: result.spelling,
    });
  }

  return buildSpellingAdvanceContinueResponse(result.session);
}

export function getSpellingDashboard(bundle) {
  const selectedChild = requireSelectedChild(bundle);
  const spelling = buildBootstrapStats(selectedChild.id, bundle.childState).spelling;
  return buildSpellingDashboardResponse(spelling);
}
