import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../../worker/index.js";

const BASE = "https://app.test";

function requestEnv(overrides = {}) {
  return { ...env, ...overrides };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? { ks2_session: match[1], header: `ks2_session=${match[1]}` } : null;
}

function jsonRequest(path, body, session) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Cookie: session.header } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server-side TTS proxy", () => {
  it("rejects unauthenticated speech requests", async () => {
    const response = await app.fetch(jsonRequest("/api/tts/speak", {
      provider: "openai",
      word: "accident",
    }), requestEnv());

    expect(response.status).toBe(401);
  });

  it("proxies OpenAI speech through the Worker with server-side secrets", async () => {
    const testEnv = requestEnv({
      OPENAI_TTS_API_KEY: "openai-test-key",
    });

    const register = await app.fetch(jsonRequest("/api/auth/register", {
      email: `tts-${Math.random().toString(36).slice(2, 10)}@example.test`,
      password: "tts-password-123",
    }), testEnv);
    const session = readSessionCookie(register);
    expect(session?.ks2_session).toBeTruthy();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
    }));

    const response = await app.fetch(jsonRequest("/api/tts/speak", {
      provider: "openai",
      word: "accident",
      sentence: "Spell accident in your neatest handwriting.",
      voice: "alloy",
    }, session), testEnv);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/audio\/mpeg/i);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4]);
  });

  it("throttles a runaway session that burns through provider credits", async () => {
    const testEnv = requestEnv({
      OPENAI_TTS_API_KEY: "openai-test-key",
    });

    const register = await app.fetch(jsonRequest("/api/auth/register", {
      email: `throttle-${Math.random().toString(36).slice(2, 10)}@example.test`,
      password: "tts-password-123",
    }), testEnv);
    const session = readSessionCookie(register);
    expect(session?.ks2_session).toBeTruthy();

    // `mockResolvedValue` would hand out the same Response instance — once
    // its body is read the second caller sees a disturbed stream and the
    // provider path surfaces a 502. Build a fresh response per call so the
    // test exercises the real success path and only trips on the session
    // limiter.
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    ));

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await app.fetch(jsonRequest("/api/tts/speak", {
        provider: "openai",
        word: `word${attempt}`,
        sentence: "Dictation sentence.",
        voice: "alloy",
      }, session), testEnv);
      expect(response.status).toBe(200);
    }

    const throttled = await app.fetch(jsonRequest("/api/tts/speak", {
      provider: "openai",
      word: "trip",
      sentence: "This one should be throttled.",
      voice: "alloy",
    }, session), testEnv);

    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
    const payload = await throttled.json();
    expect(payload.message).toMatch(/generating speech too quickly/i);
  });
});

