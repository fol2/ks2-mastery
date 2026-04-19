import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Shared helpers inlined — vitest-pool-workers 0.14.x does not bundle non-entry
// helper modules into the Worker runtime. Copy across integration files.
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

function getJson(path, session) {
  return SELF.fetch(`${BASE}${path}`, {
    method: "GET",
    headers: cookieHeader(session),
  });
}

function randomEmail(prefix = "user") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

async function registerAndLogin(email, password = "test-password-1234") {
  const response = await postJson("/api/auth/register", { email, password });
  const session = readSessionCookie(response);
  const payload = await response.json();
  return { response, session, payload };
}

describe("POST /api/auth/register", () => {
  it("creates an account, returns 201 and sets the session cookie", async () => {
    const email = randomEmail("reg");
    const response = await postJson("/api/auth/register", { email, password: "hunter22!!" });
    expect(response.status).toBe(201);
    const session = readSessionCookie(response);
    expect(session?.ks2_session).toBeTruthy();

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.auth.signedIn).toBe(true);
    expect(body.auth.user.email).toBe(email);
  });

  it("rejects a missing or malformed email", async () => {
    const response = await postJson("/api/auth/register", { email: "notanemail", password: "longenoughpass" });
    expect(response.status).toBe(400);
  });

  it("rejects a short password", async () => {
    const email = randomEmail("short");
    const response = await postJson("/api/auth/register", { email, password: "short" });
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate email", async () => {
    const email = randomEmail("dup");
    await postJson("/api/auth/register", { email, password: "firstpass1" });
    const response = await postJson("/api/auth/register", { email, password: "secondpass" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/already registered/i);
  });

  it("returns 400 (not 500) on a concurrent duplicate-email race", async () => {
    const email = randomEmail("race");
    const [a, b] = await Promise.all([
      postJson("/api/auth/register", { email, password: "racerace1" }),
      postJson("/api/auth/register", { email, password: "racerace1" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
  });
});

describe("POST /api/auth/login", () => {
  it("authenticates a registered user with the correct password", async () => {
    const email = randomEmail("login");
    await postJson("/api/auth/register", { email, password: "mypassword-1" });

    const response = await postJson("/api/auth/login", { email, password: "mypassword-1" });
    expect(response.status).toBe(200);
    const session = readSessionCookie(response);
    expect(session?.ks2_session).toBeTruthy();
  });

  it("rejects a wrong password with 400", async () => {
    const email = randomEmail("wrong");
    await postJson("/api/auth/register", { email, password: "original-one" });

    const response = await postJson("/api/auth/login", { email, password: "wrong-one" });
    expect(response.status).toBe(400);
  });

  it("rejects an unknown email with the same 400 message (no user enumeration)", async () => {
    const response = await postJson("/api/auth/login", {
      email: randomEmail("missing"),
      password: "anything-long-enough",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/incorrect email or password/i);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and invalidates the session", async () => {
    const { session } = await registerAndLogin(randomEmail("logout"));
    const response = await postJson("/api/auth/logout", {}, session);
    expect(response.status).toBe(200);

    const after = await getJson("/api/bootstrap", session);
    const payload = await after.json();
    expect(payload.auth.signedIn).toBe(false);
  });

  it("requires an active session", async () => {
    const response = await postJson("/api/auth/logout", {});
    expect(response.status).toBe(401);
  });
});

describe("GET /api/bootstrap", () => {
  it("returns a signed-out payload when no cookie is present", async () => {
    const response = await getJson("/api/bootstrap");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.auth.signedIn).toBe(false);
    expect(payload.auth.providers.email).toBe(true);
    expect(payload.children).toEqual([]);
    expect(payload.selectedChild).toBeNull();
  });

  it("returns a signed-in payload; monsters are empty until a child profile exists", async () => {
    const { session, payload } = await registerAndLogin(randomEmail("boot"));
    expect(payload.auth.signedIn).toBe(true);
    expect(payload.children).toEqual([]);
    expect(payload.selectedChild).toBeNull();
    // No child yet -> no monster state to derive, payload.monsters is empty.
    expect(payload.monsters).toEqual({});

    // After creating a child, the three monsters (incl. Phaeton aggregate) appear.
    const createResponse = await postJson("/api/children", {
      name: "Maya",
      yearGroup: "Y5",
      avatarColor: "#3E6FA8",
      goal: "sats",
      dailyMinutes: 15,
      weakSubjects: [],
    }, session);
    expect(createResponse.status).toBe(201);

    const boot = await getJson("/api/bootstrap", session);
    const bootPayload = await boot.json();
    expect(Object.keys(bootPayload.monsters).sort()).toEqual([
      "glimmerbug", "inklet", "phaeton",
    ]);
    expect(bootPayload.monsters.phaeton.caught).toBe(false);
  });

  it("falls back to signed-out and clears the cookie when the session is unknown", async () => {
    const fakeSession = { ks2_session: "spoof", header: "ks2_session=spoof" };
    const response = await getJson("/api/bootstrap", fakeSession);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.auth.signedIn).toBe(false);

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/ks2_session=;/);
  });
});

describe("OAuth start routes", () => {
  it("redirects with an error when the provider has no secrets wired up", async () => {
    const response = await SELF.fetch("https://app.test/api/auth/google/start", {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = response.headers.get("location") || "";
    expect(location).toMatch(/authError=/);
  });

  it("redirects with an error for an unknown provider", async () => {
    const response = await SELF.fetch("https://app.test/api/auth/myspace/start", {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = response.headers.get("location") || "";
    expect(location).toMatch(/authError=/);
  });
});
