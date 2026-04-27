// P3 U6: Debug Bundle — Worker-authoritative evidence packet.
//
// Aggregates errors, occurrences, denials, mutations, account/learner
// state, and capacity context into a single copyable JSON packet for
// admin/ops debugging. Each sub-query runs in its own error boundary
// so a single table failure returns `null` for that section rather than
// a full 500.
//
// Security constraints:
//   - Auth: assertAdminHubActor (admin or ops role required)
//   - Rate limit: 10/min per session (stricter than general admin reads)
//   - Redaction: `redactBundleForRole(bundle, role)` strips fields by role:
//       Admin: full email, full account ID, internal notes, full stack
//       Ops: masked email (last 6), masked account ID (last 8), no notes, first-frame-only stack
//       Both: no auth tokens, cookies, raw request bodies
//   - JSON export: admin-only (ops sees display-only)

import { first, all } from './d1.js';

// ---------- Constants ----------

const BUNDLE_SECTION_LIMIT = 20;
const DEFAULT_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_ID_MASK_LAST_N = 8;
const EMAIL_MASK_LAST_N = 6;

// ---------- Masking helpers ----------

export function maskEmail(email, lastN = EMAIL_MASK_LAST_N) {
  if (typeof email !== 'string' || !email) return null;
  if (email.length <= lastN) return email;
  return '*'.repeat(email.length - lastN) + email.slice(-lastN);
}

export function maskAccountId(accountId, lastN = ACCOUNT_ID_MASK_LAST_N) {
  if (typeof accountId !== 'string' || !accountId) return null;
  if (accountId.length <= lastN) return accountId;
  return accountId.slice(-lastN);
}

function firstFrame(stack) {
  if (typeof stack !== 'string' || !stack) return null;
  const lines = stack.split('\n').filter((l) => l.trim());
  // Return the first line that looks like a stack frame (contains 'at ')
  // or just the first line if none match.
  const frameLine = lines.find((l) => /^\s*at\s/.test(l)) || lines[0] || null;
  return frameLine ? frameLine.trim() : null;
}

// ---------- Per-section error boundary ----------

async function safeSection(label, fn) {
  try {
    return await fn();
  } catch (error) {
    // Per-section error boundary: return null on failure so other
    // sections still populate. Log for diagnostics.
    try {
      // eslint-disable-next-line no-console
      console.error('[ks2-debug-bundle]', JSON.stringify({
        event: 'debug_bundle.section_failed',
        section: label,
        reason: error?.message || String(error),
      }));
    } catch {
      // Swallow — even the error log is best-effort.
    }
    return null;
  }
}

// ---------- Sub-query helpers ----------

function isMissingTable(error, tableName) {
  const msg = String(error?.message || error || '');
  return msg.includes('no such table') && (!tableName || msg.includes(tableName));
}

async function allSafe(db, sql, params, tableName) {
  try {
    return await all(db, sql, params);
  } catch (error) {
    if (tableName && isMissingTable(error, tableName)) return [];
    throw error;
  }
}

async function firstSafe(db, sql, params, tableName) {
  try {
    return await first(db, sql, params);
  } catch (error) {
    if (tableName && isMissingTable(error, tableName)) return null;
    throw error;
  }
}

// ---------- Bundle aggregation ----------

export async function aggregateDebugBundle(db, {
  accountId = null,
  learnerId = null,
  timeFrom = null,
  timeTo = null,
  errorFingerprint = null,
  route = null,
  now = Date.now(),
  buildHash = null,
} = {}) {
  // Default time window: last 24 hours when no explicit range given.
  const effectiveTimeFrom = Number.isFinite(Number(timeFrom))
    ? Number(timeFrom)
    : (now - DEFAULT_TIME_WINDOW_MS);
  const effectiveTimeTo = Number.isFinite(Number(timeTo))
    ? Number(timeTo)
    : now;

  // All sections run in parallel with per-section error boundaries.
  const [
    accountSummary,
    linkedLearners,
    recentErrors,
    errorOccurrences,
    recentDenials,
    recentMutations,
    capacityState,
  ] = await Promise.all([
    // 1. Account summary
    safeSection('accountSummary', async () => {
      if (!accountId) return null;
      const row = await firstSafe(db,
        'SELECT id, email, display_name, platform_role, account_type, created_at, updated_at FROM adult_accounts WHERE id = ?',
        [accountId], 'adult_accounts');
      if (!row) return null;
      return {
        accountId: row.id,
        email: row.email || null,
        displayName: row.display_name || null,
        platformRole: row.platform_role || null,
        accountType: row.account_type || 'real',
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
      };
    }),

    // 2. Linked learners
    safeSection('linkedLearners', async () => {
      if (!accountId) return [];
      const rows = await allSafe(db, `
        SELECT l.id AS learner_id, l.name AS learner_name, l.year_group,
               m.role AS membership_role
        FROM learner_profiles l
        JOIN account_learner_memberships m ON m.learner_id = l.id
        WHERE m.account_id = ?
        ORDER BY l.name ASC
        LIMIT ?
      `, [accountId, BUNDLE_SECTION_LIMIT], 'learner_profiles');
      return rows.map((r) => ({
        learnerId: r.learner_id,
        learnerName: r.learner_name || null,
        yearGroup: r.year_group || null,
        membershipRole: r.membership_role || null,
        accessMode: null,
      }));
    }),

    // 3. Recent errors
    safeSection('recentErrors', async () => {
      const whereClauses = ['last_seen >= ?', 'last_seen <= ?'];
      const whereParams = [effectiveTimeFrom, effectiveTimeTo];
      if (typeof route === 'string' && route) {
        whereClauses.push('route_name LIKE ?');
        whereParams.push(`%${route}%`);
      }
      if (typeof errorFingerprint === 'string' && errorFingerprint) {
        whereClauses.push('fingerprint = ?');
        whereParams.push(errorFingerprint);
      }
      const rows = await allSafe(db, `
        SELECT id, fingerprint, error_kind, message_first_line, first_frame,
               route_name, user_agent, account_id, first_seen, last_seen,
               occurrence_count, status, first_seen_release, last_seen_release,
               resolved_in_release
        FROM ops_error_events
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY last_seen DESC
        LIMIT ?
      `, [...whereParams, BUNDLE_SECTION_LIMIT], 'ops_error_events');
      return rows.map((r) => ({
        id: r.id,
        fingerprint: r.fingerprint,
        errorKind: r.error_kind || null,
        messageFirstLine: r.message_first_line || null,
        firstFrame: r.first_frame || null,
        routeName: r.route_name || null,
        userAgent: r.user_agent || null,
        accountId: r.account_id || null,
        firstSeen: Number(r.first_seen) || 0,
        lastSeen: Number(r.last_seen) || 0,
        occurrenceCount: Number(r.occurrence_count) || 1,
        status: r.status || 'open',
        firstSeenRelease: r.first_seen_release || null,
        lastSeenRelease: r.last_seen_release || null,
        resolvedInRelease: r.resolved_in_release || null,
      }));
    }),

    // 4. Error occurrences (filtered by fingerprint when present)
    safeSection('errorOccurrences', async () => {
      const whereClauses = ['occurred_at >= ?', 'occurred_at <= ?'];
      const whereParams = [effectiveTimeFrom, effectiveTimeTo];
      if (typeof errorFingerprint === 'string' && errorFingerprint) {
        whereClauses.push('event_id = ?');
        whereParams.push(errorFingerprint);
      }
      if (typeof route === 'string' && route) {
        whereClauses.push('route_name LIKE ?');
        whereParams.push(`%${route}%`);
      }
      if (typeof accountId === 'string' && accountId) {
        whereClauses.push('account_id = ?');
        whereParams.push(accountId);
      }
      const rows = await allSafe(db, `
        SELECT id, event_id, occurred_at, release, route_name, account_id, user_agent
        FROM ops_error_event_occurrences
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY occurred_at DESC
        LIMIT ?
      `, [...whereParams, BUNDLE_SECTION_LIMIT], 'ops_error_event_occurrences');
      return rows.map((r) => ({
        id: r.id,
        eventId: r.event_id || null,
        occurredAt: Number(r.occurred_at) || 0,
        release: r.release || null,
        routeName: r.route_name || null,
        accountId: r.account_id || null,
        userAgent: r.user_agent || null,
      }));
    }),

    // 5. Recent denials
    safeSection('recentDenials', async () => {
      const whereClauses = ['denied_at >= ?', 'denied_at <= ?'];
      const whereParams = [effectiveTimeFrom, effectiveTimeTo];
      if (typeof accountId === 'string' && accountId) {
        whereClauses.push('account_id = ?');
        whereParams.push(accountId);
      }
      if (typeof route === 'string' && route) {
        whereClauses.push('route_name LIKE ?');
        whereParams.push(`%${route}%`);
      }
      const rows = await allSafe(db, `
        SELECT id, denied_at, denial_reason, route_name, account_id,
               learner_id, session_id_last8, is_demo, release, detail_json
        FROM admin_request_denials
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY denied_at DESC
        LIMIT ?
      `, [...whereParams, BUNDLE_SECTION_LIMIT], 'admin_request_denials');
      return rows.map((r) => ({
        id: r.id,
        deniedAt: Number(r.denied_at) || 0,
        denialReason: r.denial_reason || null,
        routeName: r.route_name || null,
        accountId: r.account_id || null,
        learnerId: r.learner_id || null,
        sessionIdLast8: r.session_id_last8 || null,
        isDemo: Boolean(r.is_demo),
        release: r.release || null,
      }));
    }),

    // 6. Recent mutations
    safeSection('recentMutations', async () => {
      const whereClauses = ['applied_at >= ?', 'applied_at <= ?'];
      const whereParams = [effectiveTimeFrom, effectiveTimeTo];
      if (typeof accountId === 'string' && accountId) {
        whereClauses.push('account_id = ?');
        whereParams.push(accountId);
      }
      const rows = await allSafe(db, `
        SELECT request_id, mutation_kind, scope_type, scope_id,
               correlation_id, applied_at, account_id
        FROM mutation_receipts
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY applied_at DESC
        LIMIT ?
      `, [...whereParams, BUNDLE_SECTION_LIMIT], 'mutation_receipts');
      return rows.map((r) => ({
        requestId: r.request_id || null,
        mutationKind: r.mutation_kind || null,
        scopeType: r.scope_type || null,
        scopeId: r.scope_id || null,
        correlationId: r.correlation_id || null,
        appliedAt: Number(r.applied_at) || 0,
        accountId: r.account_id || null,
      }));
    }),

    // 7. Capacity state (latest entry from admin_kpi_metrics)
    safeSection('capacityState', async () => {
      const rows = await allSafe(db, `
        SELECT metric_key, metric_count, updated_at
        FROM admin_kpi_metrics
        ORDER BY updated_at DESC
        LIMIT 10
      `, [], 'admin_kpi_metrics');
      return rows.map((r) => ({
        metricKey: r.metric_key || null,
        metricCount: Number(r.metric_count) || 0,
        updatedAt: Number(r.updated_at) || 0,
      }));
    }),
  ]);

  return {
    generatedAt: now,
    query: {
      accountId: accountId || null,
      learnerId: learnerId || null,
      timeFrom: effectiveTimeFrom,
      timeTo: effectiveTimeTo,
      timeFromExplicit: Number.isFinite(Number(timeFrom)),
      timeToExplicit: Number.isFinite(Number(timeTo)),
      errorFingerprint: errorFingerprint || null,
      route: route || null,
    },
    buildHash: buildHash || null,
    accountSummary,
    linkedLearners,
    recentErrors,
    errorOccurrences,
    recentDenials,
    recentMutations,
    capacityState,
  };
}

// ---------- Role-based redaction (R4) ----------

export function redactBundleForRole(bundle, actorRole) {
  if (!bundle || typeof bundle !== 'object') return bundle;

  const isAdmin = actorRole === 'admin';
  const redacted = { ...bundle };

  // Account summary redaction.
  if (redacted.accountSummary) {
    redacted.accountSummary = { ...redacted.accountSummary };
    if (!isAdmin) {
      redacted.accountSummary.email = maskEmail(redacted.accountSummary.email);
      redacted.accountSummary.accountId = maskAccountId(redacted.accountSummary.accountId);
    }
  }

  // Linked learners: ops sees learner IDs masked.
  if (Array.isArray(redacted.linkedLearners)) {
    redacted.linkedLearners = redacted.linkedLearners.map((learner) => {
      if (isAdmin) return learner;
      return {
        ...learner,
        learnerId: maskAccountId(learner.learnerId),
      };
    });
  }

  // Recent errors: ops sees first-frame-only stack, masked accountId.
  if (Array.isArray(redacted.recentErrors)) {
    redacted.recentErrors = redacted.recentErrors.map((err) => {
      if (isAdmin) return err;
      return {
        ...err,
        firstFrame: firstFrame(err.firstFrame),
        accountId: maskAccountId(err.accountId),
        userAgent: null,
      };
    });
  }

  // Error occurrences: ops sees masked accountId.
  if (Array.isArray(redacted.errorOccurrences)) {
    redacted.errorOccurrences = redacted.errorOccurrences.map((occ) => {
      if (isAdmin) return occ;
      return {
        ...occ,
        accountId: maskAccountId(occ.accountId),
        userAgent: null,
      };
    });
  }

  // Denials: ops sees no account/learner linkage.
  if (Array.isArray(redacted.recentDenials)) {
    redacted.recentDenials = redacted.recentDenials.map((denial) => {
      if (isAdmin) return denial;
      return {
        ...denial,
        accountId: null,
        learnerId: null,
        sessionIdLast8: null,
      };
    });
  }

  // Mutations: ops sees masked accountId and scopeId.
  if (Array.isArray(redacted.recentMutations)) {
    redacted.recentMutations = redacted.recentMutations.map((mut) => {
      if (isAdmin) return mut;
      return {
        ...mut,
        accountId: maskAccountId(mut.accountId),
        scopeId: maskAccountId(mut.scopeId),
      };
    });
  }

  // Query params: ops sees masked accountId.
  if (redacted.query) {
    redacted.query = { ...redacted.query };
    if (!isAdmin) {
      redacted.query.accountId = maskAccountId(redacted.query.accountId);
      redacted.query.learnerId = maskAccountId(redacted.query.learnerId);
    }
  }

  return redacted;
}

// ---------- Human-readable summary ----------

export function buildHumanSummary(bundle) {
  if (!bundle || typeof bundle !== 'object') return 'No bundle data available.';

  const lines = [];
  lines.push(`Debug Bundle — generated ${new Date(bundle.generatedAt).toISOString()}`);
  if (bundle.buildHash) lines.push(`Build: ${bundle.buildHash}`);
  lines.push('');

  // Query context.
  if (bundle.query) {
    lines.push('--- Query Context ---');
    if (bundle.query.accountId) lines.push(`Account: ${bundle.query.accountId}`);
    if (bundle.query.learnerId) lines.push(`Learner: ${bundle.query.learnerId}`);
    lines.push(`Time window: ${new Date(bundle.query.timeFrom).toISOString()} to ${new Date(bundle.query.timeTo).toISOString()}`);
    if (bundle.query.errorFingerprint) lines.push(`Error fingerprint: ${bundle.query.errorFingerprint}`);
    if (bundle.query.route) lines.push(`Route filter: ${bundle.query.route}`);
    lines.push('');
  }

  // Account summary.
  if (bundle.accountSummary) {
    lines.push('--- Account Summary ---');
    lines.push(`ID: ${bundle.accountSummary.accountId || 'unknown'}`);
    lines.push(`Email: ${bundle.accountSummary.email || 'unknown'}`);
    lines.push(`Role: ${bundle.accountSummary.platformRole || 'unknown'}`);
    lines.push(`Type: ${bundle.accountSummary.accountType || 'unknown'}`);
    lines.push('');
  } else {
    lines.push('--- Account Summary ---');
    lines.push('No account data found.');
    lines.push('');
  }

  // Learners.
  const learners = Array.isArray(bundle.linkedLearners) ? bundle.linkedLearners : [];
  lines.push(`--- Linked Learners (${learners.length}) ---`);
  if (learners.length === 0) lines.push('None');
  for (const l of learners) {
    lines.push(`  ${l.learnerName || 'unnamed'} (${l.learnerId}) — ${l.yearGroup || '?'} / ${l.membershipRole || '?'}`);
  }
  lines.push('');

  // Errors.
  const errors = Array.isArray(bundle.recentErrors) ? bundle.recentErrors : [];
  lines.push(`--- Recent Errors (${errors.length}) ---`);
  if (errors.length === 0) lines.push('None in time window.');
  for (const e of errors) {
    lines.push(`  [${e.status}] ${e.errorKind || 'Error'}: ${e.messageFirstLine || '?'} (x${e.occurrenceCount})`);
  }
  lines.push('');

  // Occurrences.
  const occs = Array.isArray(bundle.errorOccurrences) ? bundle.errorOccurrences : [];
  lines.push(`--- Error Occurrences (${occs.length}) ---`);
  if (occs.length === 0) lines.push('None in time window.');
  for (const o of occs) {
    lines.push(`  ${new Date(o.occurredAt).toISOString()} — ${o.routeName || '?'} (${o.release || 'unknown release'})`);
  }
  lines.push('');

  // Denials.
  const denials = Array.isArray(bundle.recentDenials) ? bundle.recentDenials : [];
  lines.push(`--- Recent Denials (${denials.length}) ---`);
  if (denials.length === 0) lines.push('None in time window.');
  for (const d of denials) {
    lines.push(`  ${new Date(d.deniedAt).toISOString()} — ${d.denialReason || '?'} on ${d.routeName || '?'}`);
  }
  lines.push('');

  // Mutations.
  const muts = Array.isArray(bundle.recentMutations) ? bundle.recentMutations : [];
  lines.push(`--- Recent Mutations (${muts.length}) ---`);
  if (muts.length === 0) lines.push('None in time window.');
  for (const m of muts) {
    lines.push(`  ${new Date(m.appliedAt).toISOString()} — ${m.mutationKind || '?'} (${m.scopeType || '?'}:${m.scopeId || '?'})`);
  }
  lines.push('');

  // Capacity.
  const caps = Array.isArray(bundle.capacityState) ? bundle.capacityState : [];
  lines.push(`--- Capacity Metrics (${caps.length}) ---`);
  if (caps.length === 0) lines.push('No metrics recorded.');
  for (const c of caps) {
    lines.push(`  ${c.metricKey}: ${c.metricCount}`);
  }

  return lines.join('\n');
}
