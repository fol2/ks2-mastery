import { json } from "../lib/http.js";
import { setSessionLogContext } from "../lib/observability.js";
import { sha256 } from "../lib/security.js";
import { clearSessionToken, getSessionToken } from "../lib/session-cookie.js";
import { getSessionBundleByHash } from "../lib/store.js";

export async function requireSession(c, next) {
  const sessionToken = getSessionToken(c);
  if (!sessionToken) {
    return json(c, 401, { ok: false, message: "Sign in required." });
  }

  const sessionHash = await sha256(sessionToken);
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  if (!bundle) {
    clearSessionToken(c);
    return json(c, 401, { ok: false, message: "Session expired." });
  }

  c.set("sessionBundle", bundle);
  c.set("sessionHash", sessionHash);
  c.set("sessionToken", sessionToken);
  setSessionLogContext(c, bundle);
  return next();
}
