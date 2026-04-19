import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("smoke: workers runtime + bindings", () => {
  it("DB binding is wired from wrangler config", () => {
    expect(env.DB).toBeDefined();
    expect(typeof env.DB.prepare).toBe("function");
  });

  it("SPELLING_AUDIO_BUCKET R2 binding is present", () => {
    expect(env.SPELLING_AUDIO_BUCKET).toBeDefined();
  });

  it("APP_NAME var is readable", () => {
    expect(env.APP_NAME).toBe("KS2 Mastery");
  });
});
