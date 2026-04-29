// U6 (P7): Support Incident Schema and Worker Module.
//
// Standalone module: accepts `db`, no imports from `repository.js`.
// Uses `batch()` for CAS mutations (NEVER `withTransaction`).
// Uses mutation receipts for idempotency.
//
// Status transitions:
//   open → investigating → waiting_on_parent → resolved | ignored
//   Any status → resolved | ignored (shortcut close).
//
// CAS pattern: UPDATE SET ... row_version = row_version + 1
//   WHERE id = ? AND row_version = ?
//   Check meta.changes after batch to detect conflict (409 if 0 changes).

import {
  all,
  batch,
  bindStatement,
  first,
} from './d1.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCIDENT_STATUSES = new Set(['open', 'investigating', 'waiting_on_parent', 'resolved', 'ignored']);
const TERMINAL_STATUSES = new Set(['resolved', 'ignored']);
const LINK_TYPES = new Set(['error_event', 'error_fingerprint', 'denial', 'marketing_message', 'account', 'learner']);
const NOTE_AUDIENCES = new Set(['admin_only', 'ops_safe']);

// Linear progression plus shortcut-close to terminal.
const VALID_TRANSITIONS = new Map([
  ['open', new Set(['investigating', 'resolved', 'ignored'])],
  ['investigating', new Set(['waiting_on_parent', 'resolved', 'ignored'])],
  ['waiting_on_parent', new Set(['resolved', 'ignored'])],
]);

const TITLE_MAX_LENGTH = 300;
const NOTE_MAX_LENGTH = 8000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMissingIncidentsTableError(error) {
  return /no such table:\s*admin_support_incidents\b/i.test(String(error?.message || ''));
}

function validateTransition(currentStatus, targetStatus) {
  if (TERMINAL_STATUSES.has(currentStatus)) {
    throw new BadRequestError(`Incident is already "${currentStatus}" and cannot transition further.`, {
      code: 'incident_invalid_transition',
      currentStatus,
      requestedStatus: targetStatus,
    });
  }
  const allowed = VALID_TRANSITIONS.get(currentStatus);
  if (!allowed || !allowed.has(targetStatus)) {
    throw new BadRequestError(`Cannot transition from "${currentStatus}" to "${targetStatus}".`, {
      code: 'incident_invalid_transition',
      currentStatus,
      requestedStatus: targetStatus,
      allowed: allowed ? [...allowed] : [],
    });
  }
}

// ---------------------------------------------------------------------------
// createIncident
// ---------------------------------------------------------------------------

export async function createIncident(db, { title, accountId, learnerId, createdBy, idempotencyKey }) {
  if (typeof title !== 'string' || !title.trim()) {
    throw new BadRequestError('title is required and must be a non-empty string.', {
      code: 'validation_failed',
      field: 'title',
    });
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw new BadRequestError(`title exceeds the ${TITLE_MAX_LENGTH} character limit.`, {
      code: 'validation_failed',
      field: 'title',
    });
  }
  if (typeof createdBy !== 'string' || !createdBy) {
    throw new BadRequestError('createdBy is required.', {
      code: 'validation_failed',
      field: 'createdBy',
    });
  }

  // Idempotency: check if an incident with the same idempotency key exists.
  if (idempotencyKey) {
    const existing = await first(db, `
      SELECT id, status, title, created_by, assigned_to, account_id, learner_id,
             created_at, updated_at, resolved_at, row_version
      FROM admin_support_incidents
      WHERE id = ?
    `, [idempotencyKey]);
    if (existing) {
      return { incident: normaliseIncidentRow(existing), replayed: true };
    }
  }

  const id = idempotencyKey || crypto.randomUUID();
  const now = Date.now();

  await first(db, `
    INSERT INTO admin_support_incidents (id, status, title, created_by, account_id, learner_id, created_at, updated_at, row_version)
    VALUES (?, 'open', ?, ?, ?, ?, ?, ?, 0)
  `, [id, title.trim(), createdBy, accountId || null, learnerId || null, now, now]);

  const row = await first(db, 'SELECT * FROM admin_support_incidents WHERE id = ?', [id]);
  return { incident: normaliseIncidentRow(row), replayed: false };
}

// ---------------------------------------------------------------------------
// updateIncidentStatus
// ---------------------------------------------------------------------------

export async function updateIncidentStatus(db, { id, status, rowVersion, updatedBy }) {
  if (typeof id !== 'string' || !id) {
    throw new BadRequestError('id is required.', { code: 'validation_failed', field: 'id' });
  }
  if (!INCIDENT_STATUSES.has(status)) {
    throw new BadRequestError(`status must be one of: ${[...INCIDENT_STATUSES].join(', ')}`, {
      code: 'validation_failed',
      field: 'status',
      allowed: [...INCIDENT_STATUSES],
    });
  }
  if (typeof rowVersion !== 'number' || !Number.isInteger(rowVersion) || rowVersion < 0) {
    throw new BadRequestError('rowVersion must be a non-negative integer.', {
      code: 'validation_failed',
      field: 'rowVersion',
    });
  }

  const existing = await first(db, 'SELECT * FROM admin_support_incidents WHERE id = ?', [id]);
  if (!existing) {
    throw new NotFoundError('Incident not found.', { code: 'incident_not_found', id });
  }

  validateTransition(existing.status, status);

  const now = Date.now();
  const resolvedAt = TERMINAL_STATUSES.has(status) ? now : null;

  const updateStmt = bindStatement(db, `
    UPDATE admin_support_incidents
    SET status = ?, updated_at = ?, resolved_at = COALESCE(?, resolved_at), row_version = row_version + 1
    WHERE id = ? AND row_version = ?
  `, [status, now, resolvedAt, id, rowVersion]);

  const batchResult = await batch(db, [updateStmt]);

  const updateChanges = Math.max(0, Number(batchResult?.[0]?.meta?.changes) || 0);
  if (updateChanges !== 1) {
    const postRow = await first(db, 'SELECT row_version FROM admin_support_incidents WHERE id = ?', [id]);
    throw new ConflictError('Incident was updated by another session. Reload and retry.', {
      code: 'incident_cas_conflict',
      id,
      expectedRowVersion: rowVersion,
      currentRowVersion: Number(postRow?.row_version) || 0,
    });
  }

  const updated = await first(db, 'SELECT * FROM admin_support_incidents WHERE id = ?', [id]);
  return { incident: normaliseIncidentRow(updated) };
}

// ---------------------------------------------------------------------------
// addIncidentNote
// ---------------------------------------------------------------------------

export async function addIncidentNote(db, { incidentId, authorId, noteText, audience }) {
  if (typeof incidentId !== 'string' || !incidentId) {
    throw new BadRequestError('incidentId is required.', { code: 'validation_failed', field: 'incidentId' });
  }
  if (typeof authorId !== 'string' || !authorId) {
    throw new BadRequestError('authorId is required.', { code: 'validation_failed', field: 'authorId' });
  }
  if (typeof noteText !== 'string' || !noteText.trim()) {
    throw new BadRequestError('noteText is required and must be non-empty.', { code: 'validation_failed', field: 'noteText' });
  }
  if (noteText.length > NOTE_MAX_LENGTH) {
    throw new BadRequestError(`noteText exceeds the ${NOTE_MAX_LENGTH} character limit.`, { code: 'validation_failed', field: 'noteText' });
  }
  const effectiveAudience = audience || 'admin_only';
  if (!NOTE_AUDIENCES.has(effectiveAudience)) {
    throw new BadRequestError(`audience must be one of: ${[...NOTE_AUDIENCES].join(', ')}`, {
      code: 'validation_failed',
      field: 'audience',
      allowed: [...NOTE_AUDIENCES],
    });
  }

  // Verify incident exists
  const incident = await first(db, 'SELECT id FROM admin_support_incidents WHERE id = ?', [incidentId]);
  if (!incident) {
    throw new NotFoundError('Incident not found.', { code: 'incident_not_found', id: incidentId });
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await first(db, `
    INSERT INTO admin_support_incident_notes (id, incident_id, author_id, note_text, audience, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, incidentId, authorId, noteText.trim(), effectiveAudience, now]);

  return {
    note: { id, incidentId, authorId, noteText: noteText.trim(), audience: effectiveAudience, createdAt: now },
  };
}

// ---------------------------------------------------------------------------
// addIncidentLink
// ---------------------------------------------------------------------------

export async function addIncidentLink(db, { incidentId, linkType, linkTargetId }) {
  if (typeof incidentId !== 'string' || !incidentId) {
    throw new BadRequestError('incidentId is required.', { code: 'validation_failed', field: 'incidentId' });
  }
  if (!LINK_TYPES.has(linkType)) {
    throw new BadRequestError(`linkType must be one of: ${[...LINK_TYPES].join(', ')}`, {
      code: 'validation_failed',
      field: 'linkType',
      allowed: [...LINK_TYPES],
    });
  }
  if (typeof linkTargetId !== 'string' || !linkTargetId) {
    throw new BadRequestError('linkTargetId is required.', { code: 'validation_failed', field: 'linkTargetId' });
  }

  // Verify incident exists
  const incident = await first(db, 'SELECT id FROM admin_support_incidents WHERE id = ?', [incidentId]);
  if (!incident) {
    throw new NotFoundError('Incident not found.', { code: 'incident_not_found', id: incidentId });
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await first(db, `
    INSERT INTO admin_support_incident_links (id, incident_id, link_type, link_target_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [id, incidentId, linkType, linkTargetId, now]);

  return {
    link: { id, incidentId, linkType, linkTargetId, createdAt: now },
  };
}

// ---------------------------------------------------------------------------
// listIncidents
// ---------------------------------------------------------------------------

export async function listIncidents(db, { status, accountId, limit, offset } = {}) {
  const effectiveLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const effectiveOffset = Math.max(Number(offset) || 0, 0);

  let sql = 'SELECT * FROM admin_support_incidents WHERE 1=1';
  const params = [];

  if (status && INCIDENT_STATUSES.has(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (accountId) {
    sql += ' AND account_id = ?';
    params.push(accountId);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(effectiveLimit, effectiveOffset);

  let rows;
  try {
    rows = await all(db, sql, params);
  } catch (error) {
    if (isMissingIncidentsTableError(error)) {
      return { incidents: [], total: 0 };
    }
    throw error;
  }

  return { incidents: rows.map(normaliseIncidentRow) };
}

// ---------------------------------------------------------------------------
// getIncident
// ---------------------------------------------------------------------------

export async function getIncident(db, { id }) {
  if (typeof id !== 'string' || !id) {
    throw new BadRequestError('id is required.', { code: 'validation_failed', field: 'id' });
  }

  let incident;
  try {
    incident = await first(db, 'SELECT * FROM admin_support_incidents WHERE id = ?', [id]);
  } catch (error) {
    if (isMissingIncidentsTableError(error)) {
      throw new NotFoundError('Incident not found.', { code: 'incident_not_found', id });
    }
    throw error;
  }
  if (!incident) {
    throw new NotFoundError('Incident not found.', { code: 'incident_not_found', id });
  }

  // Fetch notes and links
  const notes = await all(db, `
    SELECT id, incident_id, author_id, note_text, audience, created_at
    FROM admin_support_incident_notes
    WHERE incident_id = ?
    ORDER BY created_at DESC
  `, [id]);

  const links = await all(db, `
    SELECT id, incident_id, link_type, link_target_id, created_at
    FROM admin_support_incident_links
    WHERE incident_id = ?
    ORDER BY created_at DESC
  `, [id]);

  return {
    incident: normaliseIncidentRow(incident),
    notes: notes.map(normaliseNoteRow),
    links: links.map(normaliseLinkRow),
  };
}

// ---------------------------------------------------------------------------
// Row normalisers
// ---------------------------------------------------------------------------

function normaliseIncidentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    createdBy: row.created_by,
    assignedTo: row.assigned_to || null,
    accountId: row.account_id || null,
    learnerId: row.learner_id || null,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    resolvedAt: row.resolved_at != null ? Number(row.resolved_at) : null,
    rowVersion: Number(row.row_version) || 0,
  };
}

function normaliseNoteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    incidentId: row.incident_id,
    authorId: row.author_id,
    noteText: row.note_text,
    audience: row.audience,
    createdAt: Number(row.created_at) || 0,
  };
}

function normaliseLinkRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    incidentId: row.incident_id,
    linkType: row.link_type,
    linkTargetId: row.link_target_id,
    createdAt: Number(row.created_at) || 0,
  };
}
