import {
  buildSignedInBootstrapResponse,
  buildSignedOutBootstrapResponse,
} from "../contracts/bootstrap-contract.js";
import { buildChildrenIndexResponse } from "../contracts/children-contract.js";
import { NotFoundError } from "../lib/http.js";
import {
  createChildProfile,
  findChildForUser,
  updateChildProfile,
} from "../repositories/child-repository.js";
import {
  getSessionBundle,
  selectSessionChild,
} from "../repositories/session-repository.js";

// A concurrent logout between the caller's requireSession and our post-write
// re-read can invalidate the session. Return the signed-out bootstrap payload
// rather than dereferencing null inside buildSignedInBootstrapResponse.
function bootstrapAfterMutation(refreshedBundle, env) {
  if (!refreshedBundle) return buildSignedOutBootstrapResponse(env);
  return buildSignedInBootstrapResponse(refreshedBundle, env);
}

export function listChildren(bundle) {
  return buildChildrenIndexResponse(bundle);
}

export async function createChildForParent(env, bundle, sessionHash, payload) {
  const child = await createChildProfile(env, bundle.user.id, payload);
  await selectSessionChild(env, bundle.session.id, child.id);
  const refreshedBundle = await getSessionBundle(env, sessionHash);
  return bootstrapAfterMutation(refreshedBundle, env);
}

export async function updateChildForParent(env, bundle, sessionHash, childId, payload) {
  const child = await updateChildProfile(env, bundle.user.id, childId, payload);
  if (!child) {
    throw new NotFoundError("Child profile not found.");
  }

  const refreshedBundle = await getSessionBundle(env, sessionHash);
  return bootstrapAfterMutation(refreshedBundle, env);
}

export async function selectChildForParent(env, bundle, sessionHash, childId) {
  const child = await findChildForUser(env, bundle.user.id, childId);
  if (!child) {
    throw new NotFoundError("Child profile not found.");
  }

  await selectSessionChild(env, bundle.session.id, child.id);
  const refreshedBundle = await getSessionBundle(env, sessionHash);
  return bootstrapAfterMutation(refreshedBundle, env);
}
