import {
  asEmail,
  asObject,
  asString,
  invariant,
} from "../lib/validation.js";

export function parseCredentialsPayload(body) {
  const payload = asObject(body);
  return {
    email: asEmail(payload.email),
    password: asString(payload.password, { trim: false }),
    turnstileToken: asString(payload.turnstileToken, { trim: false }),
  };
}

export function normaliseAuthProvider(value) {
  return asString(value).toLowerCase();
}

export function normaliseOAuthCallbackPayload(payload) {
  return Object.fromEntries(
    Object.entries(asObject(payload)).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] || "") : String(value || ""),
    ]),
  );
}

export function parseOAuthStartPayload(body) {
  const payload = asObject(body);
  return {
    turnstileToken: asString(payload.turnstileToken, { trim: false }),
  };
}

export function buildLogoutResponse() {
  const payload = { ok: true };
  invariant(payload.ok === true, "Logout response must include ok=true.");
  return payload;
}
