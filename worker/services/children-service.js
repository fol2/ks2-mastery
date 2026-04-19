import { buildSignedInBootstrapResponse } from "../contracts/bootstrap-contract.js";
import { buildChildrenIndexResponse } from "../contracts/children-contract.js";
import { NotFoundError } from "../lib/http.js";
import {
  createChildProfile,
  findChildForUser,
  loadChildLearningState,
  updateChildProfile,
} from "../repositories/child-repository.js";
import { selectSessionChild } from "../repositories/session-repository.js";
import {
  patchBundleForNewChild,
  patchBundleForSelectedChild,
  patchBundleForUpdatedChild,
} from "./bundle-patches.js";

export function listChildren(bundle) {
  return buildChildrenIndexResponse(bundle);
}

export async function createChildForParent(env, bundle, _sessionHash, payload) {
  const child = await createChildProfile(env, bundle.user.id, payload);
  await selectSessionChild(env, bundle.session.id, child.id);
  // A fresh child has no persisted learning state yet — use the in-memory
  // default rather than hitting D1 again for an empty row.
  return buildSignedInBootstrapResponse(patchBundleForNewChild(bundle, child), env);
}

export async function updateChildForParent(env, bundle, _sessionHash, childId, payload) {
  const child = await updateChildProfile(env, bundle.user.id, childId, payload);
  if (!child) {
    throw new NotFoundError("Child profile not found.");
  }
  // A profile update never changes children list membership or selection —
  // patch the single child row in memory and reuse the rest of the bundle.
  return buildSignedInBootstrapResponse(patchBundleForUpdatedChild(bundle, child), env);
}

export async function selectChildForParent(env, bundle, _sessionHash, childId) {
  const child = await findChildForUser(env, bundle.user.id, childId);
  if (!child) {
    throw new NotFoundError("Child profile not found.");
  }

  await selectSessionChild(env, bundle.session.id, child.id);
  // The newly-selected child has its own learning state; one targeted read
  // replaces the six queries a full getSessionBundle would issue.
  const childState = await loadChildLearningState(env, child.id);
  return buildSignedInBootstrapResponse(
    patchBundleForSelectedChild(bundle, child, childState),
    env,
  );
}
