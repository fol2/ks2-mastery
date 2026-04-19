import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "../../worker/lib/rate-limit.js";

describe("consumeRateLimit", () => {
  it("increments atomically under a concurrent burst within one window", async () => {
    const options = {
      bucket: "test-burst",
      identifier: "1.2.3.4",
      limit: 100,
      windowMs: 60_000,
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(env, options)),
    );

    const counts = results.map((result) => result.requestCount).sort((left, right) => left - right);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(results.every((result) => result.allowed)).toBe(true);
    expect(results.every((result) => !result.skipped)).toBe(true);
  });

  it("resets the counter on the first call in a new window", async () => {
    const bucket = "test-window-reset";
    const identifier = "198.51.100.7";
    const windowMs = 60_000;

    const earlier = await consumeRateLimit(env, {
      bucket,
      identifier,
      limit: 5,
      windowMs,
      now: 1_000_000_000,
    });
    expect(earlier.requestCount).toBe(1);

    const sameWindow = await consumeRateLimit(env, {
      bucket,
      identifier,
      limit: 5,
      windowMs,
      now: 1_000_000_000 + 10_000,
    });
    expect(sameWindow.requestCount).toBe(2);

    const nextWindow = await consumeRateLimit(env, {
      bucket,
      identifier,
      limit: 5,
      windowMs,
      now: 1_000_000_000 + windowMs + 5_000,
    });
    expect(nextWindow.requestCount).toBe(1);
  });

  it("skips and surfaces a warning when identifier is empty instead of lumping callers together", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const first = await consumeRateLimit(env, {
        bucket: "test-empty-identifier",
        identifier: "",
        limit: 50,
        windowMs: 60_000,
      });
      expect(first.skipped).toBe(true);
      expect(first.allowed).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("still skips when bucket is missing or limit is invalid", async () => {
    const missingBucket = await consumeRateLimit(env, {
      bucket: "",
      identifier: "1.2.3.4",
      limit: 10,
      windowMs: 60_000,
    });
    expect(missingBucket.skipped).toBe(true);
    expect(missingBucket.allowed).toBe(true);

    const invalidLimit = await consumeRateLimit(env, {
      bucket: "test-skip",
      identifier: "1.2.3.4",
      limit: 0,
      windowMs: 60_000,
    });
    expect(invalidLimit.skipped).toBe(true);
  });
});
