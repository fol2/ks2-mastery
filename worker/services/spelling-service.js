import { buildSignedInBootstrapResponse } from "../contracts/bootstrap-contract.js";
import {
  buildSpellingAdvanceContinueResponse,
  buildSpellingAdvanceDoneResponse,
  buildSpellingDashboardResponse,
  buildSpellingSessionCreatedResponse,
  buildSpellingSkipResponse,
  buildSpellingSubmitResponse,
} from "../contracts/spelling-contract.js";
import { NotFoundError, ValidationError } from "../lib/http.js";
import {
  advanceSession as advanceSessionState,
  buildBootstrapStats,
  createSessionForChild,
  savePrefs as saveSpellingPreferences,
  skipSession as skipSessionState,
  submitSession as submitSessionState,
} from "../lib/spelling-service.js";
import {
  deleteSpellingSession,
  getSpellingSession,
  saveChildState,
  saveSpellingSession,
} from "../lib/store.js";
import { patchBundleForChildState } from "./bundle-patches.js";

function requireSelectedChild(bundle) {
  if (!bundle.selectedChild) {
    throw new ValidationError("Create a child profile first.");
  }
  return bundle.selectedChild;
}

async function loadActiveSpellingSession(env, bundle, sessionId) {
  const selectedChild = requireSelectedChild(bundle);
  const sessionState = await getSpellingSession(env, bundle.user.id, selectedChild.id, sessionId);
  if (!sessionState) {
    throw new NotFoundError("Spelling session not found.");
  }
  return { selectedChild, sessionState };
}

export async function persistSpellingPrefs(env, bundle, _sessionHash, prefs) {
  const selectedChild = requireSelectedChild(bundle);
  const nextState = saveSpellingPreferences(bundle.childState, prefs);
  await saveChildState(env, selectedChild.id, nextState);
  // Prefs are saved on the currently-selected child, so only bundle.childState
  // changes — patch in memory instead of re-reading the entire bundle.
  return buildSignedInBootstrapResponse(patchBundleForChildState(bundle, nextState), env);
}

export async function startSpellingSession(env, bundle, payload) {
  const selectedChild = requireSelectedChild(bundle);
  const result = createSessionForChild(selectedChild.id, bundle.childState, payload);

  if (!result.ok) {
    throw new ValidationError(result.reason);
  }

  await saveChildState(env, selectedChild.id, result.childState);
  await saveSpellingSession(
    env,
    bundle.user.id,
    selectedChild.id,
    result.sessionState.id,
    result.sessionState,
  );

  return buildSpellingSessionCreatedResponse(result.payload);
}

export async function submitSpellingAnswer(env, bundle, sessionId, payload) {
  const { selectedChild, sessionState } = await loadActiveSpellingSession(env, bundle, sessionId);
  const submission = submitSessionState(selectedChild.id, bundle.childState, sessionState, payload.typed);
  // engine.submitLearning/submitTest can return `null` when the session is in
  // a phase that does not accept submissions (e.g. no currentSlug yet, or a
  // test session that has already finalised). Convert that into a 400 rather
  // than letting the strict response contract assert a null-result and 500.
  if (!submission.result) {
    throw new ValidationError("This spelling card is not accepting an answer right now.");
  }
  await saveChildState(env, selectedChild.id, submission.childState);
  await saveSpellingSession(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);

  return buildSpellingSubmitResponse({
    result: submission.result,
    session: submission.payload,
    monsterEvent: submission.monsterEvent,
    monsters: buildBootstrapStats(selectedChild.id, submission.childState).monsters,
  });
}

export async function skipSpellingSession(env, bundle, sessionId) {
  const { selectedChild, sessionState } = await loadActiveSpellingSession(env, bundle, sessionId);
  const skipped = skipSessionState(selectedChild.id, bundle.childState, sessionState);
  // engine.skipCurrent is only valid in the `question` phase of a learning
  // session; any other entry point yields `null`. Surface as a 400 instead of
  // a generic 500 triggered by the response-shape assertion.
  if (!skipped.result) {
    throw new ValidationError("This spelling card cannot be skipped right now.");
  }
  await saveChildState(env, selectedChild.id, skipped.childState);
  await saveSpellingSession(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);

  return buildSpellingSkipResponse({
    result: skipped.result,
    session: skipped.payload,
  });
}

export async function advanceSpellingSession(env, bundle, sessionId) {
  const { selectedChild, sessionState } = await loadActiveSpellingSession(env, bundle, sessionId);
  const advanced = advanceSessionState(selectedChild.id, bundle.childState, sessionState);
  await saveChildState(env, selectedChild.id, advanced.childState);

  if (advanced.done) {
    await deleteSpellingSession(env, bundle.user.id, selectedChild.id, sessionId);
    const stats = buildBootstrapStats(selectedChild.id, advanced.childState);
    return buildSpellingAdvanceDoneResponse({
      summary: advanced.summary,
      monsters: stats.monsters,
      spelling: stats.spelling,
    });
  }

  await saveSpellingSession(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);
  return buildSpellingAdvanceContinueResponse(advanced.payload);
}

export function getSpellingDashboard(bundle) {
  const selectedChild = requireSelectedChild(bundle);
  const spelling = buildBootstrapStats(selectedChild.id, bundle.childState).spelling;
  return buildSpellingDashboardResponse(spelling);
}
