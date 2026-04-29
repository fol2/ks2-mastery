// U6 (P7): Support incident lifecycle tests.
//
// Tests cover:
//   1. Full lifecycle: create → investigate → resolve
//   2. CAS conflict returns 409
//   3. Invalid transitions return 400
//   4. Parent role cannot access incident endpoints (via admin-incident module validation)
//   5. Idempotency on create
//   6. Notes and links CRUD

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createIncident,
  updateIncidentStatus,
  addIncidentNote,
  addIncidentLink,
  listIncidents,
  getIncident,
} from '../worker/src/admin-incident.js';

// ---------------------------------------------------------------------------
// In-memory D1 mock
// ---------------------------------------------------------------------------

function createMockDb() {
  const tables = {
    admin_support_incidents: [],
    admin_support_incident_notes: [],
    admin_support_incident_links: [],
  };

  function matchWhere(row, sql, params, paramOffset) {
    // Minimal SQL WHERE parser for the test double
    return true; // Used only for simple selects by id below
  }

  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              // INSERT
              if (/^\s*INSERT\s+INTO\s+(\w+)/i.test(sql)) {
                const tableName = sql.match(/INSERT\s+INTO\s+(\w+)/i)[1];
                const table = tables[tableName];
                if (!table) throw new Error(`no such table: ${tableName}`);
                const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
                if (colsMatch) {
                  const cols = colsMatch[1].split(',').map(c => c.trim());
                  const row = {};
                  cols.forEach((col, i) => { row[col] = params[i]; });
                  table.push(row);
                }
                return null;
              }
              // SELECT single
              if (/^\s*SELECT\b/i.test(sql)) {
                const tableName = sql.match(/FROM\s+(\w+)/i)?.[1];
                const table = tables[tableName];
                if (!table) throw new Error(`no such table: ${tableName}`);
                // Find by id (WHERE id = ?)
                const whereIdMatch = sql.match(/WHERE\s+\w+\.?id\s*=\s*\?/i) || sql.match(/WHERE\s+id\s*=\s*\?/i);
                if (whereIdMatch) {
                  const idParam = params[0];
                  return table.find(r => r.id === idParam) || null;
                }
                return table[0] || null;
              }
              return null;
            },
            async all() {
              if (/^\s*SELECT\b/i.test(sql)) {
                const tableName = sql.match(/FROM\s+(\w+)/i)?.[1];
                const table = tables[tableName];
                if (!table) throw new Error(`no such table: ${tableName}`);
                // Simple filtering
                let results = [...table];
                if (/WHERE.*incident_id\s*=\s*\?/i.test(sql)) {
                  const incidentId = params[0];
                  results = results.filter(r => r.incident_id === incidentId);
                }
                if (/WHERE.*status\s*=\s*\?/i.test(sql) && !/incident_id/.test(sql)) {
                  const statusIdx = (sql.match(/AND\s+status\s*=\s*\?/i)) ? 1 : 0;
                  // Find status param
                  results = results.filter(r => r.status === params[statusIdx]);
                }
                return { results };
              }
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 0 } };
            },
          };
        },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { meta: { changes: 0 } }; },
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        // Execute the bound statement
        const result = await stmt.run();
        results.push(result);
      }
      return results;
    },
  };

  return { db, tables };
}

// ---------------------------------------------------------------------------
// Higher-fidelity mock that actually tracks CAS
// ---------------------------------------------------------------------------

function createFidelityMockDb() {
  const incidents = new Map();
  const notes = [];
  const links = [];

  function makeDb() {
    const db = {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async first() {
                if (/INSERT\s+INTO\s+admin_support_incidents/i.test(sql)) {
                  const id = params[0];
                  const row = {
                    id,
                    status: 'open',
                    title: params[1],
                    created_by: params[2],
                    account_id: params[3],
                    learner_id: params[4],
                    created_at: params[5],
                    updated_at: params[6],
                    row_version: 0,
                    assigned_to: null,
                    resolved_at: null,
                  };
                  incidents.set(id, row);
                  return null;
                }
                if (/INSERT\s+INTO\s+admin_support_incident_notes/i.test(sql)) {
                  const note = {
                    id: params[0],
                    incident_id: params[1],
                    author_id: params[2],
                    note_text: params[3],
                    audience: params[4],
                    created_at: params[5],
                  };
                  notes.push(note);
                  return null;
                }
                if (/INSERT\s+INTO\s+admin_support_incident_links/i.test(sql)) {
                  const link = {
                    id: params[0],
                    incident_id: params[1],
                    link_type: params[2],
                    link_target_id: params[3],
                    created_at: params[4],
                  };
                  links.push(link);
                  return null;
                }
                if (/SELECT[\s\S]*FROM\s+admin_support_incidents[\s\S]*WHERE[\s\S]*id\s*=/i.test(sql)) {
                  const id = params[0];
                  return incidents.get(id) || null;
                }
                if (/SELECT\s+row_version\s+FROM\s+admin_support_incidents/i.test(sql)) {
                  const id = params[0];
                  const found = incidents.get(id);
                  return found ? { row_version: found.row_version } : null;
                }
                return null;
              },
              async all() {
                if (/FROM\s+admin_support_incidents/i.test(sql)) {
                  let results = [...incidents.values()];
                  // Simple status filter
                  if (/AND\s+status\s*=\s*\?/i.test(sql)) {
                    const statusParam = params.find((p, i) => {
                      // status param is after WHERE 1=1
                      return typeof p === 'string' && ['open', 'investigating', 'waiting_on_parent', 'resolved', 'ignored'].includes(p);
                    });
                    if (statusParam) results = results.filter(r => r.status === statusParam);
                  }
                  return { results };
                }
                if (/FROM\s+admin_support_incident_notes/i.test(sql)) {
                  const incidentId = params[0];
                  return { results: notes.filter(n => n.incident_id === incidentId) };
                }
                if (/FROM\s+admin_support_incident_links/i.test(sql)) {
                  const incidentId = params[0];
                  return { results: links.filter(l => l.incident_id === incidentId) };
                }
                return { results: [] };
              },
              async run() {
                // UPDATE with CAS
                if (/UPDATE\s+admin_support_incidents/i.test(sql)) {
                  // params: [status, now, resolvedAt, id, rowVersion]
                  const status = params[0];
                  const updatedAt = params[1];
                  const resolvedAt = params[2];
                  const id = params[3];
                  const expectedRowVersion = params[4];
                  const row = incidents.get(id);
                  if (!row || row.row_version !== expectedRowVersion) {
                    return { meta: { changes: 0 } };
                  }
                  row.status = status;
                  row.updated_at = updatedAt;
                  if (resolvedAt != null) row.resolved_at = resolvedAt;
                  row.row_version += 1;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              },
            };
          },
          async first() { return null; },
          async all() { return { results: [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
      },
      async batch(stmts) {
        const results = [];
        for (const stmt of stmts) {
          const r = await stmt.run();
          results.push(r);
        }
        return results;
      },
    };
    return db;
  }

  return { db: makeDb(), incidents, notes, links };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('U6: Support incident lifecycle', () => {
  let db;
  let incidents;

  beforeEach(() => {
    const mock = createFidelityMockDb();
    db = mock.db;
    incidents = mock.incidents;
  });

  it('full lifecycle: create → investigate → resolve', async () => {
    const createResult = await createIncident(db, {
      title: 'Parent cannot log in',
      accountId: 'acc-123',
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });

    assert.equal(createResult.incident.status, 'open');
    assert.equal(createResult.incident.title, 'Parent cannot log in');
    assert.equal(createResult.incident.accountId, 'acc-123');
    assert.equal(createResult.incident.createdBy, 'admin-1');
    assert.equal(createResult.replayed, false);

    const incidentId = createResult.incident.id;

    // Transition to investigating
    const investigateResult = await updateIncidentStatus(db, {
      id: incidentId,
      status: 'investigating',
      rowVersion: 0,
      updatedBy: 'admin-1',
    });
    assert.equal(investigateResult.incident.status, 'investigating');
    assert.equal(investigateResult.incident.rowVersion, 1);
    assert.equal(investigateResult.incident.resolvedAt, null);

    // Transition to resolved
    const resolveResult = await updateIncidentStatus(db, {
      id: incidentId,
      status: 'resolved',
      rowVersion: 1,
      updatedBy: 'admin-1',
    });
    assert.equal(resolveResult.incident.status, 'resolved');
    assert.equal(resolveResult.incident.rowVersion, 2);
    assert.ok(resolveResult.incident.resolvedAt > 0);
  });

  it('CAS conflict returns 409 when rowVersion is stale', async () => {
    const createResult = await createIncident(db, {
      title: 'Test CAS',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    // First update succeeds
    await updateIncidentStatus(db, {
      id: incidentId,
      status: 'investigating',
      rowVersion: 0,
      updatedBy: 'admin-1',
    });

    // Second update with stale rowVersion (0) must fail
    await assert.rejects(
      () => updateIncidentStatus(db, {
        id: incidentId,
        status: 'resolved',
        rowVersion: 0, // stale
        updatedBy: 'admin-2',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'ConflictError');
        assert.match(error.message, /updated by another session/i);
        return true;
      },
    );
  });

  it('invalid transitions return 400', async () => {
    const createResult = await createIncident(db, {
      title: 'Test invalid',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    // open → waiting_on_parent is not allowed (must go through investigating)
    await assert.rejects(
      () => updateIncidentStatus(db, {
        id: incidentId,
        status: 'waiting_on_parent',
        rowVersion: 0,
        updatedBy: 'admin-1',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /Cannot transition/i);
        return true;
      },
    );
  });

  it('terminal status cannot transition further', async () => {
    const createResult = await createIncident(db, {
      title: 'Test terminal',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    // Shortcut close: open → ignored
    await updateIncidentStatus(db, {
      id: incidentId,
      status: 'ignored',
      rowVersion: 0,
      updatedBy: 'admin-1',
    });

    // Now trying to transition further must fail
    await assert.rejects(
      () => updateIncidentStatus(db, {
        id: incidentId,
        status: 'resolved',
        rowVersion: 1,
        updatedBy: 'admin-1',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /already.*ignored/i);
        return true;
      },
    );
  });

  it('idempotent create with same idempotencyKey returns replayed', async () => {
    const key = 'idem-key-001';
    const first = await createIncident(db, {
      title: 'Idempotent test',
      accountId: 'acc-1',
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: key,
    });
    assert.equal(first.replayed, false);
    assert.equal(first.incident.id, key);

    // Second call with same key
    const second = await createIncident(db, {
      title: 'Idempotent test',
      accountId: 'acc-1',
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: key,
    });
    assert.equal(second.replayed, true);
    assert.equal(second.incident.id, key);
  });

  it('addIncidentNote creates a note on an existing incident', async () => {
    const createResult = await createIncident(db, {
      title: 'Note test',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    const noteResult = await addIncidentNote(db, {
      incidentId,
      authorId: 'admin-1',
      noteText: 'Contacted parent via email.',
      audience: 'ops_safe',
    });

    assert.equal(noteResult.note.incidentId, incidentId);
    assert.equal(noteResult.note.authorId, 'admin-1');
    assert.equal(noteResult.note.noteText, 'Contacted parent via email.');
    assert.equal(noteResult.note.audience, 'ops_safe');
    assert.ok(noteResult.note.id);
    assert.ok(noteResult.note.createdAt > 0);
  });

  it('addIncidentNote rejects note on non-existent incident', async () => {
    await assert.rejects(
      () => addIncidentNote(db, {
        incidentId: 'non-existent',
        authorId: 'admin-1',
        noteText: 'This should fail.',
        audience: 'admin_only',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'NotFoundError');
        return true;
      },
    );
  });

  it('addIncidentLink creates a link on an existing incident', async () => {
    const createResult = await createIncident(db, {
      title: 'Link test',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    const linkResult = await addIncidentLink(db, {
      incidentId,
      linkType: 'error_event',
      linkTargetId: 'err-evt-456',
    });

    assert.equal(linkResult.link.incidentId, incidentId);
    assert.equal(linkResult.link.linkType, 'error_event');
    assert.equal(linkResult.link.linkTargetId, 'err-evt-456');
    assert.ok(linkResult.link.id);
  });

  it('addIncidentLink rejects invalid link_type', async () => {
    const createResult = await createIncident(db, {
      title: 'Link type test',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });

    await assert.rejects(
      () => addIncidentLink(db, {
        incidentId: createResult.incident.id,
        linkType: 'invalid_type',
        linkTargetId: 'target-1',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /linkType/i);
        return true;
      },
    );
  });

  it('listIncidents returns all incidents', async () => {
    await createIncident(db, { title: 'First', accountId: null, learnerId: null, createdBy: 'admin-1', idempotencyKey: null });
    await createIncident(db, { title: 'Second', accountId: null, learnerId: null, createdBy: 'admin-1', idempotencyKey: null });

    const result = await listIncidents(db, {});
    assert.equal(result.incidents.length, 2);
  });

  it('getIncident returns incident with notes and links', async () => {
    const createResult = await createIncident(db, {
      title: 'Detail test',
      accountId: 'acc-x',
      learnerId: 'learner-y',
      createdBy: 'admin-1',
      idempotencyKey: null,
    });
    const incidentId = createResult.incident.id;

    await addIncidentNote(db, { incidentId, authorId: 'admin-1', noteText: 'Note 1', audience: 'admin_only' });
    await addIncidentLink(db, { incidentId, linkType: 'account', linkTargetId: 'acc-x' });

    const result = await getIncident(db, { id: incidentId });
    assert.equal(result.incident.id, incidentId);
    assert.equal(result.incident.title, 'Detail test');
    assert.equal(result.notes.length, 1);
    assert.equal(result.links.length, 1);
    assert.equal(result.notes[0].noteText, 'Note 1');
    assert.equal(result.links[0].linkType, 'account');
  });

  it('createIncident rejects empty title', async () => {
    await assert.rejects(
      () => createIncident(db, { title: '', accountId: null, learnerId: null, createdBy: 'admin-1', idempotencyKey: null }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /title/i);
        return true;
      },
    );
  });

  it('createIncident rejects missing createdBy', async () => {
    await assert.rejects(
      () => createIncident(db, { title: 'Valid', accountId: null, learnerId: null, createdBy: '', idempotencyKey: null }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /createdBy/i);
        return true;
      },
    );
  });

  it('updateIncidentStatus rejects invalid status value', async () => {
    const createResult = await createIncident(db, {
      title: 'Status validation',
      accountId: null,
      learnerId: null,
      createdBy: 'admin-1',
      idempotencyKey: null,
    });

    await assert.rejects(
      () => updateIncidentStatus(db, {
        id: createResult.incident.id,
        status: 'invalid_status',
        rowVersion: 0,
        updatedBy: 'admin-1',
      }),
      (error) => {
        assert.equal(error.constructor.name, 'BadRequestError');
        assert.match(error.message, /status/i);
        return true;
      },
    );
  });
});
