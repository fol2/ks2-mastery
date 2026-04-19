const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 8000;

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
        idempotency_key: crypto.randomUUID(),
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
