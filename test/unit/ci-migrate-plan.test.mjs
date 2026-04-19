import { describe, expect, it } from "vitest";
import {
  buildMigrationPlan,
  detectCiBranch,
  hasPreviewDatabaseId,
  isTruthyEnv,
} from "../../scripts/lib/ci-migrate-plan.mjs";

describe("detectCiBranch", () => {
  it("prefers WORKERS_CI_BRANCH when multiple CI branch vars exist", () => {
    expect(
      detectCiBranch({
        WORKERS_CI_BRANCH: "preview-branch",
        GITHUB_REF_NAME: "main",
      }),
    ).toEqual({ key: "WORKERS_CI_BRANCH", value: "preview-branch" });
  });

  it("returns null when no CI branch env var is present", () => {
    expect(detectCiBranch({ CI: "true" })).toBeNull();
  });
});

describe("isTruthyEnv", () => {
  it("accepts the CI strings this script relies on", () => {
    expect(isTruthyEnv("true")).toBe(true);
    expect(isTruthyEnv("1")).toBe(true);
    expect(isTruthyEnv("false")).toBe(false);
  });
});

describe("hasPreviewDatabaseId", () => {
  it("finds a configured preview database id inside wrangler config", () => {
    const config = `
      {
        "d1_databases": [
          {
            "binding": "DB",
            "database_id": "prod-db",
            "preview_database_id": "preview-db"
          }
        ]
      }
    `;

    expect(hasPreviewDatabaseId(config)).toBe(true);
  });

  it("ignores preview_database_id mentions that only appear in comments", () => {
    const config = `
      {
        // "preview_database_id": "comment-only"
        "d1_databases": [
          {
            "binding": "DB",
            "database_id": "prod-db"
          }
        ]
      }
    `;

    expect(hasPreviewDatabaseId(config)).toBe(false);
  });
});

describe("buildMigrationPlan", () => {
  it("uses the shared remote database for local runs", () => {
    expect(buildMigrationPlan({ env: {} })).toEqual({
      shouldRun: true,
      args: ["wrangler", "d1", "migrations", "apply", "ks2-mastery-db", "--remote"],
      logMessage: "[predeploy] Applying remote D1 migrations before deploy.",
    });
  });

  it("uses the shared remote database on main in CI", () => {
    expect(
      buildMigrationPlan({
        env: { CI: "true", WORKERS_CI_BRANCH: "main" },
        hasConfiguredPreviewDatabase: true,
      }),
    ).toEqual({
      shouldRun: true,
      args: ["wrangler", "d1", "migrations", "apply", "ks2-mastery-db", "--remote"],
      logMessage: "[predeploy] Applying remote D1 migrations before deploy.",
    });
  });

  it("uses the preview database for non-main CI branches when configured", () => {
    expect(
      buildMigrationPlan({
        env: { CI: "true", WORKERS_CI_BRANCH: "feature/d1" },
        hasConfiguredPreviewDatabase: true,
      }),
    ).toEqual({
      shouldRun: true,
      args: [
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "ks2-mastery-db",
        "--remote",
        "--preview",
      ],
      logMessage:
        '[predeploy] CI branch "feature/d1" (WORKERS_CI_BRANCH) is not main; applying D1 migrations to the preview database before deploy.',
    });
  });

  it("skips remote migrations for non-main CI branches when no preview DB exists", () => {
    expect(
      buildMigrationPlan({
        env: { CI: "true", GITHUB_REF_NAME: "feature/d1" },
        hasConfiguredPreviewDatabase: false,
      }),
    ).toEqual({
      shouldRun: false,
      args: [],
      logMessage:
        '[predeploy] CI branch "feature/d1" (GITHUB_REF_NAME) is not main and no preview D1 database is configured; skipping remote D1 migrations so preview builds do not touch the shared database. Configure preview_database_id to restore preview-schema parity.',
    });
  });

  it("runs remotely when CI is detected without a branch env var", () => {
    expect(
      buildMigrationPlan({
        env: { CI: "true" },
        hasConfiguredPreviewDatabase: false,
      }),
    ).toEqual({
      shouldRun: true,
      args: ["wrangler", "d1", "migrations", "apply", "ks2-mastery-db", "--remote"],
      logMessage:
        "[predeploy] CI detected but no branch env var found; running remote D1 migration so failures surface loudly rather than silently.",
    });
  });
});
