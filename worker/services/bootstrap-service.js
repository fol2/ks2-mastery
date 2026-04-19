import { buildSignedInBootstrapResponse, buildSignedOutBootstrapResponse } from "../contracts/bootstrap-contract.js";
import { sha256 } from "../lib/security.js";
import { getSessionBundleByHash } from "../lib/store.js";

export async function loadBootstrap(env, sessionToken) {
  if (!sessionToken) {
    return {
      bundle: null,
      clearSession: false,
      payload: buildSignedOutBootstrapResponse(env),
    };
  }

  const sessionHash = await sha256(sessionToken);
  const bundle = await getSessionBundleByHash(env, sessionHash);

  if (!bundle) {
    return {
      bundle: null,
      clearSession: true,
      payload: buildSignedOutBootstrapResponse(env),
    };
  }

  return {
    bundle,
    clearSession: false,
    payload: buildSignedInBootstrapResponse(bundle, env),
  };
}
