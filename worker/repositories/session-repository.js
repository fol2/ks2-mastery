import {
  createSession,
  deleteSessionByHash,
  getSessionBundleByHash,
  setSelectedChild,
} from "../lib/store.js";

export function createUserSession(env, userId, sessionHash) {
  return createSession(env, userId, sessionHash);
}

export function deleteUserSessionByHash(env, sessionHash) {
  return deleteSessionByHash(env, sessionHash);
}

export function getSessionBundle(env, sessionHash) {
  return getSessionBundleByHash(env, sessionHash);
}

export function selectSessionChild(env, sessionId, childId) {
  return setSelectedChild(env, sessionId, childId);
}
