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
  saveChildLearningState,
} from "../repositories/child-repository.js";
import {
  getSessionBundle,
} from "../repositories/session-repository.js";
import {
  deleteSpellingSessionState,
  findSpellingSessionState,
  saveSpellingSessionState,
} from "../repositories/spelling-session-repository.js";

function requireSelectedChild(bundle) {
  if (!bundle.selectedChild) {
    throw new ValidationError("Create a child profile first.");
  }
  return bundle.selectedChild;
}

async function loadActiveSpellingSession(env, bundle, sessionId) {
  const selectedChild = requireSelectedChild(bundle);
  const sessionState = await findSpellingSessionState(env, bundle.user.id, selectedChild.id, sessionId);
  if (!sessionState) {
    throw new NotFoundError("Spelling session not found.");
  }
  return { selectedChild, sessionState };
}

export async function persistSpellingPrefs(env, bundle, sessionHash, prefs) {
  const selectedChild = requireSelectedChild(bundle);
  const nextState = saveSpellingPreferences(bundle.childState, prefs);
  await saveChildLearningState(env, selectedChild.id, nextState);
  const refreshedBundle = await getSessionBundle(env, sessionHash);
  return buildSignedInBootstrapResponse(refreshedBundle, env);
}

export async function startSpellingSession(env, bundle, payload) {
  const selectedChild = requireSelectedChild(bundle);
  const result = createSessionForChild(selectedChild.id, bundle.childState, payload);

  if (!result.ok) {
    throw new ValidationError(result.reason);
  }

  await saveChildLearningState(env, selectedChild.id, result.childState);
  await saveSpellingSessionState(
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
  await saveChildLearningState(env, selectedChild.id, submission.childState);
  await saveSpellingSessionState(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);

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
  await saveChildLearningState(env, selectedChild.id, skipped.childState);
  await saveSpellingSessionState(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);

  return buildSpellingSkipResponse({
    result: skipped.result,
    session: skipped.payload,
  });
}

export async function advanceSpellingSession(env, bundle, sessionId) {
  const { selectedChild, sessionState } = await loadActiveSpellingSession(env, bundle, sessionId);
  const advanced = advanceSessionState(selectedChild.id, bundle.childState, sessionState);
  await saveChildLearningState(env, selectedChild.id, advanced.childState);

  if (advanced.done) {
    await deleteSpellingSessionState(env, bundle.user.id, selectedChild.id, sessionId);
    const stats = buildBootstrapStats(selectedChild.id, advanced.childState);
    return buildSpellingAdvanceDoneResponse({
      summary: advanced.summary,
      monsters: stats.monsters,
      spelling: stats.spelling,
    });
  }

  await saveSpellingSessionState(env, bundle.user.id, selectedChild.id, sessionState.id, sessionState);
  return buildSpellingAdvanceContinueResponse(advanced.payload);
}

export function getSpellingDashboard(bundle) {
  const selectedChild = requireSelectedChild(bundle);
  const spelling = buildBootstrapStats(selectedChild.id, bundle.childState).spelling;
  return buildSpellingDashboardResponse(spelling);
}
