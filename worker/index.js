import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  createChild,
  createEmailUser,
  createSession,
  deleteSessionByHash,
  deleteSpellingSession,
  ensureSchema,
  findOrCreateUserFromIdentity,
  getChild,
  getSessionBundleByHash,
  getSpellingSession,
  getUserByEmail,
  saveChildState,
  saveSpellingSession,
  serialiseSubscription,
  setSelectedChild,
  updateChild,
} from "./lib/store.js";
import { consumeRateLimit } from "./lib/rate-limit.js";
import { cookieOptions, hashPassword, randomToken, safeEmail, sha256, verifyPassword } from "./lib/security.js";
import { beginOAuthFlow, completeOAuthFlow, providerConfig } from "./lib/oauth.js";
import {
  SPELLING_MODES,
  advanceSession,
  buildBootstrapStats,
  createSessionForChild,
  savePrefs,
  skipSession,
  submitSession,
} from "./lib/spelling-service.js";
import { listElevenLabsVoices, synthesiseSpeech, ttsProviderConfig } from "./lib/tts.js";
import { turnstileConfig, verifyTurnstileToken } from "./lib/turnstile.js";

const app = new Hono();

function json(c, status, payload) {
  return c.json(payload, status);
}

function validationError(c, message) {
  return json(c, 400, { ok: false, message });
}

function secureCookieForRequest(c) {
  return c.req.url.startsWith('https://');
}

const OAUTH_STATE_COOKIE = "ks2_oauth_state";
const OAUTH_PROVIDER_COOKIE = "ks2_oauth_provider";
const OAUTH_VERIFIER_COOKIE = "ks2_oauth_verifier";
const OAUTH_NONCE_COOKIE = "ks2_oauth_nonce";

function appOrigin(c) {
  return new URL(c.req.url).origin;
}

function clientIp(c) {
  const direct = String(
    c.req.header("CF-Connecting-IP")
    || c.req.header("True-Client-IP")
    || "",
  ).trim();
  if (direct) return direct;
  const forwarded = String(c.req.header("X-Forwarded-For") || "").trim();
  return forwarded ? forwarded.split(",")[0].trim() : "";
}

function clearOauthAttempt(c) {
  const secure = secureCookieForRequest(c);
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_PROVIDER_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_VERIFIER_COOKIE, cookieOptions(0, secure));
  deleteCookie(c, OAUTH_NONCE_COOKIE, cookieOptions(0, secure));
}

function redirectWithAuthError(c, message) {
  clearOauthAttempt(c);
  return c.redirect(`${appOrigin(c)}/?authError=${encodeURIComponent(String(message || "Could not complete sign-in."))}`, 302);
}

function setOauthAttempt(c, provider, attempt) {
  const secure = secureCookieForRequest(c);
  const ttl = 60 * 10;
  setCookie(c, OAUTH_STATE_COOKIE, attempt.state, cookieOptions(ttl, secure));
  setCookie(c, OAUTH_PROVIDER_COOKIE, provider, cookieOptions(ttl, secure));
  if (attempt.codeVerifier) setCookie(c, OAUTH_VERIFIER_COOKIE, attempt.codeVerifier, cookieOptions(ttl, secure));
  else deleteCookie(c, OAUTH_VERIFIER_COOKIE, cookieOptions(0, secure));
  if (attempt.nonce) setCookie(c, OAUTH_NONCE_COOKIE, attempt.nonce, cookieOptions(ttl, secure));
  else deleteCookie(c, OAUTH_NONCE_COOKIE, cookieOptions(0, secure));
}

function normaliseCallbackPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? String(value[0] || "") : String(value || ""),
    ]),
  );
}

function sanitiseChildPayload(payload) {
  return {
    name: String(payload?.name || "").trim(),
    yearGroup: String(payload?.yearGroup || "Y5"),
    avatarColor: String(payload?.avatarColor || "#3E6FA8"),
    goal: String(payload?.goal || "sats"),
    dailyMinutes: Math.max(5, Math.min(60, Number(payload?.dailyMinutes) || 15)),
    weakSubjects: Array.isArray(payload?.weakSubjects) ? payload.weakSubjects.slice(0, 6) : [],
  };
}

function signedOutBootstrapPayload(env) {
  return {
    ok: true,
    auth: {
      signedIn: false,
      providers: providerConfig(env),
      turnstile: turnstileConfig(env),
    },
    billing: {
      planCode: "free",
      status: "active",
      paywallEnabled: false,
    },
    children: [],
    selectedChild: null,
    spelling: {
      stats: { all: null, y3_4: null, y5_6: null },
      prefs: { yearFilter: "all", roundLength: "20", showCloze: true, autoSpeak: true },
    },
    monsters: {},
    tts: {
      providers: ttsProviderConfig(env),
    },
  };
}

function validationFailure(status, message, retryAfterSeconds = 0) {
  return {
    status,
    message,
    retryAfterSeconds,
  };
}

function applyValidationFailure(c, failure) {
  if (failure.retryAfterSeconds) {
    c.header("Retry-After", String(failure.retryAfterSeconds));
  }
  return json(c, failure.status, {
    ok: false,
    message: failure.message,
    retryAfterSeconds: failure.retryAfterSeconds || undefined,
  });
}

async function consumeAuthRateLimit(c, bucket, identifier, limit, windowMs, message) {
  const result = await consumeRateLimit(c.env, {
    bucket,
    identifier,
    limit,
    windowMs,
  });
  if (result.allowed) return null;
  return validationFailure(429, message, result.retryAfterSeconds);
}

// Shared wording across IP- and email-bucket throttles: a split message would
// let an attacker tell whether a given email exists by seeing which 429 kicks
// in first.
const AUTH_RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Please wait a few minutes and try again.";

async function protectEmailAuth(c, email, turnstileToken, action) {
  const ip = clientIp(c);
  const type = action === "register" ? "register" : "login";

  const ipLimit = await consumeAuthRateLimit(
    c,
    `auth-${type}-ip`,
    ip,
    type === "register" ? 6 : 10,
    10 * 60 * 1000,
    AUTH_RATE_LIMIT_MESSAGE,
  );
  if (ipLimit) return ipLimit;

  const emailLimit = await consumeAuthRateLimit(
    c,
    `auth-${type}-email`,
    safeEmail(email),
    type === "register" ? 4 : 8,
    10 * 60 * 1000,
    AUTH_RATE_LIMIT_MESSAGE,
  );
  if (emailLimit) return emailLimit;

  const turnstile = await verifyTurnstileToken(c.env, {
    token: turnstileToken,
    remoteIp: ip,
  });
  if (!turnstile.success) {
    return validationFailure(400, turnstile.message || "Complete the security check and try again.");
  }

  return null;
}

async function protectAuthenticatedTtsCall(c, bucket, limit, windowMs) {
  const sessionHash = c.get("sessionHash");
  if (!sessionHash) return null;
  return consumeAuthRateLimit(
    c,
    bucket,
    sessionHash,
    limit,
    windowMs,
    "You are generating speech too quickly. Please slow down and try again shortly.",
  );
}

async function protectOAuthStart(c, provider, turnstileToken) {
  const ip = clientIp(c);
  const rateLimit = await consumeAuthRateLimit(
    c,
    `oauth-start-${String(provider || "").trim().toLowerCase()}`,
    ip,
    12,
    10 * 60 * 1000,
    "Too many social sign-in attempts. Please wait a few minutes and try again.",
  );
  if (rateLimit) return rateLimit;

  const turnstile = await verifyTurnstileToken(c.env, {
    token: turnstileToken,
    remoteIp: ip,
  });
  if (!turnstile.success) {
    return validationFailure(400, turnstile.message || "Complete the security check and try again.");
  }

  return null;
}

function parseSessionLength(rawLength, mode) {
  if (mode === SPELLING_MODES.TEST) return 20;
  if (rawLength === "all" || rawLength === Infinity) return Infinity;
  const parsed = Number(rawLength);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function bootstrapPayload(bundle, env) {
  const selectedChild = bundle.selectedChild;
  const childStats = selectedChild
    ? buildBootstrapStats(selectedChild.id, bundle.childState)
    : {
        spelling: {
          stats: { all: null, y3_4: null, y5_6: null },
          prefs: { yearFilter: "all", roundLength: "20", showCloze: true, autoSpeak: true },
        },
        monsters: {},
      };

  return {
    ok: true,
    auth: {
      signedIn: true,
      user: bundle.user,
      providers: providerConfig(env),
      turnstile: turnstileConfig(env),
    },
    billing: serialiseSubscription(bundle.subscription),
    children: bundle.children,
    selectedChild,
    spelling: childStats.spelling,
    monsters: childStats.monsters,
    tts: {
      providers: ttsProviderConfig(env),
    },
  };
}

async function requireSession(c, next) {
  const rawToken = getCookie(c, "ks2_session");
  if (!rawToken) return json(c, 401, { ok: false, message: "Sign in required." });
  const sessionHash = await sha256(rawToken);
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  if (!bundle) {
    deleteCookie(c, "ks2_session", cookieOptions(0, secureCookieForRequest(c)));
    return json(c, 401, { ok: false, message: "Session expired." });
  }
  c.set("sessionBundle", bundle);
  c.set("sessionHash", sessionHash);
  c.set("sessionToken", rawToken);
  return next();
}

app.use("/api/*", async (c, next) => {
  try {
    await ensureSchema(c.env);
    return next();
  } catch (error) {
    console.error("Schema initialisation failed", error);
    return json(c, 500, { ok: false, message: "Database is not ready." });
  }
});

app.get("/api/bootstrap", async (c) => {
  // Bootstrap carries signed-in email, billing state, and child profile data.
  // Even though the cookie is `HttpOnly`, downstream proxies or stale service
  // workers could cache the response and leak one user's bootstrap to another.
  c.header("Cache-Control", "no-store");

  const rawToken = getCookie(c, "ks2_session");
  if (!rawToken) {
    return json(c, 200, signedOutBootstrapPayload(c.env));
  }

  const sessionHash = await sha256(rawToken);
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  if (!bundle) {
    deleteCookie(c, "ks2_session", cookieOptions(0, secureCookieForRequest(c)));
    return json(c, 200, signedOutBootstrapPayload(c.env));
  }

  return json(c, 200, bootstrapPayload(bundle, c.env));
});

app.post("/api/auth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = safeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !email.includes("@")) return validationError(c, "Enter a valid email address.");
  if (password.length < 8) return validationError(c, "Password must be at least eight characters.");

  const protectionFailure = await protectEmailAuth(c, email, body.turnstileToken, "register");
  if (protectionFailure) return applyValidationFailure(c, protectionFailure);

  const existing = await getUserByEmail(c.env, email);
  if (existing) return validationError(c, "That email address is already registered.");

  const { salt, hash } = await hashPassword(password);
  let user;
  try {
    user = await createEmailUser(c.env, {
      email,
      passwordHash: hash,
      passwordSalt: salt,
    });
  } catch (error) {
    // UNIQUE(email) can still fire if a concurrent request passed the pre-check
    // at the same time. Treat as the same validation error the pre-check gives.
    if (String(error?.message || "").toLowerCase().includes("unique")) {
      return validationError(c, "That email address is already registered.");
    }
    throw error;
  }

  const sessionToken = randomToken(24);
  const sessionHash = await sha256(sessionToken);
  await createSession(c.env, user.id, sessionHash);
  setCookie(c, "ks2_session", sessionToken, cookieOptions(60 * 60 * 24 * 30, secureCookieForRequest(c)));
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  return json(c, 201, bootstrapPayload(bundle, c.env));
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = safeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) {
    return validationError(c, "Incorrect email or password.");
  }

  const protectionFailure = await protectEmailAuth(c, email, body.turnstileToken, "login");
  if (protectionFailure) return applyValidationFailure(c, protectionFailure);

  const user = await getUserByEmail(c.env, email);
  if (!user?.password_hash || !user?.password_salt) {
    return validationError(c, "Incorrect email or password.");
  }

  const valid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!valid) return validationError(c, "Incorrect email or password.");

  const sessionToken = randomToken(24);
  const sessionHash = await sha256(sessionToken);
  await createSession(c.env, user.id, sessionHash);
  setCookie(c, "ks2_session", sessionToken, cookieOptions(60 * 60 * 24 * 30, secureCookieForRequest(c)));
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  return json(c, 200, bootstrapPayload(bundle, c.env));
});

app.post("/api/auth/logout", requireSession, async (c) => {
  await deleteSessionByHash(c.env, c.get("sessionHash"));
  deleteCookie(c, "ks2_session", cookieOptions(0, secureCookieForRequest(c)));
  return json(c, 200, { ok: true });
});

async function startOAuthAttempt(c, provider) {
  const attempt = await beginOAuthFlow(c.env, provider, appOrigin(c));
  setOauthAttempt(c, provider, attempt);
  return attempt;
}

// The browser now always starts social sign-in with a POST that carries a
// Turnstile token. Keeping the legacy GET variant around meant bookmarks and
// external `<a href="/api/auth/google/start">` links would 400 the moment
// Turnstile was turned on, because `protectOAuthStart` was called with an
// empty token. Return 405 so callers discover the change fast instead of
// getting a confusing auth-error redirect loop.
app.get("/api/auth/:provider/start", (c) => {
  c.header("Allow", "POST");
  return json(c, 405, {
    ok: false,
    message: "Start social sign-in from the web app (POST /api/auth/:provider/start).",
  });
});

app.post("/api/auth/:provider/start", async (c) => {
  const provider = String(c.req.param("provider") || "").trim().toLowerCase();
  const body = await c.req.json().catch(() => ({}));
  const protectionFailure = await protectOAuthStart(c, provider, body.turnstileToken);
  if (protectionFailure) return applyValidationFailure(c, protectionFailure);

  try {
    const attempt = await startOAuthAttempt(c, provider);
    return json(c, 200, {
      ok: true,
      redirectUrl: attempt.url,
    });
  } catch (error) {
    return validationError(c, error.message || "Could not start sign-in.");
  }
});

async function completeProviderLogin(c, payload) {
  const provider = String(c.req.param("provider") || "").trim().toLowerCase();
  const callbackPayload = normaliseCallbackPayload(payload);

  if (callbackPayload.error) {
    return redirectWithAuthError(c, callbackPayload.error_description || callbackPayload.error);
  }

  const state = getCookie(c, OAUTH_STATE_COOKIE);
  const expectedProvider = getCookie(c, OAUTH_PROVIDER_COOKIE);
  const codeVerifier = getCookie(c, OAUTH_VERIFIER_COOKIE);
  const nonce = getCookie(c, OAUTH_NONCE_COOKIE);

  if (!state || !expectedProvider || expectedProvider !== provider) {
    return redirectWithAuthError(c, "Sign-in session expired. Please try again.");
  }

  if (!callbackPayload.state || callbackPayload.state !== state) {
    return redirectWithAuthError(c, "Sign-in could not be verified. Please try again.");
  }

  if (!callbackPayload.code) {
    return redirectWithAuthError(c, "The provider did not return an authorisation code.");
  }

  try {
    const { profile } = await completeOAuthFlow(c.env, provider, appOrigin(c), {
      code: callbackPayload.code,
      codeVerifier,
      nonce,
      callbackPayload,
    });

    if (!profile?.subject) {
      return redirectWithAuthError(c, "The provider did not return a valid account identifier.");
    }

    const user = await findOrCreateUserFromIdentity(c.env, {
      provider,
      providerSubject: profile.subject,
      email: profile.emailVerified === false ? "" : profile.email,
    });

    const sessionToken = randomToken(24);
    const sessionHash = await sha256(sessionToken);
    await createSession(c.env, user.id, sessionHash);

    clearOauthAttempt(c);
    setCookie(c, "ks2_session", sessionToken, cookieOptions(60 * 60 * 24 * 30, secureCookieForRequest(c)));
    return c.redirect(appOrigin(c), 302);
  } catch (error) {
    console.error(`OAuth callback failed for ${provider}`, error);
    return redirectWithAuthError(c, error.message || "Could not complete sign-in.");
  }
}

app.get("/api/auth/:provider/callback", async (c) => {
  const url = new URL(c.req.url);
  return completeProviderLogin(c, Object.fromEntries(url.searchParams.entries()));
});

app.post("/api/auth/:provider/callback", async (c) => {
  const body = await c.req.parseBody().catch(() => ({}));
  return completeProviderLogin(c, body);
});

app.get("/api/children", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  return json(c, 200, {
    ok: true,
    children: bundle.children,
    selectedChild: bundle.selectedChild,
  });
});

app.post("/api/children", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  const payload = sanitiseChildPayload(await c.req.json().catch(() => ({})));
  if (payload.name.length < 2) return validationError(c, "Child name must be at least two characters.");
  const child = await createChild(c.env, bundle.user.id, payload);
  await setSelectedChild(c.env, bundle.session.id, child.id);
  const refreshedHash = c.get("sessionHash");
  const refreshedBundle = await getSessionBundleByHash(c.env, refreshedHash);
  return json(c, 201, bootstrapPayload(refreshedBundle, c.env));
});

app.put("/api/children/:childId", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  const payload = sanitiseChildPayload(await c.req.json().catch(() => ({})));
  if (payload.name.length < 2) return validationError(c, "Child name must be at least two characters.");
  const child = await updateChild(c.env, bundle.user.id, c.req.param("childId"), payload);
  if (!child) return json(c, 404, { ok: false, message: "Child profile not found." });
  const refreshedBundle = await getSessionBundleByHash(c.env, c.get("sessionHash"));
  return json(c, 200, bootstrapPayload(refreshedBundle, c.env));
});

app.post("/api/children/:childId/select", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  const child = await getChild(c.env, bundle.user.id, c.req.param("childId"));
  if (!child) return json(c, 404, { ok: false, message: "Child profile not found." });
  await setSelectedChild(c.env, bundle.session.id, child.id);
  const refreshedBundle = await getSessionBundleByHash(c.env, c.get("sessionHash"));
  return json(c, 200, bootstrapPayload(refreshedBundle, c.env));
});

app.put("/api/spelling/prefs", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const body = await c.req.json().catch(() => ({}));
  const nextState = savePrefs(bundle.childState, body);
  await saveChildState(c.env, bundle.selectedChild.id, nextState);
  const refreshedBundle = await getSessionBundleByHash(c.env, c.get("sessionHash"));
  return json(c, 200, bootstrapPayload(refreshedBundle, c.env));
});

app.post("/api/spelling/sessions", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const body = await c.req.json().catch(() => ({}));
  const mode = Object.values(SPELLING_MODES).includes(body.mode) ? body.mode : SPELLING_MODES.SMART;
  const words = Array.isArray(body.words) ? body.words.map((item) => String(item)) : null;
  const result = createSessionForChild(bundle.selectedChild.id, bundle.childState, {
    mode,
    yearFilter: body.yearFilter || "all",
    length: parseSessionLength(body.length, mode),
    words,
  });

  if (!result.ok) return validationError(c, result.reason);

  await saveChildState(c.env, bundle.selectedChild.id, result.childState);
  await saveSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, result.sessionState.id, result.sessionState);
  return json(c, 201, {
    ok: true,
    session: result.payload,
  });
});

app.post("/api/spelling/sessions/:sessionId/submit", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const sessionState = await getSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, c.req.param("sessionId"));
  if (!sessionState) return json(c, 404, { ok: false, message: "Spelling session not found." });
  const body = await c.req.json().catch(() => ({}));
  const submission = submitSession(bundle.selectedChild.id, bundle.childState, sessionState, body.typed);
  await saveChildState(c.env, bundle.selectedChild.id, submission.childState);
  await saveSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, sessionState.id, sessionState);
  return json(c, 200, {
    ok: true,
    result: submission.result,
    session: submission.payload,
    monsterEvent: submission.monsterEvent,
    monsters: buildBootstrapStats(bundle.selectedChild.id, submission.childState).monsters,
  });
});

app.post("/api/spelling/sessions/:sessionId/skip", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const sessionState = await getSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, c.req.param("sessionId"));
  if (!sessionState) return json(c, 404, { ok: false, message: "Spelling session not found." });
  const skipped = skipSession(bundle.selectedChild.id, bundle.childState, sessionState);
  await saveChildState(c.env, bundle.selectedChild.id, skipped.childState);
  await saveSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, sessionState.id, sessionState);
  return json(c, 200, {
    ok: true,
    result: skipped.result,
    session: skipped.payload,
  });
});

app.post("/api/spelling/sessions/:sessionId/advance", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const sessionState = await getSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, c.req.param("sessionId"));
  if (!sessionState) return json(c, 404, { ok: false, message: "Spelling session not found." });
  const advanced = advanceSession(bundle.selectedChild.id, bundle.childState, sessionState);
  await saveChildState(c.env, bundle.selectedChild.id, advanced.childState);

  if (advanced.done) {
    await deleteSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, c.req.param("sessionId"));
    return json(c, 200, {
      ok: true,
      done: true,
      summary: advanced.summary,
      monsters: buildBootstrapStats(bundle.selectedChild.id, advanced.childState).monsters,
      spelling: buildBootstrapStats(bundle.selectedChild.id, advanced.childState).spelling,
    });
  }

  await saveSpellingSession(c.env, bundle.user.id, bundle.selectedChild.id, sessionState.id, sessionState);
  return json(c, 200, {
    ok: true,
    done: false,
    session: advanced.payload,
  });
});

app.get("/api/spelling/dashboard", requireSession, async (c) => {
  const bundle = c.get("sessionBundle");
  if (!bundle.selectedChild) return validationError(c, "Create a child profile first.");
  const spelling = buildBootstrapStats(bundle.selectedChild.id, bundle.childState).spelling;
  return json(c, 200, {
    ok: true,
    spelling,
  });
});

app.get("/api/tts/voices", requireSession, async (c) => {
  const provider = String(c.req.query("provider") || "elevenlabs").trim().toLowerCase();
  if (provider !== "elevenlabs") {
    return validationError(c, "That voice catalogue is not supported.");
  }

  const throttle = await protectAuthenticatedTtsCall(c, "tts-voices-session", 20, 10 * 60 * 1000);
  if (throttle) return applyValidationFailure(c, throttle);

  try {
    const voices = await listElevenLabsVoices(c.env);
    return json(c, 200, {
      ok: true,
      voices,
    });
  } catch (error) {
    const status = Number(error?.statusCode);
    return json(c, status >= 400 && status < 500 ? status : 502, {
      ok: false,
      message: error.message || "Could not load the voice catalogue.",
    });
  }
});

app.post("/api/tts/speak", requireSession, async (c) => {
  // With provider keys now held server-side, every /api/tts/speak call costs
  // real money on Gemini/OpenAI/ElevenLabs. Cap speech generation per session
  // so one rogue or runaway client cannot drain the provider budget.
  const throttle = await protectAuthenticatedTtsCall(c, "tts-speak-session", 120, 10 * 60 * 1000);
  if (throttle) return applyValidationFailure(c, throttle);

  const body = await c.req.json().catch(() => ({}));
  try {
    const audio = await synthesiseSpeech(c.env, body);
    return new Response(audio.body, {
      status: 200,
      headers: {
        "Content-Type": audio.contentType,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode);
    return json(c, status >= 400 && status < 500 ? status : 502, {
      ok: false,
      message: error.message || "Could not generate speech.",
    });
  }
});

app.get("*", async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  return assetResponse;
});

export default app;
