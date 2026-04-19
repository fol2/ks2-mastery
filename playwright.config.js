import { defineConfig, devices } from "@playwright/test";

const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Starts `wrangler dev` on a dedicated port before E2E tests. The Worker runs
// locally with in-memory D1/R2 via miniflare, so state resets between runs
// when reuseExistingServer is false (which is the default in CI).
export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npx wrangler dev --local --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
