import { Hono } from "hono";
import {
  buildLogoutResponse,
  normaliseAuthProvider,
  normaliseOAuthCallbackPayload,
  parseCredentialsPayload,
  parseOAuthStartPayload,
} from "../contracts/auth-contract.js";
import { appOrigin, clientIp, json, readFormBody, readJsonBody } from "../lib/http.js";
import { logError, setLogContext } from "../lib/observability.js";
import {
  clearOauthAttempt,
  readOauthAttempt,
  redirectWithAuthError,
  setOauthAttempt,
} from "../lib/oauth-attempt.js";
import { clearSessionToken, setSessionToken } from "../lib/session-cookie.js";
import { requireSession } from "../middleware/require-session.js";
import {
  completeSocialLogin,
  loginWithEmail,
  logoutSession,
  registerWithEmail,
  startSocialLogin,
} from "../services/auth-service.js";

const authRoutes = new Hono();

async function completeProviderLogin(c, rawPayload) {
  const provider = normaliseAuthProvider(c.req.param("provider"));
  const callbackPayload = normaliseOAuthCallbackPayload(rawPayload);

  if (callbackPayload.error) {
    return redirectWithAuthError(c, callbackPayload.error_description || callbackPayload.error);
  }

  const oauthAttempt = readOauthAttempt(c);
  if (!oauthAttempt.state || !oauthAttempt.provider || oauthAttempt.provider !== provider) {
    return redirectWithAuthError(c, "Sign-in session expired. Please try again.");
  }

  if (!callbackPayload.state || callbackPayload.state !== oauthAttempt.state) {
    return redirectWithAuthError(c, "Sign-in could not be verified. Please try again.");
  }

  if (!callbackPayload.code) {
    return redirectWithAuthError(c, "The provider did not return an authorisation code.");
  }

  try {
    const authenticated = await completeSocialLogin(c.env, provider, appOrigin(c), {
      code: callbackPayload.code,
      codeVerifier: oauthAttempt.codeVerifier,
      nonce: oauthAttempt.nonce,
      callbackPayload,
    });

    clearOauthAttempt(c);
    setSessionToken(c, authenticated.sessionToken);
    setLogContext(c, {
      userId: authenticated.bundle.user.id,
      sessionId: authenticated.bundle.session.id,
      selectedChildId: authenticated.bundle.selectedChild?.id,
    });
    return c.redirect(appOrigin(c), 302);
  } catch (error) {
    logError(c, "auth.oauth.callback.failed", error, { provider });
    return redirectWithAuthError(c, error.message || "Could not complete sign-in.");
  }
}

authRoutes.post("/auth/register", async (c) => {
  const credentials = parseCredentialsPayload(await readJsonBody(c));
  const authenticated = await registerWithEmail(c.env, credentials, {
    ip: clientIp(c),
  });
  setSessionToken(c, authenticated.sessionToken);
  setLogContext(c, {
    userId: authenticated.bundle.user.id,
    sessionId: authenticated.bundle.session.id,
    selectedChildId: authenticated.bundle.selectedChild?.id,
  });
  return json(c, 201, authenticated.payload);
});

authRoutes.post("/auth/login", async (c) => {
  const credentials = parseCredentialsPayload(await readJsonBody(c));
  const authenticated = await loginWithEmail(c.env, credentials, {
    ip: clientIp(c),
  });
  setSessionToken(c, authenticated.sessionToken);
  setLogContext(c, {
    userId: authenticated.bundle.user.id,
    sessionId: authenticated.bundle.session.id,
    selectedChildId: authenticated.bundle.selectedChild?.id,
  });
  return json(c, 200, authenticated.payload);
});

authRoutes.post("/auth/logout", requireSession, async (c) => {
  await logoutSession(c.env, c.get("sessionHash"));
  clearSessionToken(c);
  return json(c, 200, buildLogoutResponse());
});

authRoutes.get("/auth/:provider/start", (c) => {
  c.header("Allow", "POST");
  return json(c, 405, {
    ok: false,
    message: "Start social sign-in from the web app (POST /api/auth/:provider/start).",
  });
});

authRoutes.post("/auth/:provider/start", async (c) => {
  const provider = normaliseAuthProvider(c.req.param("provider"));
  const payload = parseOAuthStartPayload(await readJsonBody(c));
  const attempt = await startSocialLogin(c.env, provider, appOrigin(c), {
    ip: clientIp(c),
    turnstileToken: payload.turnstileToken,
  });
  setOauthAttempt(c, provider, attempt);
  return json(c, 200, {
    ok: true,
    redirectUrl: attempt.url,
  });
});

authRoutes.get("/auth/:provider/callback", async (c) => {
  const url = new URL(c.req.url);
  return completeProviderLogin(c, Object.fromEntries(url.searchParams.entries()));
});

authRoutes.post("/auth/:provider/callback", async (c) => {
  return completeProviderLogin(c, await readFormBody(c));
});

export default authRoutes;
