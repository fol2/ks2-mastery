import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  createChild,
  createEmailUser,
  createSession,
  deleteSessionByHash,
  deleteSpellingSession,
  ensureSchema,
  getChild,
  getSessionBundleByHash,
  getSpellingSession,
  getUserByEmail,
  listChildren,
  saveChildState,
  saveSpellingSession,
  serialiseSubscription,
  setSelectedChild,
  updateChild,
} from "./lib/store.js";
import { cookieOptions, hashPassword, randomToken, safeEmail, sha256, verifyPassword } from "./lib/security.js";
import {
  SPELLING_MODES,
  advanceSession,
  buildBootstrapStats,
  createSessionForChild,
  savePrefs,
  skipSession,
  submitSession,
} from "./lib/spelling-service.js";

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

function providerConfig(env) {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID),
    facebook: Boolean(env.FACEBOOK_CLIENT_ID),
    instagram: Boolean(env.INSTAGRAM_CLIENT_ID),
    x: Boolean(env.X_CLIENT_ID),
    apple: Boolean(env.APPLE_CLIENT_ID),
    email: true,
  };
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
    },
    billing: serialiseSubscription(bundle.subscription),
    children: bundle.children,
    selectedChild,
    spelling: childStats.spelling,
    monsters: childStats.monsters,
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
  const rawToken = getCookie(c, "ks2_session");
  if (!rawToken) {
    return json(c, 200, {
      ok: true,
      auth: {
        signedIn: false,
        providers: providerConfig(c.env),
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
    });
  }

  const sessionHash = await sha256(rawToken);
  const bundle = await getSessionBundleByHash(c.env, sessionHash);
  if (!bundle) {
    deleteCookie(c, "ks2_session", cookieOptions(0, secureCookieForRequest(c)));
    return json(c, 200, {
      ok: true,
      auth: { signedIn: false, providers: providerConfig(c.env) },
      billing: { planCode: "free", status: "active", paywallEnabled: false },
      children: [],
      selectedChild: null,
      spelling: {
        stats: { all: null, y3_4: null, y5_6: null },
        prefs: { yearFilter: "all", roundLength: "20", showCloze: true, autoSpeak: true },
      },
      monsters: {},
    });
  }

  return json(c, 200, bootstrapPayload(bundle, c.env));
});

app.post("/api/auth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = safeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !email.includes("@")) return validationError(c, "Enter a valid email address.");
  if (password.length < 8) return validationError(c, "Password must be at least eight characters.");

  const existing = await getUserByEmail(c.env, email);
  if (existing) return validationError(c, "That email address is already registered.");

  const { salt, hash } = await hashPassword(password);
  const user = await createEmailUser(c.env, {
    email,
    passwordHash: hash,
    passwordSalt: salt,
  });

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
    length: Number.isFinite(Number(body.length)) ? Number(body.length) : (body.length === Infinity ? Infinity : 20),
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

app.get("*", async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  return assetResponse;
});

export default app;
