import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'docs/plans/james/hero-mode/A/hero-mode-production-counts-2026-05-10.json';
const DATABASE = 'ks2-mastery-db';

function runD1Query(sql) {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1';

  const stdout = execFileSync(
    process.execPath,
    ['scripts/wrangler-oauth.mjs', 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', env },
  );
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : null;
  if (!first?.success) {
    throw new Error(`D1 query failed: ${sql}`);
  }
  return first.results || [];
}

const generatedAt = new Date().toISOString();
const heroStateRows = runD1Query(
  "SELECT COUNT(1) AS hero_state_rows FROM child_game_state WHERE system_id = 'hero-mode'",
);
const heroEventRows = runD1Query(
  "SELECT event_type, COUNT(1) AS count FROM event_log WHERE system_id = 'hero-mode' GROUP BY event_type ORDER BY event_type",
);
const heroStateRowsByAccountType = runD1Query(
  "SELECT COALESCE(a.account_type, 'unknown') AS account_type, COUNT(DISTINCT c.learner_id) AS learner_count, COUNT(1) AS state_rows FROM child_game_state c LEFT JOIN account_learner_memberships m ON m.learner_id = c.learner_id LEFT JOIN adult_accounts a ON a.id = m.account_id WHERE c.system_id = 'hero-mode' GROUP BY COALESCE(a.account_type, 'unknown') ORDER BY account_type",
);
const heroEventRowsByActorType = runD1Query(
  "SELECT COALESCE(a.account_type, 'unknown') AS actor_account_type, e.event_type, COUNT(1) AS count FROM event_log e LEFT JOIN adult_accounts a ON a.id = e.actor_account_id WHERE e.system_id = 'hero-mode' GROUP BY COALESCE(a.account_type, 'unknown'), e.event_type ORDER BY actor_account_type, e.event_type",
);
const heroEventRowsByLearnerAccountType = runD1Query(
  "SELECT COALESCE(a.account_type, 'unknown') AS learner_account_type, e.event_type, COUNT(1) AS count FROM event_log e LEFT JOIN account_learner_memberships m ON m.learner_id = e.learner_id LEFT JOIN adult_accounts a ON a.id = m.account_id WHERE e.system_id = 'hero-mode' GROUP BY COALESCE(a.account_type, 'unknown'), e.event_type ORDER BY learner_account_type, e.event_type",
);
const heroBoundaryCardinality = runD1Query(
  "SELECT (SELECT COUNT(DISTINCT m.account_id) FROM child_game_state c LEFT JOIN account_learner_memberships m ON m.learner_id = c.learner_id WHERE c.system_id = 'hero-mode') AS state_account_count, (SELECT COUNT(DISTINCT c.learner_id) FROM child_game_state c WHERE c.system_id = 'hero-mode') AS state_learner_count, (SELECT COUNT(DISTINCT e.actor_account_id) FROM event_log e WHERE e.system_id = 'hero-mode' AND e.actor_account_id IS NOT NULL) AS event_actor_account_count, (SELECT COUNT(DISTINCT e.learner_id) FROM event_log e WHERE e.system_id = 'hero-mode') AS event_learner_count",
);

const report = {
  ok: true,
  generatedAt,
  database: DATABASE,
  heroStateRows: heroStateRows[0]?.hero_state_rows ?? null,
  heroEventRows,
  heroStateRowsByAccountType,
  heroEventRowsByActorType,
  heroEventRowsByLearnerAccountType,
  heroBoundaryCardinality: heroBoundaryCardinality[0] || null,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
