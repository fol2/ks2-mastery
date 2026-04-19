import { buildSignedInBootstrapResponse, buildSignedOutBootstrapResponse } from "../contracts/bootstrap-contract.js";
import { sha256 } from "../lib/security.js";
import { getSessionBundle } from "../repositories/session-repository.js";

export async function loadBootstrap(env, sessionToken) {
  if (!sessionToken) {
    return {
      bundle: null,
      clearSession: false,
      payload: buildSignedOutBootstrapResponse(env),
    };
  }

  const sessionHash = await sha256(sessionToken);
  const bundle = await getSessionBundle(env, sessionHash);

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
