// Invoked as the `predeploy` npm hook so that every `npm run deploy` applies
// outstanding D1 migrations before `wrangler deploy` runs, closing the
// "deploy new code that references an unapplied schema" footgun.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { buildMigrationPlan, hasPreviewDatabaseId } from "./lib/ci-migrate-plan.mjs";

const wranglerConfigText = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const plan = buildMigrationPlan({
  env: process.env,
  hasConfiguredPreviewDatabase: hasPreviewDatabaseId(wranglerConfigText),
});

console.log(plan.logMessage);
const result = spawnSync(
  "npx",
  plan.args,
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CI: "1" },
  },
);

if (result.error) {
  console.error("[predeploy] Failed to spawn wrangler:", result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
