import { describe, expect, it } from "vitest";
import {
  buildLogoutResponse,
  normaliseAuthProvider,
  normaliseOAuthCallbackPayload,
  parseCredentialsPayload,
  parseOAuthStartPayload,
} from "../../worker/contracts/auth-contract.js";

describe("parseCredentialsPayload", () => {
  it("normalises the email and preserves password / token verbatim", () => {
    const got = parseCredentialsPayload({
      email: "  Parent@Example.COM  ",
      password: "  has spaces  ",
      turnstileToken: " tkn ",
    });
    // safeEmail lowercases and strips; whitespace-only passwords must survive
    // untouched so the server can still reject them with the length guard.
    expect(got.email).toBe("parent@example.com");
    expect(got.password).toBe("  has spaces  ");
    expect(got.turnstileToken).toBe(" tkn ");
  });

  it("returns empty strings for missing fields rather than undefined", () => {
    const got = parseCredentialsPayload({});
    expect(got.email).toBe("");
    expect(got.password).toBe("");
    expect(got.turnstileToken).toBe("");
  });
});

describe("normaliseAuthProvider", () => {
  it("lowercases and trims", () => {
    expect(normaliseAuthProvider("  GOOGLE ")).toBe("google");
  });
});

describe("normaliseOAuthCallbackPayload", () => {
  it("collapses array-valued params to the first element and stringifies", () => {
    expect(
      normaliseOAuthCallbackPayload({
        code: ["a", "b"],
        state: null,
        nonce: undefined,
      }),
    ).toEqual({ code: "a", state: "", nonce: "" });
  });

  it("returns an empty object when input is not an object", () => {
    expect(normaliseOAuthCallbackPayload(null)).toEqual({});
    expect(normaliseOAuthCallbackPayload("nope")).toEqual({});
  });
});

describe("parseOAuthStartPayload", () => {
  it("keeps the turnstile token verbatim", () => {
    expect(parseOAuthStartPayload({ turnstileToken: "  tok  " })).toEqual({
      turnstileToken: "  tok  ",
    });
  });
});

describe("buildLogoutResponse", () => {
  it("always returns { ok: true }", () => {
    expect(buildLogoutResponse()).toEqual({ ok: true });
  });
});
