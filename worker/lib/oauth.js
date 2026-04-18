import { randomToken, safeEmail, safeJsonParse, sha256 } from "./security.js";

export const INSTAGRAM_PROFESSIONAL_ONLY_MESSAGE =
  "Instagram sign-in is limited to Instagram professional accounts, so it is not enabled for the public family login flow.";

function socialAuthEnabled(env) {
  return String(env.SOCIAL_LOGIN_WIRE_ENABLED || "true").toLowerCase() !== "false";
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(String(value)));
}

function base64UrlToJson(value) {
  const normalised = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4 || 4)) % 4);
  return safeJsonParse(atob(padded), {});
}

function pemToArrayBuffer(value) {
  const cleaned = String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function importApplePrivateKey(env) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.APPLE_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildAppleClientSecret(env) {
  const header = {
    alg: "ES256",
    kid: String(env.APPLE_KEY_ID || ""),
    typ: "JWT",
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: String(env.APPLE_TEAM_ID || ""),
    iat: issuedAt,
    exp: issuedAt + (60 * 5),
    aud: "https://appleid.apple.com",
    sub: String(env.APPLE_CLIENT_ID || ""),
  };
  const signingInput = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(JSON.stringify(payload))}`;
  const key = await importApplePrivateKey(env);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  const payload = safeJsonParse(text, null);
  if (!response.ok) {
    throw new Error(
      payload?.error_description
      || payload?.error?.message
      || payload?.message
      || text
      || fallbackMessage,
    );
  }
  return payload || {};
}

async function fetchBearerJson(url, accessToken, fallbackMessage) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  return readJsonResponse(response, fallbackMessage);
}

function appleClaims(idToken) {
  const segments = String(idToken || "").split(".");
  if (segments.length < 2) return {};
  return base64UrlToJson(segments[1]);
}

function providerDefinitions(env, origin) {
  const socialEnabled = socialAuthEnabled(env);
  return {
    google: {
      enabled: socialEnabled && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      clientId: String(env.GOOGLE_CLIENT_ID || ""),
      clientSecret: String(env.GOOGLE_CLIENT_SECRET || ""),
      authoriseUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      redirectUri: `${origin}/api/auth/google/callback`,
      scope: "openid email profile",
      usePkce: true,
      extraAuthParams: {
        access_type: "online",
        prompt: "select_account",
      },
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          "https://openidconnect.googleapis.com/v1/userinfo",
          tokenPayload.access_token,
          "Google did not return a profile.",
        );
        return {
          subject: String(profile.sub || "").trim(),
          email: safeEmail(profile.email),
          emailVerified: Boolean(profile.email_verified),
        };
      },
    },
    facebook: {
      enabled: socialEnabled && Boolean(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET),
      clientId: String(env.FACEBOOK_CLIENT_ID || ""),
      clientSecret: String(env.FACEBOOK_CLIENT_SECRET || ""),
      authoriseUrl: "https://www.facebook.com/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/oauth/access_token",
      redirectUri: `${origin}/api/auth/facebook/callback`,
      scope: "public_profile,email",
      usePkce: false,
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          "https://graph.facebook.com/me?fields=id,name,email",
          tokenPayload.access_token,
          "Facebook did not return a profile.",
        );
        return {
          subject: String(profile.id || "").trim(),
          email: safeEmail(profile.email),
          emailVerified: Boolean(profile.email),
        };
      },
    },
    instagram: {
      enabled: false,
      disabledMessage: INSTAGRAM_PROFESSIONAL_ONLY_MESSAGE,
    },
    x: {
      enabled: socialEnabled && Boolean(env.X_CLIENT_ID),
      clientId: String(env.X_CLIENT_ID || ""),
      clientSecret: "",
      authoriseUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      redirectUri: `${origin}/api/auth/x/callback`,
      scope: "tweet.read users.read",
      usePkce: true,
      async fetchProfile(tokenPayload) {
        const profile = await fetchBearerJson(
          "https://api.x.com/2/users/me?user.fields=name,username",
          tokenPayload.access_token,
          "X did not return a profile.",
        );
        const user = profile?.data || {};
        return {
          subject: String(user.id || "").trim(),
          email: "",
          emailVerified: false,
        };
      },
    },
    apple: {
      enabled: socialEnabled && Boolean(
        env.APPLE_CLIENT_ID
        && env.APPLE_TEAM_ID
        && env.APPLE_KEY_ID
        && env.APPLE_PRIVATE_KEY,
      ),
      clientId: String(env.APPLE_CLIENT_ID || ""),
      clientSecret: "",
      authoriseUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      redirectUri: `${origin}/api/auth/apple/callback`,
      scope: "name email",
      usePkce: false,
      useNonce: true,
      extraAuthParams: {
        response_mode: "query",
      },
      async buildClientSecret() {
        return buildAppleClientSecret(env);
      },
      async fetchProfile(tokenPayload, callbackPayload, expectedNonce) {
        const claims = appleClaims(tokenPayload.id_token);
        if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
          throw new Error("Apple sign-in did not return the expected nonce.");
        }
        const callbackUser = safeJsonParse(callbackPayload?.user, {});
        return {
          subject: String(claims.sub || "").trim(),
          email: safeEmail(claims.email || callbackUser?.email),
          emailVerified: String(claims.email_verified || "").toLowerCase() === "true" || claims.email_verified === true,
        };
      },
    },
  };
}

function configuredProvider(env, providerKey, origin) {
  const providers = providerDefinitions(env, origin);
  const provider = providers[String(providerKey || "").trim().toLowerCase()];
  if (!provider) throw new Error("That sign-in provider is not supported.");
  if (!socialAuthEnabled(env)) throw new Error("Social sign-in is currently disabled.");
  if (!provider.enabled) {
    throw new Error(provider.disabledMessage || "That sign-in provider is not configured yet.");
  }
  return provider;
}

async function exchangeCode(provider, env, code, redirectUri, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code || ""),
    client_id: provider.clientId,
    redirect_uri: redirectUri,
  });

  if (provider.clientSecret) {
    params.set("client_secret", provider.clientSecret);
  }

  if (provider.buildClientSecret) {
    params.set("client_secret", await provider.buildClientSecret(env));
  }

  if (provider.usePkce) {
    params.set("code_verifier", String(codeVerifier || ""));
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  return readJsonResponse(response, "The provider did not return an access token.");
}

export function providerConfig(env) {
  const socialEnabled = socialAuthEnabled(env);
  const providers = providerDefinitions(env, "https://example.com");
  return {
    google: socialEnabled && providers.google.enabled,
    facebook: socialEnabled && providers.facebook.enabled,
    instagram: false,
    x: socialEnabled && providers.x.enabled,
    apple: socialEnabled && providers.apple.enabled,
    email: true,
  };
}

export async function beginOAuthFlow(env, providerKey, origin) {
  const provider = configuredProvider(env, providerKey, origin);
  const state = randomToken(24);
  const codeVerifier = provider.usePkce ? randomToken(48) : "";
  const nonce = provider.useNonce ? randomToken(24) : "";

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: "code",
    state,
  });

  if (provider.scope) params.set("scope", provider.scope);
  if (provider.usePkce) {
    params.set("code_challenge", await sha256(codeVerifier));
    params.set("code_challenge_method", "S256");
  }
  if (provider.useNonce) params.set("nonce", nonce);

  Object.entries(provider.extraAuthParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return {
    state,
    codeVerifier,
    nonce,
    url: `${provider.authoriseUrl}?${params.toString()}`,
  };
}

export async function completeOAuthFlow(env, providerKey, origin, payload) {
  const provider = configuredProvider(env, providerKey, origin);
  const tokenPayload = await exchangeCode(
    provider,
    env,
    payload?.code,
    provider.redirectUri,
    payload?.codeVerifier,
  );
  const profile = await provider.fetchProfile(tokenPayload, payload?.callbackPayload || {}, payload?.nonce || "");
  return { provider, profile, tokenPayload };
}
