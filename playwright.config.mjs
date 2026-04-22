export default {
  testDir: './tests',
  testMatch: /.*\.playwright\.test\.(js|mjs)$/,
  timeout: 30_000,
  webServer: {
    command: 'node ./scripts/build-bundles.mjs && node ./scripts/build-public.mjs && node ./tests/helpers/browser-app-server.js --serve-only --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360', use: { viewport: { width: 360, height: 740 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1024', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
};
