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

// Keep error messages short and single-line before echoing them into the
// redirect URL — provider errors sometimes embed newlines or multi-KB HTML,
// and an unbounded query string can hit URL length limits or look like a
// phishing payload to security scanners.
const AUTH_ERROR_MAX_LENGTH = 200;

function sanitiseAuthErrorMessage(message) {
  const raw = String(message || "Could not complete sign-in.");
  const singleLine = raw.replace(/[\r\n\t]+/g, " ").trim();
  return singleLine.length > AUTH_ERROR_MAX_LENGTH
    ? `${singleLine.slice(0, AUTH_ERROR_MAX_LENGTH - 1)}…`
    : singleLine || "Could not complete sign-in.";
}

export function redirectWithAuthError(c, message) {
  clearOauthAttempt(c);
  return c.redirect(
    `${appOrigin(c)}/?authError=${encodeURIComponent(sanitiseAuthErrorMessage(message))}`,
    302,
  );
}
