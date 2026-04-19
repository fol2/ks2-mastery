import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureApiSchema } from "../../worker/middleware/ensure-schema.js";
import { HttpError } from "../../worker/lib/http.js";
import * as store from "../../worker/lib/store.js";

// Minimal fake Hono context. `logError` goes through `requestMeta(c)` which
// dereferences `c.req.raw` as a real Fetch Request — use the platform object
// so we can skip mocking the structured log emitter.
function makeContext(pathname) {
  const state = new Map();
  const raw = new Request(`https://app.test${pathname}`);
  return {
    env: { DB: {}, APP_NAME: "KS2 Mastery" },
    req: { url: raw.url, raw },
    get(key) {
      return state.get(key);
    },
    set(key, value) {
      state.set(key, value);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("ensureApiSchema health bypass", () => {
  it("skips ensureSchema for /api/health", async () => {
    const spy = vi.spyOn(store, "ensureSchema").mockResolvedValue();
    const c = makeContext("/api/health");
    let nextCalled = false;
    await ensureApiSchema(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips ensureSchema for /api/health/ (trailing slash)", async () => {
    // Regression guard: the previous strict-equality check let probe tools
    // hitting /api/health/ bypass the health bypass and thereby re-trigger
    // schema init — defeating the whole point of the carve-out.
    const spy = vi.spyOn(store, "ensureSchema").mockResolvedValue();
    const c = makeContext("/api/health/");
    let nextCalled = false;
    await ensureApiSchema(c, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws HttpError(500) when schema initialisation fails", async () => {
    vi.spyOn(store, "ensureSchema").mockRejectedValue(new Error("migration lock"));
    const c = makeContext("/api/bootstrap");
    await expect(ensureApiSchema(c, async () => {})).rejects.toBeInstanceOf(HttpError);
    try {
      await ensureApiSchema(c, async () => {});
    } catch (error) {
      expect(error.status).toBe(500);
      expect(error.payload).toEqual({ ok: false, message: "Database is not ready." });
    }
  });
});
