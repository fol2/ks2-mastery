import { defineConfig, devices } from "@playwright/test";

const rawPort = process.env.PLAYWRIGHT_PORT;
const parsedPort = rawPort === undefined ? 8788 : Number(rawPort);
if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
  throw new Error(
    `PLAYWRIGHT_PORT must be an integer between 1 and 65535 (got ${JSON.stringify(rawPort)})`,
  );
}
const PORT = parsedPort;
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
    // CI must always own its server so a run never silently reuses state from
    // another invocation. Locally, an existing `wrangler dev` on the chosen
    // port is reused to keep iteration fast; `PLAYWRIGHT_REUSE_SERVER=1`
    // forces reuse for scripted local pipelines that provision the server
    // externally.
    reuseExistingServer:
      !process.env.CI || process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
