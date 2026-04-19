import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs tests inside the Workers runtime with real D1 + R2 miniflare bindings,
// isolated per test file. See docs/test-strategy.md for coverage layout.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./worker/index.js",
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/**/*.test.mjs"],
    globals: false,
    setupFiles: ["./test/setup.mjs"],
  },
});
