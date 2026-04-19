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

function randomEmail(prefix = "parent") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

async function signIn() {
  const response = await postJson("/api/auth/register", {
    email: randomEmail(),
    password: "test-password-1234",
  });
  return readSessionCookie(response);
}

function childPayload(name, overrides = {}) {
  return {
    name,
    yearGroup: "Y5",
    avatarColor: "#3E6FA8",
    goal: "sats",
    dailyMinutes: 15,
    weakSubjects: [],
    ...overrides,
  };
}

describe("POST /api/children", () => {
  it("requires a session", async () => {
    const response = await postJson("/api/children", childPayload("NoAuth"));
    expect(response.status).toBe(401);
  });

  it("creates the first child and selects it", async () => {
    const session = await signIn();
    const response = await postJson("/api/children", childPayload("Maya"), session);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.selectedChild?.name).toBe("Maya");
    expect(body.children).toHaveLength(1);
    expect(body.monsters.phaeton).toBeDefined();
  });

  it("rejects names under two characters", async () => {
    const session = await signIn();
    const response = await postJson("/api/children", childPayload("A"), session);
    expect(response.status).toBe(400);
  });

  it("caps each account at four children", async () => {
    const session = await signIn();
    for (let i = 1; i <= 4; i += 1) {
      const response = await postJson("/api/children", childPayload(`Kid ${i}`), session);
      expect(response.status).toBe(201);
    }
    const overflow = await postJson("/api/children", childPayload("Kid 5"), session);
    expect(overflow.status).toBe(500);
  });
});

describe("PUT /api/children/:id", () => {
  it("updates name + year_group for an owned child", async () => {
    const session = await signIn();
    const created = await postJson("/api/children", childPayload("Maya"), session);
    const createdBody = await created.json();
    const childId = createdBody.selectedChild.id;

    const response = await putJson(`/api/children/${childId}`, childPayload("Maya Hudson", { yearGroup: "Y6" }), session);
    expect(response.status).toBe(200);
    const body = await response.json();
    const updated = body.children.find((c) => c.id === childId);
    expect(updated.name).toBe("Maya Hudson");
    expect(updated.yearGroup).toBe("Y6");
  });

  it("returns 404 when the child does not belong to the current user", async () => {
    const sessionA = await signIn();
    const sessionB = await signIn();
    const created = await postJson("/api/children", childPayload("Foreign"), sessionA);
    const { selectedChild } = await created.json();

    const response = await putJson(`/api/children/${selectedChild.id}`, childPayload("Hacker"), sessionB);
    expect(response.status).toBe(404);
  });
});

describe("POST /api/children/:id/select", () => {
  it("switches the active child on the session", async () => {
    const session = await signIn();
    const first = await postJson("/api/children", childPayload("First"), session);
    const firstBody = await first.json();
    const firstId = firstBody.selectedChild.id;

    const second = await postJson("/api/children", childPayload("Second"), session);
    const secondBody = await second.json();
    const secondId = secondBody.selectedChild.id;
    expect(secondId).not.toBe(firstId);

    const switched = await postJson(`/api/children/${firstId}/select`, {}, session);
    expect(switched.status).toBe(200);
    const body = await switched.json();
    expect(body.selectedChild.id).toBe(firstId);
  });

  it("returns 404 for an unknown child id", async () => {
    const session = await signIn();
    const response = await postJson("/api/children/ghost-id/select", {}, session);
    expect(response.status).toBe(404);
  });
});

describe("GET /api/children", () => {
  it("lists the parent's children with the selected one marked", async () => {
    const session = await signIn();
    await postJson("/api/children", childPayload("Ada"), session);
    await postJson("/api/children", childPayload("Ben"), session);

    const response = await getJson("/api/children", session);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.children).toHaveLength(2);
    expect(body.selectedChild?.name).toBe("Ben");
  });
});
