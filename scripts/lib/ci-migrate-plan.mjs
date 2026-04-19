const MAIN_BRANCHES = new Set(["main", "master"]);
const CI_BRANCH_ENV_KEYS = ["WORKERS_CI_BRANCH", "GITHUB_REF_NAME"];
const REMOTE_MIGRATION_ARGS = [
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "ks2-mastery-db",
  "--remote",
];

function stripJsonComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function detectCiBranch(env = process.env) {
  for (const key of CI_BRANCH_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) return { key, value };
  }
  return null;
}

export function isTruthyEnv(value) {
  return value === "true" || value === "1";
}

export function hasPreviewDatabaseId(configText) {
  return /"preview_database_id"\s*:\s*"[^"]+"/.test(stripJsonComments(configText));
}

export function buildMigrationPlan({
  env = process.env,
  hasConfiguredPreviewDatabase = false,
} = {}) {
  const ciBranch = detectCiBranch(env);
  const inCI = Boolean(ciBranch) || isTruthyEnv(env.CI);

  if (inCI && ciBranch && !MAIN_BRANCHES.has(ciBranch.value)) {
    if (hasConfiguredPreviewDatabase) {
      return {
        shouldRun: true,
        args: [...REMOTE_MIGRATION_ARGS, "--preview"],
        logMessage: `[predeploy] CI branch "${ciBranch.value}" (${ciBranch.key}) is not main; applying D1 migrations to the preview database before deploy.`,
      };
    }

    return {
      shouldRun: false,
      args: [],
      logMessage: `[predeploy] CI branch "${ciBranch.value}" (${ciBranch.key}) is not main and no preview D1 database is configured; skipping remote D1 migrations so preview builds do not touch the shared database. Configure preview_database_id to restore preview-schema parity.`,
    };
  }

  if (inCI && !ciBranch) {
    return {
      shouldRun: true,
      args: REMOTE_MIGRATION_ARGS,
      logMessage:
        "[predeploy] CI detected but no branch env var found; running remote D1 migration so failures surface loudly rather than silently.",
    };
  }

  return {
    shouldRun: true,
    args: REMOTE_MIGRATION_ARGS,
    logMessage: "[predeploy] Applying remote D1 migrations before deploy.",
  };
}
