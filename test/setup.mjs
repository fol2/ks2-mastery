import { env } from "cloudflare:workers";

const migrationSources = Object.entries(
  import.meta.glob("../migrations/*.sql", {
    eager: true,
    import: "default",
    query: "?raw",
  }),
).sort(([left], [right]) => left.localeCompare(right));

if (!migrationSources.length) {
  throw new Error("No D1 migration files were found for the test suite.");
}

function parseStatements(source) {
  return source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

// Mirror Wrangler's own tracking table so the Worker's runtime
// readiness check (worker/lib/store.js::assertMigrationsApplied) sees
// the same state in tests that it would on a remote DB after a real
// `wrangler d1 migrations apply`.
await env.DB
  .prepare(
    "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  )
  .run();

for (const [path, sql] of migrationSources) {
  const name = path.split("/").pop();
  const applied = await env.DB
    .prepare(`SELECT 1 AS ok FROM d1_migrations WHERE name = ?1 LIMIT 1`)
    .bind(name)
    .first();

  if (applied) continue;

  const statements = parseStatements(sql);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement).bind()));
  await env.DB
    .prepare(`INSERT INTO d1_migrations (name) VALUES (?1)`)
    .bind(name)
    .run();
}
