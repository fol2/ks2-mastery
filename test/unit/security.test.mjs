import { describe, expect, it } from "vitest";
import {
  cookieOptions,
  hashPassword,
  randomToken,
  safeEmail,
  safeJsonParse,
  sha256,
  utf8,
  verifyPassword,
} from "../../worker/lib/security.js";

describe("randomToken", () => {
  it("returns a base64url string of the expected length", () => {
    const token = randomToken(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 24 bytes -> 32 base64url chars (no padding)
    expect(token.length).toBe(32);
  });

  it("defaults to 32 bytes -> 43 base64url chars", () => {
    expect(randomToken().length).toBe(43);
  });

  it("produces different values on every call (no collision in 100 samples)", () => {
    const seen = new Set();
    for (let i = 0; i < 100; i += 1) seen.add(randomToken(16));
    expect(seen.size).toBe(100);
  });
});

describe("sha256", () => {
  it("matches the known base64url of sha256('hello')", async () => {
    expect(await sha256("hello")).toBe("LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ");
  });

  it("is deterministic", async () => {
    expect(await sha256("deterministic")).toBe(await sha256("deterministic"));
  });
});

describe("hashPassword + verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const { salt, hash } = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", salt, hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { salt, hash } = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("nope", salt, hash)).toBe(false);
  });

  it("uses a fresh random salt and yields a different hash each call", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("rejects a tampered hash", async () => {
    const { salt } = await hashPassword("pw");
    expect(await verifyPassword("pw", salt, "tampered-hash-value")).toBe(false);
  });
});

describe("cookieOptions", () => {
  it("defaults to HttpOnly + SameSite=Lax + Secure + 30d TTL", () => {
    const opts = cookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("Lax");
    expect(opts.secure).toBe(true);
    expect(opts.maxAge).toBe(60 * 60 * 24 * 30);
    expect(opts.path).toBe("/");
  });

  it("lets the caller drop Secure for non-https dev", () => {
    expect(cookieOptions(60, false).secure).toBe(false);
  });
});

describe("safeEmail", () => {
  it("lowercases and trims", () => {
    expect(safeEmail("  JAMES@Example.com ")).toBe("james@example.com");
  });

  it("coerces nullish values to empty string", () => {
    expect(safeEmail(null)).toBe("");
    expect(safeEmail(undefined)).toBe("");
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it("returns the fallback for invalid JSON", () => {
    expect(safeJsonParse("not-json", { ok: true })).toEqual({ ok: true });
  });

  it("returns the fallback for empty strings", () => {
    expect(safeJsonParse("", [])).toEqual([]);
  });
});

describe("utf8", () => {
  it("round-trips an ASCII string", () => {
    expect(utf8("hello")).toBe("hello");
  });
});
