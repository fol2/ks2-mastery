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
});
