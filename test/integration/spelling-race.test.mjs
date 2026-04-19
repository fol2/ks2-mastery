import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Inline helpers — see auth.test.mjs for rationale. vitest-pool-workers 0.14.x
// will not bundle imported test helpers into the Worker.
const BASE = "https://app.test";

function cookieHeader(session) {
  return session ? { Cookie: session.header } : {};
}

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? { ks2_session: match[1], header: `ks2_session=${match[1]}` } : null;
}

function postJson(path, body, session) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(session) },
    body: JSON.stringify(body || {}),
  });
}

async function makeSignedInUserWithChild() {
  const register = await postJson("/api/auth/register", {
    email: `race-${Math.random().toString(36).slice(2, 10)}@example.test`,
    password: "test-password-1234",
  });
  const session = readSessionCookie(register);
  await postJson("/api/children", {
    name: "Tester",
    yearGroup: "Y5",
    avatarColor: "#3E6FA8",
    goal: "sats",
    dailyMinutes: 15,
    weakSubjects: [],
  }, session);
  return session;
}

describe("spelling mutation serialisation", () => {
  it("does not double-count a mastery event when two submits race", async () => {
    const session = await makeSignedInUserWithChild();

    const start = await postJson("/api/spelling/sessions", { mode: "smart", length: 5 }, session);
    expect(start.status).toBe(201);
    const startBody = await start.json();
    const sessionId = startBody.session.id;
    const word = startBody.session.currentCard?.word?.word;
    expect(word).toBeTruthy();

    const concurrent = await Promise.all([
      postJson(`/api/spelling/sessions/${sessionId}/submit`, { typed: word }, session),
      postJson(`/api/spelling/sessions/${sessionId}/submit`, { typed: word }, session),
      postJson(`/api/spelling/sessions/${sessionId}/submit`, { typed: word }, session),
    ]);

    for (const response of concurrent) {
      expect([200, 400]).toContain(response.status);
      const body = await response.clone().json();
      expect(typeof body).toBe("object");
    }

    const bootstrap = await SELF.fetch(`${BASE}/api/bootstrap`, { headers: cookieHeader(session) });
    expect(bootstrap.status).toBe(200);
    const bootstrapBody = await bootstrap.json();
    const monsters = bootstrapBody.monsters || {};
    for (const entry of Object.values(monsters)) {
      const mastered = Array.isArray(entry?.masteredList) ? entry.masteredList : [];
      const unique = new Set(mastered);
      expect(unique.size).toBe(mastered.length);
    }
  });

  it("does not lose a preference write to a concurrent submit", async () => {
    const session = await makeSignedInUserWithChild();
    const start = await postJson("/api/spelling/sessions", { mode: "smart", length: 5 }, session);
    const startBody = await start.json();
    const sessionId = startBody.session.id;

    const [prefsResponse, submitResponse] = await Promise.all([
      SELF.fetch(`${BASE}/api/spelling/prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...cookieHeader(session) },
        body: JSON.stringify({ yearFilter: "y5-6", roundLength: "40", showCloze: false, autoSpeak: false }),
      }),
      postJson(`/api/spelling/sessions/${sessionId}/submit`, { typed: "obviously-wrong" }, session),
    ]);

    expect([200, 400]).toContain(prefsResponse.status);
    expect([200, 400]).toContain(submitResponse.status);

    const bootstrap = await SELF.fetch(`${BASE}/api/bootstrap`, { headers: cookieHeader(session) });
    const bootstrapBody = await bootstrap.json();
    expect(bootstrapBody.spelling.prefs.yearFilter).toBe("y5-6");
    expect(bootstrapBody.spelling.prefs.roundLength).toBe("40");
    expect(bootstrapBody.spelling.prefs.showCloze).toBe(false);
    expect(bootstrapBody.spelling.prefs.autoSpeak).toBe(false);
  });
});
