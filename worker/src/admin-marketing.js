// U11: Marketing / Live Ops V0 — backend lifecycle state machine.
//
// Safe V0 marketing/live-ops system. Admins can create, preview, schedule,
// publish, pause, and archive announcements and maintenance banners.
// Client runtime receives only active, safe fields.
//
// State machine: draft → scheduled → published → paused → archived
// Also: scheduled → draft (unschedule), paused → published (unpause),
//        draft → archived (skip publish).
//
// CRITICAL — body_text server-side validation (security):
//   Allowed Markdown: **bold**, *italic*, [link text](url)
//   Link href scheme allowlist: https: ONLY
//   Blocked: javascript:, data:, mailto:, vbscript:, protocol-relative //
//   Any < or > character in body_text REJECTED (no raw HTML)
//   This is the primary XSS gate.

import { uid } from '../../src/platform/core/utils.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from './errors.js';
import {
  MARKETING_INVALID_TRANSITION,
  MARKETING_BROAD_PUBLISH_UNCONFIRMED,
  MARKETING_UNSAFE_LINK_SCHEME,
  MARKETING_BODY_CONTAINS_HTML,
  MARKETING_MAINTENANCE_REQUIRES_ENDS_AT,
  MARKETING_MESSAGE_STALE,
} from './error-codes.js';
import {
  all,
  batch,
  bindStatement,
  first,
  run,
} from './d1.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MESSAGE_TYPES = new Set(['announcement', 'maintenance']);
const STATUS_VALUES = new Set(['draft', 'scheduled', 'published', 'paused', 'archived']);
const SEVERITY_TOKENS = new Set(['info', 'warning']);
const AUDIENCE_VALUES = new Set(['internal', 'demo', 'all_signed_in']);

const MARKETING_MUTATION_KIND = 'admin.marketing_message';

const VALID_TRANSITIONS = new Map([
  ['draft', new Set(['scheduled', 'archived'])],
  ['scheduled', new Set(['published', 'draft'])],
  ['published', new Set(['paused', 'archived'])],
  ['paused', new Set(['published', 'archived'])],
]);

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 4000;

function isMissingMarketingMessagesTableError(error) {
  return /no such table:\s*admin_marketing_messages\b/i.test(String(error?.message || ''));
}

// ---------------------------------------------------------------------------
// body_text validation (XSS gate)
// ---------------------------------------------------------------------------

// Reject any raw HTML angle brackets.
function containsHtmlTags(text) {
  return /<|>/.test(text);
}

// Extract all markdown link hrefs and validate scheme.
// Matches [text](url) patterns — standard markdown links.
const MARKDOWN_LINK_RE = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
const ALLOWED_SCHEMES = new Set(['https:']);
// Explicitly blocked schemes (for error messaging).
const BLOCKED_SCHEME_RE = /^(javascript|data|mailto|vbscript):/i;

function validateBodyText(bodyText) {
  if (typeof bodyText !== 'string') {
    throw new BadRequestError('body_text is required and must be a string.', {
      code: 'validation_failed',
      field: 'body_text',
    });
  }
  if (bodyText.length > BODY_MAX_LENGTH) {
    throw new BadRequestError(`body_text exceeds the ${BODY_MAX_LENGTH} character limit.`, {
      code: 'validation_failed',
      field: 'body_text',
    });
  }

  if (containsHtmlTags(bodyText)) {
    throw new BadRequestError('body_text must not contain HTML tags (< or > characters).', {
      code: MARKETING_BODY_CONTAINS_HTML,
      field: 'body_text',
    });
  }

  // Validate every markdown link href.
  let match;
  const linkRe = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags);
  while ((match = linkRe.exec(bodyText)) !== null) {
    const href = match[1].trim();
    // Protocol-relative URLs (//example.com) are blocked.
    if (href.startsWith('//')) {
      throw new BadRequestError('body_text contains a protocol-relative link which is not allowed.', {
        code: MARKETING_UNSAFE_LINK_SCHEME,
        field: 'body_text',
        href,
      });
    }
    if (BLOCKED_SCHEME_RE.test(href)) {
      throw new BadRequestError('body_text contains a link with a disallowed scheme.', {
        code: MARKETING_UNSAFE_LINK_SCHEME,
        field: 'body_text',
        href,
      });
    }
    // If it looks like a scheme (has ":"), enforce the allowlist.
    const colonIndex = href.indexOf(':');
    if (colonIndex > 0) {
      const scheme = href.slice(0, colonIndex + 1).toLowerCase();
      if (!ALLOWED_SCHEMES.has(scheme)) {
        throw new BadRequestError('body_text contains a link with a disallowed scheme. Only https: is permitted.', {
          code: MARKETING_UNSAFE_LINK_SCHEME,
          field: 'body_text',
          href,
        });
      }
    }
  }

  return bodyText;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseExpectedRowVersion(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new BadRequestError('Expected row version must be a non-negative integer.', {
      code: 'validation_failed',
      field: 'expectedRowVersion',
    });
  }
  return numeric;
}

function requireAdminRole(actor) {
  if (!actor || actor.account_type === 'demo') {
    throw new ForbiddenError('Marketing message management requires an admin account.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin',
    });
  }
  const role = (actor.platform_role || 'parent').toLowerCase();
  if (role !== 'admin') {
    throw new ForbiddenError('Marketing message management requires an admin account.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin',
    });
  }
}

function requireAdminOrOpsRole(actor) {
  if (!actor || actor.account_type === 'demo') {
    throw new ForbiddenError('Admin or operations access denied.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
  const role = (actor.platform_role || 'parent').toLowerCase();
  if (role !== 'admin' && role !== 'ops') {
    throw new ForbiddenError('Admin or operations access denied.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
}

async function loadActor(db, accountId) {
  return first(
    db,
    'SELECT id, email, display_name, platform_role, account_type FROM adult_accounts WHERE id = ?',
    [accountId],
  );
}

function validateMessageFields(body) {
  const fields = {};

  // title
  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new BadRequestError('title is required and must be a non-empty string.', {
        code: 'validation_failed',
        field: 'title',
      });
    }
    if (body.title.length > TITLE_MAX_LENGTH) {
      throw new BadRequestError(`title exceeds the ${TITLE_MAX_LENGTH} character limit.`, {
        code: 'validation_failed',
        field: 'title',
      });
    }
    fields.title = body.title.trim();
  }

  // body_text
  if (Object.prototype.hasOwnProperty.call(body, 'body_text')) {
    fields.body_text = validateBodyText(body.body_text);
  }

  // message_type
  if (Object.prototype.hasOwnProperty.call(body, 'message_type')) {
    if (!MESSAGE_TYPES.has(body.message_type)) {
      throw new BadRequestError('message_type must be "announcement" or "maintenance".', {
        code: 'validation_failed',
        field: 'message_type',
        allowed: [...MESSAGE_TYPES],
      });
    }
    fields.message_type = body.message_type;
  }

  // severity_token
  if (Object.prototype.hasOwnProperty.call(body, 'severity_token')) {
    if (!SEVERITY_TOKENS.has(body.severity_token)) {
      throw new BadRequestError('severity_token must be "info" or "warning".', {
        code: 'validation_failed',
        field: 'severity_token',
        allowed: [...SEVERITY_TOKENS],
      });
    }
    fields.severity_token = body.severity_token;
  }

  // audience
  if (Object.prototype.hasOwnProperty.call(body, 'audience')) {
    if (!AUDIENCE_VALUES.has(body.audience)) {
      throw new BadRequestError('audience must be "internal", "demo", or "all_signed_in".', {
        code: 'validation_failed',
        field: 'audience',
        allowed: [...AUDIENCE_VALUES],
      });
    }
    fields.audience = body.audience;
  }

  // starts_at / ends_at (epoch ms integers or null)
  if (Object.prototype.hasOwnProperty.call(body, 'starts_at')) {
    if (body.starts_at !== null && !Number.isInteger(body.starts_at)) {
      throw new BadRequestError('starts_at must be an integer (epoch ms) or null.', {
        code: 'validation_failed',
        field: 'starts_at',
      });
    }
    fields.starts_at = body.starts_at;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'ends_at')) {
    if (body.ends_at !== null && !Number.isInteger(body.ends_at)) {
      throw new BadRequestError('ends_at must be an integer (epoch ms) or null.', {
        code: 'validation_failed',
        field: 'ends_at',
      });
    }
    fields.ends_at = body.ends_at;
  }

  return fields;
}

function normaliseMutationEnvelope(rawMutation) {
  const raw = isPlainObject(rawMutation) ? rawMutation : {};
  const requestId = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : null;
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId
    ? raw.correlationId
    : requestId;
  if (!requestId) {
    throw new BadRequestError('Mutation requestId is required.', {
      code: 'mutation_request_id_required',
    });
  }
  return { requestId, correlationId };
}

function mutationReceiptStatement(db, {
  accountId,
  requestId,
  scopeType,
  scopeId,
  mutationKind,
  requestHash,
  response,
  statusCode = 200,
  correlationId = null,
  appliedAt,
}) {
  return bindStatement(db, `
    INSERT INTO mutation_receipts (
      account_id,
      request_id,
      scope_type,
      scope_id,
      mutation_kind,
      request_hash,
      response_json,
      status_code,
      correlation_id,
      applied_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    accountId,
    requestId,
    scopeType,
    scopeId,
    mutationKind,
    requestHash,
    JSON.stringify(response),
    statusCode,
    correlationId,
    appliedAt,
  ]);
}

function stableStringify(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(stableStringify));
  if (isPlainObject(value)) {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .reduce((o, k) => { o[k] = value[k]; return o; }, {}),
    );
  }
  return JSON.stringify(value);
}

function mutationPayloadHash(kind, payload) {
  return stableStringify({ kind, payload });
}

// ---------------------------------------------------------------------------
// Safe field projection for public/ops delivery
// ---------------------------------------------------------------------------

function safeMessageFields(row) {
  return {
    title: row.title,
    body_text: row.body_text,
    severity_token: row.severity_token,
    message_type: row.message_type,
    starts_at: row.starts_at != null ? Number(row.starts_at) : null,
    ends_at: row.ends_at != null ? Number(row.ends_at) : null,
  };
}

function adminMessageFields(row) {
  return {
    id: row.id,
    message_type: row.message_type,
    status: row.status,
    title: row.title,
    body_text: row.body_text,
    severity_token: row.severity_token,
    audience: row.audience,
    starts_at: row.starts_at != null ? Number(row.starts_at) : null,
    ends_at: row.ends_at != null ? Number(row.ends_at) : null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    published_by: row.published_by || null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    published_at: row.published_at != null ? Number(row.published_at) : null,
    row_version: Number(row.row_version),
  };
}

// ---------------------------------------------------------------------------
// Maintenance + all_signed_in enforcement
// ---------------------------------------------------------------------------

function requireMaintenanceEndsAt(messageType, audience, endsAt, nowTs) {
  if (messageType === 'maintenance' && audience === 'all_signed_in') {
    if (endsAt == null) {
      throw new BadRequestError(
        'Maintenance messages with audience "all_signed_in" require a non-null future ends_at to prevent indefinite-blocking banners.',
        { code: MARKETING_MAINTENANCE_REQUIRES_ENDS_AT },
      );
    }
    if (endsAt <= nowTs) {
      throw new BadRequestError(
        'Maintenance messages with audience "all_signed_in" require ends_at to be in the future.',
        { code: MARKETING_MAINTENANCE_REQUIRES_ENDS_AT },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CRUD + lifecycle
// ---------------------------------------------------------------------------

export async function createMarketingMessage(db, { actorAccountId, body, nowTs }) {
  const actor = await loadActor(db, actorAccountId);
  requireAdminRole(actor);

  const validated = validateMessageFields(body);
  if (!validated.title) {
    throw new BadRequestError('title is required.', { code: 'validation_failed', field: 'title' });
  }
  if (!Object.prototype.hasOwnProperty.call(validated, 'body_text')) {
    throw new BadRequestError('body_text is required.', { code: 'validation_failed', field: 'body_text' });
  }

  const messageType = validated.message_type || 'announcement';
  const audience = validated.audience || 'internal';
  const endsAt = validated.ends_at !== undefined ? validated.ends_at : null;

  // Maintenance + all_signed_in requires ends_at
  requireMaintenanceEndsAt(messageType, audience, endsAt, nowTs);

  const id = uid();
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();

  await run(db, `
    INSERT INTO admin_marketing_messages (
      id, message_type, status, title, body_text, severity_token,
      audience, starts_at, ends_at,
      created_by, updated_by, created_at, updated_at, row_version
    )
    VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [
    id,
    messageType,
    validated.title,
    validated.body_text,
    validated.severity_token || 'info',
    audience,
    validated.starts_at !== undefined ? validated.starts_at : null,
    endsAt,
    actorAccountId,
    actorAccountId,
    ts,
    ts,
  ]);

  const row = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [id]);
  return { message: adminMessageFields(row) };
}

export async function updateMarketingMessage(db, { actorAccountId, messageId, body, expectedRowVersion, nowTs }) {
  const actor = await loadActor(db, actorAccountId);
  requireAdminRole(actor);

  // ADV-U11-002: CAS guard — require expectedRowVersion to prevent silent
  // overwrites from concurrent editors.
  const normalisedRowVersion = normaliseExpectedRowVersion(expectedRowVersion);
  if (normalisedRowVersion === null) {
    throw new BadRequestError('expectedRowVersion is required for message updates.', {
      code: 'validation_failed',
      field: 'expectedRowVersion',
    });
  }

  const row = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
  if (!row) {
    throw new NotFoundError('Marketing message not found.', { code: 'not_found', messageId });
  }

  // Only draft messages can be field-edited.
  if (row.status !== 'draft') {
    throw new BadRequestError('Only draft messages can be edited. Transition to draft first.', {
      code: 'validation_failed',
      status: row.status,
    });
  }

  // Pre-check CAS — fast rejection before composing the UPDATE.
  const currentRowVersion = Number(row.row_version) || 0;
  if (currentRowVersion !== normalisedRowVersion) {
    throw new ConflictError('Marketing message was updated by another session. Reload and retry.', {
      code: MARKETING_MESSAGE_STALE,
      messageId,
      expectedRowVersion: normalisedRowVersion,
      currentRowVersion,
    });
  }

  const validated = validateMessageFields(body);
  if (Object.keys(validated).length === 0) {
    throw new BadRequestError('At least one field to update is required.', {
      code: 'validation_failed',
    });
  }

  const messageType = validated.message_type !== undefined ? validated.message_type : row.message_type;
  const audience = validated.audience !== undefined ? validated.audience : row.audience;
  const endsAt = validated.ends_at !== undefined ? validated.ends_at : row.ends_at;

  requireMaintenanceEndsAt(messageType, audience, endsAt, nowTs);

  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(validated)) {
    setClauses.push(`${key} = ?`);
    params.push(value);
  }
  setClauses.push('updated_by = ?');
  params.push(actorAccountId);
  setClauses.push('updated_at = ?');
  params.push(nowTs);
  setClauses.push('row_version = row_version + 1');

  params.push(messageId);
  params.push(normalisedRowVersion);

  const result = await run(db, `
    UPDATE admin_marketing_messages
    SET ${setClauses.join(', ')}
    WHERE id = ? AND row_version = ?
  `, params);

  // Post-run CAS check — if a concurrent write bumped row_version between
  // the SELECT and the UPDATE, zero rows are affected.
  const updateChanges = Math.max(0, Number(result?.meta?.changes) || 0);
  if (updateChanges !== 1) {
    const postRow = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
    const postRowVersion = Math.max(0, Number(postRow?.row_version) || 0);
    throw new ConflictError('Marketing message was updated by another session. Reload and retry.', {
      code: MARKETING_MESSAGE_STALE,
      messageId,
      expectedRowVersion: normalisedRowVersion,
      currentRowVersion: postRowVersion,
    });
  }

  const updated = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
  return { message: adminMessageFields(updated) };
}

export async function transitionMarketingMessage(db, {
  actorAccountId,
  messageId,
  action,
  expectedRowVersion,
  confirmBroadPublish = false,
  mutation,
  nowTs,
}) {
  const actor = await loadActor(db, actorAccountId);
  requireAdminRole(actor);

  const { requestId, correlationId } = normaliseMutationEnvelope(mutation);
  const normalisedRowVersion = normaliseExpectedRowVersion(expectedRowVersion);

  if (normalisedRowVersion === null) {
    throw new BadRequestError('expectedRowVersion is required for lifecycle transitions.', {
      code: 'validation_failed',
      field: 'expectedRowVersion',
    });
  }

  if (typeof action !== 'string' || !STATUS_VALUES.has(action)) {
    throw new BadRequestError('action must be a valid target status.', {
      code: 'validation_failed',
      field: 'action',
      allowed: [...STATUS_VALUES],
    });
  }

  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const requestHash = mutationPayloadHash(MARKETING_MUTATION_KIND, {
    messageId,
    action,
    expectedRowVersion: normalisedRowVersion,
  });

  // Idempotency preflight — replay-safe without relying on savepoints.
  // Placed BEFORE the CAS check because a successful replay carries the
  // original expectedRowVersion which no longer matches the bumped DB
  // row_version. The receipt hash still covers the full payload including
  // expectedRowVersion so a different payload reuse is caught.
  const existingReceipt = await first(db, `
    SELECT request_id, request_hash, response_json
    FROM mutation_receipts
    WHERE account_id = ? AND request_id = ?
  `, [actorAccountId, requestId]);

  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw new ConflictError('The same mutation request id was reused for a different payload.', {
        code: 'idempotency_reuse',
        requestId,
      });
    }
    const stored = JSON.parse(existingReceipt.response_json || '{}');
    const currentRow = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [stored.messageId]);
    return {
      ...stored,
      message: currentRow ? adminMessageFields(currentRow) : null,
      mutation: { requestId, correlationId, replayed: true },
    };
  }

  const row = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
  if (!row) {
    throw new NotFoundError('Marketing message not found.', { code: 'not_found', messageId });
  }

  // CAS check
  const currentRowVersion = Number(row.row_version) || 0;
  if (currentRowVersion !== normalisedRowVersion) {
    throw new ConflictError('Marketing message was updated by another session. Reload and retry.', {
      code: MARKETING_MESSAGE_STALE,
      messageId,
      expectedRowVersion: normalisedRowVersion,
      currentRowVersion,
    });
  }

  // Validate the transition
  const currentStatus = row.status;
  const allowedTargets = VALID_TRANSITIONS.get(currentStatus);
  if (!allowedTargets || !allowedTargets.has(action)) {
    throw new BadRequestError(`Cannot transition from "${currentStatus}" to "${action}".`, {
      code: MARKETING_INVALID_TRANSITION,
      currentStatus,
      requestedStatus: action,
      allowed: allowedTargets ? [...allowedTargets] : [],
    });
  }

  // Broad publish confirmation gate
  if ((action === 'published' || action === 'scheduled') && row.audience === 'all_signed_in' && !confirmBroadPublish) {
    throw new BadRequestError('Publishing to all_signed_in requires confirmBroadPublish: true.', {
      code: MARKETING_BROAD_PUBLISH_UNCONFIRMED,
      audience: row.audience,
    });
  }

  // Maintenance + all_signed_in requires future ends_at for publish or schedule
  if (action === 'published' || action === 'scheduled') {
    requireMaintenanceEndsAt(row.message_type, row.audience, row.ends_at, nowTs);
  }

  // Build the transition
  const isPublish = action === 'published' && currentStatus !== 'published';
  const updateStmt = bindStatement(db, `
    UPDATE admin_marketing_messages
    SET status = ?,
        updated_by = ?,
        updated_at = ?,
        published_by = CASE WHEN ? THEN ? ELSE published_by END,
        published_at = CASE WHEN ? THEN ? ELSE published_at END,
        row_version = row_version + 1
    WHERE id = ? AND row_version = ?
  `, [
    action,
    actorAccountId,
    ts,
    isPublish ? 1 : 0,
    isPublish ? actorAccountId : null,
    isPublish ? 1 : 0,
    isPublish ? ts : null,
    messageId,
    normalisedRowVersion,
  ]);

  const response = {
    messageId,
    previousStatus: currentStatus,
    newStatus: action,
  };

  const receiptStmt = mutationReceiptStatement(db, {
    accountId: actorAccountId,
    requestId,
    scopeType: 'platform',
    scopeId: `marketing-message:${messageId}`,
    mutationKind: MARKETING_MUTATION_KIND,
    requestHash,
    response,
    statusCode: 200,
    correlationId,
    appliedAt: ts,
  });

  const batchResult = await batch(db, [updateStmt, receiptStmt]);

  // ADV-U11-001: post-batch CAS guard. If a concurrent request bumped
  // row_version between the pre-check SELECT and the batch, the UPDATE
  // WHERE id = ? AND row_version = ? matches zero rows. The receipt INSERT
  // already committed but is harmless — the authoritative signal is the
  // UPDATE's meta.changes. Mirrors the account_ops_metadata pattern at
  // repository.js:3736-3750.
  const updateChanges = Math.max(0, Number(batchResult?.[0]?.meta?.changes) || 0);
  if (updateChanges !== 1) {
    const postBatchRow = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
    const postBatchRowVersion = Math.max(0, Number(postBatchRow?.row_version) || 0);
    throw new ConflictError('Marketing message was updated by another session between pre-check and batch. Reload and retry.', {
      code: MARKETING_MESSAGE_STALE,
      messageId,
      expectedRowVersion: normalisedRowVersion,
      currentRowVersion: postBatchRowVersion,
    });
  }

  const updated = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
  return {
    ...response,
    message: adminMessageFields(updated),
    mutation: { requestId, correlationId, replayed: false },
  };
}

// ---------------------------------------------------------------------------
// Read routes
// ---------------------------------------------------------------------------

export async function listMarketingMessages(db, { actorAccountId }) {
  const actor = await loadActor(db, actorAccountId);
  requireAdminOrOpsRole(actor);

  const role = (actor.platform_role || '').toLowerCase();

  let rows;
  try {
    if (role === 'admin') {
      // Admin sees all messages
      rows = await all(db, `
        SELECT * FROM admin_marketing_messages
        ORDER BY updated_at DESC
      `);
    } else {
      // Ops sees only published + scheduled
      rows = await all(db, `
        SELECT * FROM admin_marketing_messages
        WHERE status IN ('published', 'scheduled')
        ORDER BY updated_at DESC
      `);
    }
  } catch (error) {
    if (isMissingMarketingMessagesTableError(error)) {
      return { messages: [] };
    }
    throw error;
  }

  return { messages: rows.map(adminMessageFields), schedulingSemantics: 'manual_publish_required' };
}

export async function getMarketingMessage(db, { actorAccountId, messageId }) {
  const actor = await loadActor(db, actorAccountId);
  requireAdminOrOpsRole(actor);

  let row;
  try {
    row = await first(db, 'SELECT * FROM admin_marketing_messages WHERE id = ?', [messageId]);
  } catch (error) {
    if (isMissingMarketingMessagesTableError(error)) {
      throw new NotFoundError('Marketing message not found.', { code: 'not_found', messageId });
    }
    throw error;
  }
  if (!row) {
    throw new NotFoundError('Marketing message not found.', { code: 'not_found', messageId });
  }

  // ADV-U11-008: ops users can only see published or scheduled messages via
  // the detail endpoint, matching the list-level restriction. Drafts,
  // paused, and archived messages are admin-only.
  const role = (actor.platform_role || '').toLowerCase();
  if (role === 'ops' && row.status !== 'published' && row.status !== 'scheduled') {
    throw new NotFoundError('Marketing message not found.', { code: 'not_found', messageId });
  }

  return { message: adminMessageFields(row), schedulingSemantics: 'manual_publish_required' };
}

// Public-facing active messages — any authenticated user.
// Returns only published messages within the starts_at <= now <= ends_at window.
// Safe fields only.
export async function listActiveMessages(db, { nowTs }) {
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();

  // ADV-U11-003: filter by audience = 'all_signed_in' so internal and demo
  // audience messages are only visible in the admin list view, never in
  // the public client delivery endpoint.
  let rows;
  try {
    rows = await all(db, `
      SELECT * FROM admin_marketing_messages
      WHERE status = 'published'
        AND audience = 'all_signed_in'
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at >= ?)
      ORDER BY created_at DESC
    `, [ts, ts]);
  } catch (error) {
    if (isMissingMarketingMessagesTableError(error)) {
      return { messages: [] };
    }
    throw error;
  }

  return { messages: rows.map(safeMessageFields) };
}
