const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 8000;

async function tokenIdempotencyKey(token) {
  // Derive the idempotency key from the Turnstile token so Cloudflare can
  // safely retry verifications that failed mid-flight. A random UUID would
  // trigger `timeout-or-duplicate` on any retry of the same token.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  const bytes = new Uint8Array(digest).slice(0, 16);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function turnstileSiteKey(env) {
  return String(env.TURNSTILE_SITE_KEY || env.TURNSTILE_SITEKEY || "").trim();
}

function turnstileSecret(env) {
  return String(env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET || "").trim();
}

function enabled(env) {
  return Boolean(turnstileSiteKey(env) && turnstileSecret(env));
}

function errorMessage(errorCodes) {
  const codes = Array.isArray(errorCodes) ? errorCodes.map((code) => String(code || "").trim().toLowerCase()) : [];
  if (codes.some((code) => code === "timeout-or-duplicate")) {
    return "The security check expired. Please try again.";
  }
  if (codes.some((code) => code.startsWith("missing-input") || code.startsWith("invalid-input"))) {
    return "Complete the security check and try again.";
  }
  return "The security check could not be verified. Please try again.";
}

export function turnstileConfig(env) {
  const isEnabled = enabled(env);
  return {
    enabled: isEnabled,
    siteKey: isEnabled ? turnstileSiteKey(env) : "",
  };
}

export async function verifyTurnstileToken(env, options = {}) {
  if (!enabled(env)) {
    return {
      enabled: false,
      success: true,
      payload: null,
    };
  }

  const token = String(options.token || "").trim();
  if (!token) {
    return {
      enabled: true,
      success: false,
      message: "Complete the security check and try again.",
      payload: null,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        secret: turnstileSecret(env),
        response: token,
        remoteip: options.remoteIp || undefined,
        idempotency_key: await tokenIdempotencyKey(token),
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({
      success: false,
      "error-codes": ["invalid-json"],
    }));

    if (!response.ok) {
      return {
        enabled: true,
        success: false,
        message: "The security check is temporarily unavailable. Please try again.",
        payload,
      };
    }

    if (!payload?.success) {
      return {
        enabled: true,
        success: false,
        message: errorMessage(payload?.["error-codes"]),
        payload,
      };
    }

    return {
      enabled: true,
      success: true,
      payload,
    };
  } catch (error) {
    return {
      enabled: true,
      success: false,
      message: "The security check is temporarily unavailable. Please try again.",
      payload: null,
      error,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
