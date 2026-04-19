import {
  deleteSpellingSession,
  getSpellingSession,
  saveSpellingSession,
} from "../lib/store.js";

export function findSpellingSessionState(env, userId, childId, sessionId) {
  return getSpellingSession(env, userId, childId, sessionId);
}

export function saveSpellingSessionState(env, userId, childId, sessionId, payload) {
  return saveSpellingSession(env, userId, childId, sessionId, payload);
}

export function deleteSpellingSessionState(env, userId, childId, sessionId) {
  return deleteSpellingSession(env, userId, childId, sessionId);
}
