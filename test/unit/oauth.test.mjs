import { describe, expect, it } from "vitest";
import { beginOAuthFlow, providerConfig } from "../../worker/lib/oauth.js";
import { sha256 } from "../../worker/lib/security.js";

const ORIGIN = "https://ks2.test";

function mkEnv(overrides = {}) {
  return { SOCIAL_LOGIN_WIRE_ENABLED: "true", ...overrides };
}

describe("providerConfig", () => {
  it("disables all providers when no secrets are present", () => {
    expect(providerConfig(mkEnv())).toEqual({
      google: false,
      facebook: false,
      x: false,
      apple: false,
      email: true,
    });
  });

  it("enables Google when both client id and secret are set", () => {
    const cfg = providerConfig(mkEnv({
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
    }));
    expect(cfg.google).toBe(true);
  });

  it("enables X with just a client id (PKCE-only public client)", () => {
    expect(providerConfig(mkEnv({ X_CLIENT_ID: "xid" })).x).toBe(true);
  });

  it("requires all four Apple secrets (client id + team + key id + private key)", () => {
    const partial = providerConfig(mkEnv({
      APPLE_CLIENT_ID: "aid",
      APPLE_TEAM_ID: "tid",
      APPLE_KEY_ID: "kid",
    }));
    expect(partial.apple).toBe(false);

    const full = providerConfig(mkEnv({
      APPLE_CLIENT_ID: "aid",
      APPLE_TEAM_ID: "tid",
      APPLE_KEY_ID: "kid",
      APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----...",
    }));
    expect(full.apple).toBe(true);
  });

  it("global kill switch disables everything except email", () => {
    const cfg = providerConfig({
      SOCIAL_LOGIN_WIRE_ENABLED: "false",
      GOOGLE_CLIENT_ID: "x",
      GOOGLE_CLIENT_SECRET: "y",
    });
    expect(cfg.google).toBe(false);
    expect(cfg.email).toBe(true);
  });
});

describe("beginOAuthFlow", () => {
  it("Google: returns state + PKCE + authorize URL with expected params", async () => {
    const env = mkEnv({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" });
    const attempt = await beginOAuthFlow(env, "google", ORIGIN);

    expect(attempt.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.nonce).toBe("");

    const url = new URL(attempt.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("Google: PKCE challenge = base64url(SHA-256(code_verifier))", async () => {
    const env = mkEnv({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" });
    const attempt = await beginOAuthFlow(env, "google", ORIGIN);
    const url = new URL(attempt.url);
    expect(url.searchParams.get("code_challenge")).toBe(await sha256(attempt.codeVerifier));
  });

  it("Facebook: no PKCE challenge (provider does not support it)", async () => {
    const env = mkEnv({ FACEBOOK_CLIENT_ID: "fid", FACEBOOK_CLIENT_SECRET: "fsecret" });
    const attempt = await beginOAuthFlow(env, "facebook", ORIGIN);
    expect(attempt.codeVerifier).toBe("");
    expect(new URL(attempt.url).searchParams.get("code_challenge")).toBeNull();
  });

  it("Apple: emits a nonce, uses response_mode=form_post, no PKCE", async () => {
    const env = mkEnv({
      APPLE_CLIENT_ID: "aid",
      APPLE_TEAM_ID: "tid",
      APPLE_KEY_ID: "kid",
      APPLE_PRIVATE_KEY: "pem",
    });
    const attempt = await beginOAuthFlow(env, "apple", ORIGIN);
    expect(attempt.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.codeVerifier).toBe("");

    const url = new URL(attempt.url);
    expect(url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(url.searchParams.get("response_mode")).toBe("form_post");
  });

  it("rejects unknown providers", async () => {
    await expect(beginOAuthFlow(mkEnv(), "myspace", ORIGIN))
      .rejects.toThrow(/not supported/i);
  });

  it("rejects a provider that has no secrets wired up", async () => {
    await expect(beginOAuthFlow(mkEnv(), "google", ORIGIN))
      .rejects.toThrow(/not configured/i);
  });

  it("respects the global kill switch", async () => {
    const env = { SOCIAL_LOGIN_WIRE_ENABLED: "false", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" };
    await expect(beginOAuthFlow(env, "google", ORIGIN))
      .rejects.toThrow(/disabled/i);
  });
});
