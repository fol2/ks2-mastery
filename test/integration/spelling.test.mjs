import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Shared helpers inlined - see auth.test.mjs for rationale.
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

function putJson(path, body, session) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...cookieHeader(session) },
    body: JSON.stringify(body || {}),
  });
}

function getJson(path, session) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "GET",
    headers: cookieHeader(session),
  });
}

function randomEmail(prefix = "spell") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

async function makeSignedInUserWithChild() {
  const register = await postJson("/api/auth/register", {
    email: randomEmail(),
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

describe("POST /api/spelling/sessions", () => {
  it("requires a selected child", async () => {
    const register = await postJson("/api/auth/register", {
      email: randomEmail("nochild"),
      password: "test-password-1234",
    });
    const session = readSessionCookie(register);

    const response = await postJson("/api/spelling/sessions", { mode: "smart" }, session);
    expect(response.status).toBe(400);
  });

  it("starts a smart session that returns a valid first card", async () => {
    const session = await makeSignedInUserWithChild();
    const response = await postJson("/api/spelling/sessions", { mode: "smart", length: 5 }, session);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.session.id).toBeTruthy();
    expect(body.session.currentCard?.word?.word).toMatch(/[a-z]+/);
    expect(body.session.progress.total).toBeGreaterThan(0);
  });

  it("accepts the 'all' length sentinel (round length = entire bank)", async () => {
    const session = await makeSignedInUserWithChild();
    const response = await postJson("/api/spelling/sessions", { mode: "smart", length: "all" }, session);
    expect(response.status).toBe(201);
    const body = await response.json();
    // Smart mode picks from available words; total should be substantial.
    expect(body.session.progress.total).toBeGreaterThan(20);
  });

  it("defaults to 20 words for a 'test' mode session", async () => {
    const session = await makeSignedInUserWithChild();
    const response = await postJson("/api/spelling/sessions", { mode: "test" }, session);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.session.progress.total).toBeLessThanOrEqual(20);
  });
});

describe("spelling session lifecycle", () => {
  it("recognises a correct submit, advances to a new card, and can skip", async () => {
    const session = await makeSignedInUserWithChild();
    const start = await postJson("/api/spelling/sessions", { mode: "smart", length: 3 }, session);
    const startBody = await start.json();
    const sessionId = startBody.session.id;
    const firstWord = startBody.session.currentCard.word.word;

    const submit = await postJson(
      `/api/spelling/sessions/${sessionId}/submit`,
      { typed: firstWord },
      session,
    );
    expect(submit.status).toBe(200);
    const submitBody = await submit.json();
    // A correct submit moves forward; the legacy engine emits 'success' on final
    // recall and 'info' during phase transitions. Both are non-error.
    expect(submitBody.result.feedback?.kind).not.toBe("error");
    expect(["success", "info"]).toContain(submitBody.result.feedback?.kind);

    // Server moved the card to "next"; calling advance should hand us a new card (or done).
    const advance = await postJson(
      `/api/spelling/sessions/${sessionId}/advance`,
      {},
      session,
    );
    expect(advance.status).toBe(200);
    const advanceBody = await advance.json();
    expect(advanceBody.ok).toBe(true);
    // Either a fresh card appears, or the session is complete.
    if (advanceBody.done) {
      expect(advanceBody.summary).toBeDefined();
    } else {
      expect(advanceBody.session.currentCard?.word?.word).toBeTruthy();
    }
  });

  it("treats a wrong submit as feedback-error without advancing", async () => {
    const session = await makeSignedInUserWithChild();
    const start = await postJson("/api/spelling/sessions", { mode: "smart", length: 3 }, session);
    const startBody = await start.json();
    const sessionId = startBody.session.id;

    const submit = await postJson(
      `/api/spelling/sessions/${sessionId}/submit`,
      { typed: "definitelywrongspelling" },
      session,
    );
    expect(submit.status).toBe(200);
    const submitBody = await submit.json();
    expect(["retry", "correction"]).toContain(submitBody.result.phase);
  });

  it("can skip the current learning card", async () => {
    const session = await makeSignedInUserWithChild();
    const start = await postJson("/api/spelling/sessions", { mode: "smart", length: 3 }, session);
    const startBody = await start.json();
    const sessionId = startBody.session.id;

    const skip = await postJson(`/api/spelling/sessions/${sessionId}/skip`, {}, session);
    expect(skip.status).toBe(200);
  });

  it("returns 404 for unknown session ids", async () => {
    const session = await makeSignedInUserWithChild();
    const submit = await postJson(
      "/api/spelling/sessions/does-not-exist/submit",
      { typed: "x" },
      session,
    );
    expect(submit.status).toBe(404);
  });
});

describe("PUT /api/spelling/prefs", () => {
  it("persists pref changes and reflects them in bootstrap", async () => {
    const session = await makeSignedInUserWithChild();

    const response = await putJson(
      "/api/spelling/prefs",
      { yearFilter: "y5-6", roundLength: "40", showCloze: false, autoSpeak: false },
      session,
    );
    expect(response.status).toBe(200);

    const boot = await getJson("/api/bootstrap", session);
    const body = await boot.json();
    expect(body.spelling.prefs).toEqual({
      yearFilter: "y5-6",
      roundLength: "40",
      showCloze: false,
      autoSpeak: false,
    });
  });

  it("requires a child profile first", async () => {
    const register = await postJson("/api/auth/register", {
      email: randomEmail("nokid"),
      password: "test-password-1234",
    });
    const session = readSessionCookie(register);

    const response = await putJson(
      "/api/spelling/prefs",
      { yearFilter: "y5-6" },
      session,
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/spelling/dashboard", () => {
  it("returns stats with the shape the dashboard expects", async () => {
    const session = await makeSignedInUserWithChild();
    const response = await getJson("/api/spelling/dashboard", session);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.spelling.stats).toHaveProperty("all");
    expect(body.spelling.stats).toHaveProperty("y3_4");
    expect(body.spelling.stats).toHaveProperty("y5_6");
    expect(body.spelling.prefs).toHaveProperty("yearFilter");
  });
});
