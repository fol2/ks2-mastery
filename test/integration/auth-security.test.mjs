import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../../worker/index.js";

const BASE = "https://app.test";
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

function requestEnv(overrides = {}) {
  return { ...env, ...overrides };
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body || {}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth protection", () => {
  it("requires Turnstile for register when enabled", async () => {
    const response = await app.fetch(jsonRequest("/api/auth/register", {
      email: "guarded@example.test",
      password: "long-enough-password",
    }), requestEnv({
      TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY,
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.message).toMatch(/security check/i);
  });

  it("accepts register after a successful Turnstile verification", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      "error-codes": [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const response = await app.fetch(jsonRequest("/api/auth/register", {
      email: "human@example.test",
      password: "long-enough-password",
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    }), requestEnv({
      TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY,
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.auth.signedIn).toBe(true);
  });

  it("rate limits repeated login attempts from the same IP", async () => {
    const ipHeaders = { "CF-Connecting-IP": "198.51.100.24" };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.fetch(jsonRequest("/api/auth/login", {
        email: "missing@example.test",
        password: "wrong-password",
      }, ipHeaders), requestEnv());
      expect(response.status).toBe(400);
    }

    const limited = await app.fetch(jsonRequest("/api/auth/login", {
      email: "missing@example.test",
      password: "wrong-password",
    }, ipHeaders), requestEnv());

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    const payload = await limited.json();
    expect(payload.message).toMatch(/too many sign-in attempts/i);
  });

  it("requires Turnstile for social sign-in start when enabled", async () => {
    const response = await app.fetch(jsonRequest("/api/auth/google/start", {}, {
      "CF-Connecting-IP": "198.51.100.88",
    }), requestEnv({
      TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET_KEY,
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.message).toMatch(/security check/i);
  });
});
