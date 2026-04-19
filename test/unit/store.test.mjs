import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  createChild,
  createEmailUser,
  createSession,
  deleteSessionByHash,
  findOrCreateUserFromIdentity,
  getChild,
  getChildState,
  getSessionBundleByHash,
  getUserByEmail,
  getUserById,
  linkIdentityToUser,
  saveChildState,
  setSelectedChild,
} from "../../worker/lib/store.js";
import { randomToken, sha256 } from "../../worker/lib/security.js";

function unique(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

async function createTestUser(suffix = "") {
  const email = `${unique("user-")}${suffix}@example.com`;
  const user = await createEmailUser(env, {
    email,
    passwordHash: "hash",
    passwordSalt: "salt",
  });
  return { user, email };
}

describe("users + email identity", () => {
  it("creates a user and fetches it back via email + id", async () => {
    const { user, email } = await createTestUser();
    expect(typeof user.id).toBe("string");
    expect(user.email).toBe(email);

    const byEmail = await getUserByEmail(env, email);
    expect(byEmail?.id).toBe(user.id);

    const byId = await getUserById(env, user.id);
    expect(byId?.email).toBe(email);
  });

  it("enforces UNIQUE(email) at the database layer", async () => {
    const { email } = await createTestUser();
    await expect(
      createEmailUser(env, { email, passwordHash: "h2", passwordSalt: "s2" }),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe("findOrCreateUserFromIdentity", () => {
  it("creates a new social user with a placeholder email when the provider omits one", async () => {
    const subject = unique("sub-");
    const user = await findOrCreateUserFromIdentity(env, {
      provider: "x",
      providerSubject: subject,
      email: "",
    });
    expect(user.email).toMatch(/@users\.ks2\.invalid$/);
  });

  it("returns the same user on repeat callback for the same (provider, subject)", async () => {
    const subject = unique("sub-");
    const email = `${subject}@example.com`;
    const first = await findOrCreateUserFromIdentity(env, {
      provider: "google",
      providerSubject: subject,
      email,
    });
    const second = await findOrCreateUserFromIdentity(env, {
      provider: "google",
      providerSubject: subject,
      email,
    });
    expect(second.id).toBe(first.id);
  });

  it("links a new provider identity to an existing email user", async () => {
    const { user, email } = await createTestUser("-link");
    const linked = await findOrCreateUserFromIdentity(env, {
      provider: "facebook",
      providerSubject: unique("fb-"),
      email,
    });
    expect(linked.id).toBe(user.id);
  });

  it("recovers from a concurrent create race (both callers resolve to the same user)", async () => {
    const subject = unique("race-");
    const email = `${subject}@example.com`;
    const results = await Promise.allSettled([
      findOrCreateUserFromIdentity(env, { provider: "google", providerSubject: subject, email }),
      findOrCreateUserFromIdentity(env, { provider: "google", providerSubject: subject, email }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected");
    if (rejected.length) {
      // Surfaces the actual error if recovery is incomplete.
      throw new Error(`${rejected.length} call(s) rejected: ${rejected.map((r) => String(r.reason)).join(" | ")}`);
    }
    const fulfilled = results.map((r) => r.value);
    expect(fulfilled.length).toBe(2);
    expect(new Set(fulfilled.map((u) => u.id)).size).toBe(1);
  });
});

describe("linkIdentityToUser placeholder email upgrade", () => {
  it("upgrades a placeholder email to the provider-returned one", async () => {
    const subject = unique("upg-");
    const placeholder = await findOrCreateUserFromIdentity(env, {
      provider: "x",
      providerSubject: subject,
      email: "",
    });
    expect(placeholder.email).toMatch(/@users\.ks2\.invalid$/);

    const realEmail = `${subject}-real@example.com`;
    await linkIdentityToUser(env, placeholder.id, {
      provider: "x",
      providerSubject: subject,
      email: realEmail,
    });

    const reloaded = await getUserById(env, placeholder.id);
    expect(reloaded.email).toBe(realEmail);
  });

  it("does not steal an email that already belongs to a different user", async () => {
    const { email: otherEmail } = await createTestUser("-owner");

    const subject = unique("nope-");
    const placeholder = await findOrCreateUserFromIdentity(env, {
      provider: "x",
      providerSubject: subject,
      email: "",
    });
    await linkIdentityToUser(env, placeholder.id, {
      provider: "x",
      providerSubject: subject,
      email: otherEmail,
    });

    const reloaded = await getUserById(env, placeholder.id);
    expect(reloaded.email).toMatch(/@users\.ks2\.invalid$/);
  });
});

describe("sessions", () => {
  it("round-trips a session via its sha256 hash", async () => {
    const { user } = await createTestUser("-sess");
    const token = randomToken(24);
    const hash = await sha256(token);
    await createSession(env, user.id, hash);

    const bundle = await getSessionBundleByHash(env, hash);
    expect(bundle?.user?.id).toBe(user.id);
  });

  it("returns null for an unknown session hash", async () => {
    expect(await getSessionBundleByHash(env, "unknown-hash-value")).toBeNull();
  });

  it("deletes a session by hash", async () => {
    const { user } = await createTestUser("-del");
    const hash = await sha256(randomToken(24));
    await createSession(env, user.id, hash);
    await deleteSessionByHash(env, hash);
    expect(await getSessionBundleByHash(env, hash)).toBeNull();
  });
});

describe("children", () => {
  const payload = (name) => ({
    name,
    yearGroup: "Y5",
    avatarColor: "#3E6FA8",
    goal: "sats",
    dailyMinutes: 15,
    weakSubjects: [],
  });

  it("caps each account at four child profiles", async () => {
    const { user } = await createTestUser("-kids");
    for (let i = 1; i <= 4; i += 1) {
      await createChild(env, user.id, payload(`Kid ${i}`));
    }
    await expect(createChild(env, user.id, payload("Overflow"))).rejects.toThrow(/four/i);
  });

  it("round-trips child_state JSON through D1", async () => {
    const { user } = await createTestUser("-state");
    const child = await createChild(env, user.id, payload("Maya"));

    await saveChildState(env, child.id, {
      spellingProgress: { accident: { stage: 4 } },
      monsterState: { inklet: { mastered: ["accident"], caught: true } },
      spellingPrefs: { yearFilter: "y5-6" },
    });

    const got = await getChildState(env, child.id);
    expect(got.spellingProgress.accident.stage).toBe(4);
    expect(got.monsterState.inklet.caught).toBe(true);
    expect(got.spellingPrefs.yearFilter).toBe("y5-6");
  });

  it("scopes getChild by user_id (can't read another user's child)", async () => {
    const { user: userA } = await createTestUser("-A");
    const { user: userB } = await createTestUser("-B");
    const childA = await createChild(env, userA.id, payload("Kid A"));

    expect(await getChild(env, userA.id, childA.id)).not.toBeNull();
    expect(await getChild(env, userB.id, childA.id)).toBeNull();
  });

  it("selectedChild persists on the session", async () => {
    const { user } = await createTestUser("-sel");
    const child = await createChild(env, user.id, payload("Selected"));
    const hash = await sha256(randomToken(24));
    const session = await createSession(env, user.id, hash);

    await setSelectedChild(env, session.id, child.id);
    const bundle = await getSessionBundleByHash(env, hash);
    expect(bundle.selectedChild?.id).toBe(child.id);
  });
});
