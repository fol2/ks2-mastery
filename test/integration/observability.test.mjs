import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns a healthy payload with a request ID header", async () => {
    const response = await SELF.fetch("https://app.test/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();

    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe("ok");
    expect(payload.requestId).toBe(requestId);
    expect(payload.checks.database.ok).toBe(true);
    expect(payload.checks.assets.ok).toBe(true);
    expect(payload.checks.observability.ok).toBe(true);
  });
});

describe("request ID propagation", () => {
  it("adds x-request-id to normal API responses", async () => {
    const response = await SELF.fetch("https://app.test/api/bootstrap");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
