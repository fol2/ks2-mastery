import { buildSignedInBootstrapResponse } from "../contracts/bootstrap-contract.js";
import { RateLimitError, ValidationError } from "../lib/http.js";
import { OAUTH_PROVIDER_KEYS, beginOAuthFlow, completeOAuthFlow } from "../lib/oauth.js";
import { consumeRateLimit } from "../lib/rate-limit.js";
import {
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "../lib/security.js";
import { verifyTurnstileToken } from "../lib/turnstile.js";
import {
  createEmailUser,
  createSession,
  deleteSessionByHash,
  findOrCreateUserFromIdentity,
  getSessionBundleByHash,
  getUserByEmail,
} from "../lib/store.js";

const AUTH_RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Please wait a few minutes and try again.";
const OAUTH_RATE_LIMIT_MESSAGE = "Too many social sign-in attempts. Please wait a few minutes and try again.";

// Sliding window applied to every auth-throttle bucket. Tuned together so
// the policy is obvious in one glance; change with care — the numbers also
// appear in integration tests.
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_LIMITS = {
  register: { ip: 6, email: 4 },
  login: { ip: 10, email: 8 },
  oauthStart: { ip: 12 },
};

async function createAuthenticatedSession(env, userId) {
  const sessionToken = randomToken(24);
  const sessionHash = await sha256(sessionToken);
  await createSession(env, userId, sessionHash);
  const bundle = await getSessionBundleByHash(env, sessionHash);
  return { sessionToken, bundle };
}

async function consumeAuthRateLimit(env, bucket, identifier, limit, windowMs, message) {
  const result = await consumeRateLimit(env, {
    bucket,
    identifier,
    limit,
    windowMs,
  });
  if (result.allowed) return;
  throw new RateLimitError(message, result.retryAfterSeconds);
}

async function protectEmailAuth(env, options) {
  const type = options.action === "register" ? "register" : "login";
  const turnstile = await verifyTurnstileToken(env, {
    token: options.turnstileToken,
    remoteIp: options.ip,
  });
  if (!turnstile.success) {
    throw new ValidationError(turnstile.message || "Complete the security check and try again.");
  }

  const limits = AUTH_LIMITS[type];

  await consumeAuthRateLimit(
    env,
    `auth-${type}-ip`,
    options.ip,
    limits.ip,
    AUTH_WINDOW_MS,
    AUTH_RATE_LIMIT_MESSAGE,
  );

  await consumeAuthRateLimit(
    env,
    `auth-${type}-email`,
    options.email,
    limits.email,
    AUTH_WINDOW_MS,
    AUTH_RATE_LIMIT_MESSAGE,
  );
}

const KNOWN_OAUTH_PROVIDERS = new Set(OAUTH_PROVIDER_KEYS);

async function protectOAuthStart(env, options) {
  // Reject unknown providers BEFORE consuming a rate-limit slot. Without this
  // guard a caller hitting /api/auth/<random>/start would create an unbounded
  // number of distinct limiter_key rows in D1 — a slow-burn storage DoS.
  const provider = String(options.provider || "").trim().toLowerCase();
  if (!KNOWN_OAUTH_PROVIDERS.has(provider)) {
    throw new ValidationError("Unknown sign-in provider.");
  }

  const turnstile = await verifyTurnstileToken(env, {
    token: options.turnstileToken,
    remoteIp: options.ip,
  });
  if (!turnstile.success) {
    throw new ValidationError(turnstile.message || "Complete the security check and try again.");
  }

  await consumeAuthRateLimit(
    env,
    `oauth-start-${provider}`,
    options.ip,
    AUTH_LIMITS.oauthStart.ip,
    AUTH_WINDOW_MS,
    OAUTH_RATE_LIMIT_MESSAGE,
  );
}

export async function registerWithEmail(env, credentials, security = {}) {
  if (!credentials.email || !credentials.email.includes("@")) {
    throw new ValidationError("Enter a valid email address.");
  }

  if (credentials.password.length < 8) {
    throw new ValidationError("Password must be at least eight characters.");
  }

  await protectEmailAuth(env, {
    action: "register",
    email: credentials.email,
    ip: security.ip || "",
    turnstileToken: credentials.turnstileToken,
  });

  const existing = await getUserByEmail(env, credentials.email);
  if (existing) {
    throw new ValidationError("That email address is already registered.");
  }

  const { salt, hash } = await hashPassword(credentials.password);
  let user;

  try {
    user = await createEmailUser(env, {
      email: credentials.email,
      passwordHash: hash,
      passwordSalt: salt,
    });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      throw new ValidationError("That email address is already registered.");
    }
    throw error;
  }

  const authenticated = await createAuthenticatedSession(env, user.id);
  return {
    bundle: authenticated.bundle,
    sessionToken: authenticated.sessionToken,
    payload: buildSignedInBootstrapResponse(authenticated.bundle, env),
  };
}

export async function loginWithEmail(env, credentials, security = {}) {
  if (!credentials.email || !credentials.password) {
    throw new ValidationError("Incorrect email or password.");
  }

  await protectEmailAuth(env, {
    action: "login",
    email: credentials.email,
    ip: security.ip || "",
    turnstileToken: credentials.turnstileToken,
  });

  const user = await getUserByEmail(env, credentials.email);
  if (!user?.password_hash || !user?.password_salt) {
    throw new ValidationError("Incorrect email or password.");
  }

  const valid = await verifyPassword(credentials.password, user.password_salt, user.password_hash);
  if (!valid) {
    throw new ValidationError("Incorrect email or password.");
  }

  const authenticated = await createAuthenticatedSession(env, user.id);
  return {
    bundle: authenticated.bundle,
    sessionToken: authenticated.sessionToken,
    payload: buildSignedInBootstrapResponse(authenticated.bundle, env),
  };
}

export function logoutSession(env, sessionHash) {
  return deleteSessionByHash(env, sessionHash);
}

export async function startSocialLogin(env, provider, origin, security = {}) {
  await protectOAuthStart(env, {
    provider,
    ip: security.ip || "",
    turnstileToken: security.turnstileToken,
  });

  try {
    return await beginOAuthFlow(env, provider, origin);
  } catch (error) {
    throw new ValidationError(error.message || "Could not start sign-in.");
  }
}

export async function completeSocialLogin(env, provider, origin, payload) {
  const { profile } = await completeOAuthFlow(env, provider, origin, payload);

  // Use ValidationError so a future JSON endpoint that reuses this helper
  // receives a 400 rather than the unhandled-exception 500 path. The GET/POST
  // callback routes already wrap the throw in redirectWithAuthError so the
  // user-facing behaviour is unchanged.
  if (!profile?.subject) {
    throw new ValidationError("The provider did not return a valid account identifier.");
  }

  const user = await findOrCreateUserFromIdentity(env, {
    provider,
    providerSubject: profile.subject,
    email: profile.emailVerified === false ? "" : profile.email,
  });

  return createAuthenticatedSession(env, user.id);
}
