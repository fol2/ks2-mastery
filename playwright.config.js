import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || 8788);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// The E2E suite owns its build and dev server so local runs exercise the same
// path as CI instead of depending on an ambient `wrangler dev` session. The
// `npm run test:e2e` wrapper injects a free port for the whole run.
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
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
