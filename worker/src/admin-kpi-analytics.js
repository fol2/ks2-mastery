// P7 Unit 5: Business KPI analytics — standalone module.
//
// Accepts `db` parameter directly. No imports from repository.js.
// Each sub-query is wrapped in safeSection so partial failures degrade
// gracefully (null for the failed section, other sections still returned).
//
// account_type column convention:
//   Real accounts: COALESCE(account_type, 'real') <> 'demo'
//   Demo accounts: account_type = 'demo'

// ---------------------------------------------------------------------------
// safeSection — try/catch returning null on failure
// ---------------------------------------------------------------------------

async function safeSection(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function daysAgoMs(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function daysAgoIso(days) {
  return new Date(daysAgoMs(days)).toISOString();
}

// ---------------------------------------------------------------------------
// Sub-queries
// ---------------------------------------------------------------------------

async function queryAccounts(db) {
  const realResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts WHERE COALESCE(account_type, 'real') <> 'demo'`
  ).first();
  const demoResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts WHERE account_type = 'demo'`
  ).first();
  const real = realResult?.cnt ?? 0;
  const demo = demoResult?.cnt ?? 0;
  return { real, demo, total: real + demo };
}

async function queryActivation(db) {
  const day1 = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND updated_at >= ?`
  ).bind(daysAgoIso(1)).first();

  const day7 = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND updated_at >= ?`
  ).bind(daysAgoIso(7)).first();

  const day30 = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND updated_at >= ?`
  ).bind(daysAgoIso(30)).first();

  return {
    day1: day1?.cnt ?? 0,
    day7: day7?.cnt ?? 0,
    day30: day30?.cnt ?? 0,
  };
}

async function queryRetention(db) {
  const newThisWeek = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND created_at >= ?`
  ).bind(daysAgoIso(7)).first();

  const returnedIn7d = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND updated_at >= ?
       AND created_at < ?`
  ).bind(daysAgoIso(7), daysAgoIso(7)).first();

  const returnedIn30d = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE COALESCE(account_type, 'real') <> 'demo'
       AND updated_at >= ?
       AND created_at < ?`
  ).bind(daysAgoIso(30), daysAgoIso(30)).first();

  return {
    newThisWeek: newThisWeek?.cnt ?? 0,
    returnedIn7d: returnedIn7d?.cnt ?? 0,
    returnedIn30d: returnedIn30d?.cnt ?? 0,
  };
}

async function queryConversion(db) {
  const demoStarts = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE account_type = 'demo'
       AND created_at >= ?`
  ).bind(daysAgoIso(30)).first();

  const resets = await db.prepare(
    `SELECT COUNT(*) as cnt FROM accounts
     WHERE account_type = 'demo'
       AND updated_at >= ?
       AND created_at < updated_at`
  ).bind(daysAgoIso(30)).first();

  // Conversions: real accounts created in last 30d that originated from demo
  // (heuristic: accounts with a demo_converted_at or similar marker).
  // Fallback: count from admin_kpi_metrics if available.
  let conversions = 0;
  let rate7d = 0;
  let rate30d = 0;
  const metricsRow = await db.prepare(
    `SELECT value FROM admin_kpi_metrics WHERE metric_key = 'conversion_count_30d'`
  ).first().catch(() => null);
  if (metricsRow?.value != null) {
    conversions = Number(metricsRow.value) || 0;
  }
  const rate7dRow = await db.prepare(
    `SELECT value FROM admin_kpi_metrics WHERE metric_key = 'conversion_rate_7d'`
  ).first().catch(() => null);
  if (rate7dRow?.value != null) {
    rate7d = Number(rate7dRow.value) || 0;
  }
  const rate30dRow = await db.prepare(
    `SELECT value FROM admin_kpi_metrics WHERE metric_key = 'conversion_rate_30d'`
  ).first().catch(() => null);
  if (rate30dRow?.value != null) {
    rate30d = Number(rate30dRow.value) || 0;
  }

  return {
    demoStarts: demoStarts?.cnt ?? 0,
    resets: resets?.cnt ?? 0,
    conversions,
    rate7d,
    rate30d,
  };
}

async function querySubjectEngagement(db) {
  // Practice sessions per subject in last 7 days (real accounts only).
  // Uses practice_sessions table if available.
  const since = daysAgoIso(7);
  const results = await db.prepare(
    `SELECT subject_id, COUNT(*) as cnt FROM practice_sessions
     WHERE created_at >= ?
       AND account_id IN (
         SELECT id FROM accounts WHERE COALESCE(account_type, 'real') <> 'demo'
       )
     GROUP BY subject_id`
  ).bind(since).all().catch(() => ({ results: [] }));

  const engagement = {};
  for (const row of (results?.results || [])) {
    engagement[row.subject_id] = row.cnt;
  }
  return engagement;
}

async function querySupportFriction(db) {
  const since7d = daysAgoIso(7);

  // Accounts with 3+ errors in 7 days
  const repeatedErrors = await db.prepare(
    `SELECT COUNT(*) as cnt FROM (
       SELECT account_id FROM ops_error_events
       WHERE created_at >= ?
       GROUP BY account_id
       HAVING COUNT(*) >= 3
     )`
  ).bind(since7d).first().catch(() => null);

  // Accounts with 3+ denials in 7 days
  const denials = await db.prepare(
    `SELECT COUNT(*) as cnt FROM (
       SELECT account_id FROM admin_request_denials
       WHERE created_at >= ?
       GROUP BY account_id
       HAVING COUNT(*) >= 3
     )`
  ).bind(since7d).first().catch(() => null);

  // Payment holds
  const paymentHolds = await db.prepare(
    `SELECT COUNT(*) as cnt FROM account_ops_metadata
     WHERE ops_status = 'payment_hold'`
  ).first().catch(() => null);

  // Suspended accounts
  const suspended = await db.prepare(
    `SELECT COUNT(*) as cnt FROM account_ops_metadata
     WHERE ops_status = 'suspended'`
  ).first().catch(() => null);

  // Unresolved incidents — returns 0 until incident tables exist
  const unresolvedIncidents = 0;

  return {
    repeatedErrors: repeatedErrors?.cnt ?? 0,
    denials: denials?.cnt ?? 0,
    paymentHolds: paymentHolds?.cnt ?? 0,
    suspendedAccounts: suspended?.cnt ?? 0,
    unresolvedIncidents,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch business KPIs from the database.
 * Each section is wrapped in safeSection for partial failure resilience.
 *
 * @param {object} db — D1 database binding
 * @returns {Promise<object>} KPI data with nullable sections
 */
export async function getBusinessKpis(db) {
  const [accounts, activation, retention, conversion, subjectEngagement, supportFriction] =
    await Promise.all([
      safeSection(() => queryAccounts(db)),
      safeSection(() => queryActivation(db)),
      safeSection(() => queryRetention(db)),
      safeSection(() => queryConversion(db)),
      safeSection(() => querySubjectEngagement(db)),
      safeSection(() => querySupportFriction(db)),
    ]);

  return {
    accounts,
    activation,
    retention,
    conversion,
    subjectEngagement,
    supportFriction,
    refreshedAt: new Date().toISOString(),
  };
}
