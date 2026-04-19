// Invoked as the `predeploy` npm hook so that every `npm run deploy` applies
// outstanding remote D1 migrations before `wrangler deploy` runs, closing the
// "deploy new code that references an unapplied schema" footgun.
//
// Branches other than `main` skip the migration step when the script detects
// a CI environment, so a feature-branch preview never rewrites production
// schema. Local invocations always migrate (fail-closed), which keeps a human
// operator honest.
//
// Required CI environment variables (any one of them identifies the branch):
//   - WORKERS_CI_BRANCH   (Cloudflare Workers Builds)
//   - GITHUB_REF_NAME     (GitHub Actions)
// Both Workers Builds and GitHub Actions also export `CI=true`, which the
// script uses as a secondary signal so CI without a known branch var still
// errs on the side of skipping.

import { spawnSync } from "node:child_process";

const MAIN_BRANCHES = new Set(["main", "master"]);
const CI_BRANCH_ENV_KEYS = ["WORKERS_CI_BRANCH", "GITHUB_REF_NAME"];

function detectCiBranch() {
  for (const key of CI_BRANCH_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) return { key, value };
  }
  return null;
}

function isTruthyEnv(value) {
  return value === "true" || value === "1";
}

const ciBranch = detectCiBranch();
const inCI = Boolean(ciBranch) || isTruthyEnv(process.env.CI);

if (inCI && ciBranch && !MAIN_BRANCHES.has(ciBranch.value)) {
  console.log(
    `[predeploy] CI branch "${ciBranch.value}" (${ciBranch.key}) is not main; skipping remote D1 migration.`,
  );
  process.exit(0);
}

if (inCI && !ciBranch) {
  console.log(
    "[predeploy] CI detected but no branch env var found; running remote D1 migration so failures surface loudly rather than silently.",
  );
}

console.log("[predeploy] Applying remote D1 migrations before deploy.");
const result = spawnSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", "ks2-mastery-db", "--remote"],
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
