import { describe, expect, it } from "vitest";
import { attachRequestId, createRequestId, REQUEST_ID_HEADER } from "../../worker/lib/observability.js";

describe("createRequestId", () => {
  it("prefers the Cloudflare ray ID when present", () => {
    const request = new Request("https://app.test/api/bootstrap", {
      headers: {
        "cf-ray": "abc123def456-LHR",
      },
    });

    expect(createRequestId(request)).toBe("abc123def456");
  });

  it("falls back to a generated ID when no ray ID is present", () => {
    const request = new Request("https://app.test/api/bootstrap");
    const requestId = createRequestId(request);

    expect(typeof requestId).toBe("string");
    expect(requestId.length).toBeGreaterThan(10);
  });
});

describe("attachRequestId", () => {
  it("sets the request ID header when it is missing", () => {
    const response = new Response("ok");
    attachRequestId(response, "req-123");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req-123");
  });

  it("does not overwrite an existing request ID header", () => {
    const response = new Response("ok", {
      headers: {
        [REQUEST_ID_HEADER]: "existing-id",
      },
    });

    attachRequestId(response, "req-123");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("existing-id");
  });
});
