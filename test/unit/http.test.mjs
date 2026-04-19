import { describe, expect, it } from "vitest";
import {
  HttpError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../../worker/lib/http.js";

describe("HttpError", () => {
  it("falls back to ok/message payload when no options are supplied", () => {
    // Regression guard: the previous implementation's default options `{}` was
    // truthy and assigned `payload = {}`, silently erasing the error body for
    // every caller of `new HttpError(status, message)`.
    const error = new HttpError(502, "upstream failed");
    expect(error.payload).toEqual({ ok: false, message: "upstream failed" });
    expect(error.headers).toEqual({});
    expect(error.status).toBe(502);
    expect(error.message).toBe("upstream failed");
  });

  it("uses the shorthand path when options is a non-canonical object", () => {
    const error = new HttpError(400, "bad", { code: "BAD_INPUT" });
    expect(error.payload).toEqual({ code: "BAD_INPUT" });
  });

  it("preserves the canonical { payload, headers } shape", () => {
    const error = new HttpError(418, "teapot", {
      payload: { ok: false, message: "teapot", teapot: true },
      headers: { "X-Teapot": "yes" },
    });
    expect(error.payload).toEqual({ ok: false, message: "teapot", teapot: true });
    expect(error.headers).toEqual({ "X-Teapot": "yes" });
  });
});

describe("subclass defaults", () => {
  it("ValidationError attaches optional details", () => {
    const error = new ValidationError("bad", { field: "email" });
    expect(error.status).toBe(400);
    expect(error.payload).toEqual({
      ok: false,
      message: "bad",
      details: { field: "email" },
    });
  });

  it("ValidationError omits details when not provided", () => {
    const error = new ValidationError("bad");
    expect(error.payload).toEqual({ ok: false, message: "bad" });
  });

  it("NotFoundError defaults the message", () => {
    expect(new NotFoundError().payload).toEqual({ ok: false, message: "Not found." });
    expect(new NotFoundError("missing child").payload).toEqual({
      ok: false,
      message: "missing child",
    });
  });

  it("RateLimitError exposes retryAfterSeconds in payload and header", () => {
    const error = new RateLimitError("slow down", 42);
    expect(error.status).toBe(429);
    expect(error.payload).toEqual({ ok: false, message: "slow down", retryAfterSeconds: 42 });
    expect(error.headers).toEqual({ "Retry-After": "42" });
  });

  it("RateLimitError omits Retry-After when no retryAfter is supplied", () => {
    const error = new RateLimitError("slow down");
    expect(error.payload).toEqual({ ok: false, message: "slow down" });
    expect(error.headers).toEqual({});
  });
});
