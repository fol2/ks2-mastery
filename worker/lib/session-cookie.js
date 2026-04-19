import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { secureCookieForRequest } from "./http.js";
import { cookieOptions } from "./security.js";

export const SESSION_COOKIE_NAME = "ks2_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function getSessionToken(c) {
  return getCookie(c, SESSION_COOKIE_NAME) || "";
}

export function setSessionToken(c, sessionToken) {
  setCookie(
    c,
    SESSION_COOKIE_NAME,
    sessionToken,
    cookieOptions(SESSION_TTL_SECONDS, secureCookieForRequest(c)),
  );
}

export function clearSessionToken(c) {
  deleteCookie(c, SESSION_COOKIE_NAME, cookieOptions(0, secureCookieForRequest(c)));
}
