import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { appOrigin, secureCookieForRequest } from "./http.js";
import { cookieOptions } from "./security.js";

const OAUTH_STATE_COOKIE = "ks2_oauth_state";
const OAUTH_PROVIDER_COOKIE = "ks2_oauth_provider";
const OAUTH_VERIFIER_COOKIE = "ks2_oauth_verifier";
const OAUTH_NONCE_COOKIE = "ks2_oauth_nonce";
const OAUTH_TTL_SECONDS = 60 * 10;

export function clearOauthAttempt(c) {
  const secure = secureCookieForRequest(c);
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_PROVIDER_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_VERIFIER_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_NONCE_COOKIE, cookieOptions(0, secure));
}

export function setOauthAttempt(c, provider, attempt) {
  const secure = secureCookieForRequest(c);
  setCookie(c, OAUTH_STATE_COOKIE, attempt.state, cookieOptions(OAUTH_TTL_SECONDS, secure));
  setCookie(c, OAUTH_PROVIDER_COOKIE, provider, cookieOptions(OAUTH_TTL_SECONDS, secure));

  if (attempt.codeVerifier) {
    setCookie(c, OAUTH_VERIFIER_COOKIE, attempt.codeVerifier, cookieOptions(OAUTH_TTL_SECONDS, secure));
  } else {
    deleteCookie(c, OAUTH_VERIFIER_COOKIE, cookieOptions(0, secure));
  }

  if (attempt.nonce) {
    setCookie(c, OAUTH_NONCE_COOKIE, attempt.nonce, cookieOptions(OAUTH_TTL_SECONDS, secure));
  } else {
    deleteCookie(c, OAUTH_NONCE_COOKIE, cookieOptions(0, secure));
  }
}

export function readOauthAttempt(c) {
  return {
    state: getCookie(c, OAUTH_STATE_COOKIE) || "",
    provider: getCookie(c, OAUTH_PROVIDER_COOKIE) || "",
    codeVerifier: getCookie(c, OAUTH_VERIFIER_COOKIE) || "",
    nonce: getCookie(c, OAUTH_NONCE_COOKIE) || "",
  };
}

export function redirectWithAuthError(c, message) {
  clearOauthAttempt(c);
  return c.redirect(
    `${appOrigin(c)}/?authError=${encodeURIComponent(String(message || "Could not complete sign-in."))}`,
    302,
  );
}
