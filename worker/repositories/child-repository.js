import {
  createChild,
  getChild,
  getChildState,
  saveChildState,
  updateChild,
} from "../lib/store.js";

export function createChildProfile(env, userId, payload) {
  return createChild(env, userId, payload);
}

export function findChildForUser(env, userId, childId) {
  return getChild(env, userId, childId);
}

export function updateChildProfile(env, userId, childId, payload) {
  return updateChild(env, userId, childId, payload);
}

export function loadChildLearningState(env, childId) {
  return getChildState(env, childId);
}

export function saveChildLearningState(env, childId, payload) {
  return saveChildState(env, childId, payload);
}
