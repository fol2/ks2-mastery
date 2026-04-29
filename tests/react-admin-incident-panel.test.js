// P7 U7: Admin Incident Panel — unit tests.
//
// Validates:
//   1. Incident list model builds with status badges
//   2. Empty state produces correct message
//   3. Status transitions computed correctly
//   4. Create form validates required title
//   5. Detail view model includes notes with audience
//   6. Linked evidence shows empty state when no links
//   7. Action classification for incident actions

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIncidentListModel,
  buildIncidentDetailModel,
  formatIncidentStatus,
  getStatusTransitions,
  STATUS_CONFIG,
  VALID_TRANSITIONS,
  NOTE_AUDIENCE_LABELS,
} from '../src/platform/hubs/admin-incident-panel.js';

import {
  classifyAction,
  LEVELS,
} from '../src/platform/hubs/admin-action-classification.js';

// =================================================================
// 1. Incident list renders with status badges
// =================================================================

describe('buildIncidentListModel', () => {
  it('transforms API response into display model with status labels and colours', () => {
    const data = {
      incidents: [
        { id: 'inc-1', title: 'Login issue', status: 'open', createdAt: 1000, updatedAt: 2000, accountId: 'acct-1' },
        { id: 'inc-2', title: 'Payment query', status: 'investigating', createdAt: 3000, updatedAt: 4000 },
      ],
    };

    const model = buildIncidentListModel(data);

    assert.equal(model.hasData, true);
    assert.equal(model.incidents.length, 2);

    assert.equal(model.incidents[0].id, 'inc-1');
    assert.equal(model.incidents[0].statusLabel, 'Open');
    assert.equal(model.incidents[0].statusColour, '#d97706');
    assert.equal(model.incidents[0].accountId, 'acct-1');

    assert.equal(model.incidents[1].id, 'inc-2');
    assert.equal(model.incidents[1].statusLabel, 'Investigating');
    assert.equal(model.incidents[1].statusColour, '#2563eb');
  });

  it('handles all defined statuses', () => {
    const statuses = ['open', 'investigating', 'waiting_on_parent', 'resolved', 'ignored'];
    for (const status of statuses) {
      const result = formatIncidentStatus(status);
      assert.ok(result.label, `missing label for ${status}`);
      assert.ok(result.colour, `missing colour for ${status}`);
    }
  });

  it('returns unknown label for undefined status', () => {
    const result = formatIncidentStatus('nonexistent');
    assert.equal(result.label, 'nonexistent');
    assert.equal(result.colour, '#6b7280');
  });
});

// =================================================================
// 2. Empty state shows "No support incidents"
// =================================================================

describe('buildIncidentListModel — empty state', () => {
  it('returns hasData=false when incidents array is empty', () => {
    const model = buildIncidentListModel({ incidents: [] });
    assert.equal(model.hasData, false);
    assert.equal(model.incidents.length, 0);
  });

  it('returns hasData=false when data is null', () => {
    const model = buildIncidentListModel(null);
    assert.equal(model.hasData, false);
    assert.equal(model.incidents.length, 0);
  });

  it('returns hasData=false when data is undefined', () => {
    const model = buildIncidentListModel(undefined);
    assert.equal(model.hasData, false);
    assert.equal(model.incidents.length, 0);
  });

  it('returns hasData=false when incidents field is not an array', () => {
    const model = buildIncidentListModel({ incidents: 'bad' });
    assert.equal(model.hasData, false);
  });
});

// =================================================================
// 3. Status transitions: valid next states computed correctly
// =================================================================

describe('getStatusTransitions', () => {
  it('open → investigating, resolved, ignored', () => {
    const transitions = getStatusTransitions('open');
    assert.deepEqual(transitions, ['investigating', 'resolved', 'ignored']);
  });

  it('investigating → waiting_on_parent, resolved, ignored', () => {
    const transitions = getStatusTransitions('investigating');
    assert.deepEqual(transitions, ['waiting_on_parent', 'resolved', 'ignored']);
  });

  it('waiting_on_parent → resolved, ignored', () => {
    const transitions = getStatusTransitions('waiting_on_parent');
    assert.deepEqual(transitions, ['resolved', 'ignored']);
  });

  it('resolved has no transitions (terminal)', () => {
    const transitions = getStatusTransitions('resolved');
    assert.deepEqual(transitions, []);
  });

  it('ignored has no transitions (terminal)', () => {
    const transitions = getStatusTransitions('ignored');
    assert.deepEqual(transitions, []);
  });

  it('unknown status has no transitions', () => {
    const transitions = getStatusTransitions('nonexistent');
    assert.deepEqual(transitions, []);
  });
});

// =================================================================
// 4. Create form validates required title (platform-level validation)
// =================================================================

describe('buildIncidentListModel — title handling', () => {
  it('uses (untitled) for incidents with empty title', () => {
    const model = buildIncidentListModel({
      incidents: [{ id: 'inc-no-title', title: '', status: 'open', createdAt: 0 }],
    });
    assert.equal(model.incidents[0].title, '(untitled)');
  });

  it('uses (untitled) for incidents with null title', () => {
    const model = buildIncidentListModel({
      incidents: [{ id: 'inc-null-title', title: null, status: 'open', createdAt: 0 }],
    });
    assert.equal(model.incidents[0].title, '(untitled)');
  });

  it('preserves valid title', () => {
    const model = buildIncidentListModel({
      incidents: [{ id: 'inc-title', title: 'Parent cannot log in', status: 'open', createdAt: 0 }],
    });
    assert.equal(model.incidents[0].title, 'Parent cannot log in');
  });
});

// =================================================================
// 5. Detail view shows notes with audience badges
// =================================================================

describe('buildIncidentDetailModel — notes with audience', () => {
  it('transforms notes with audience labels', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'open', createdAt: 1000 },
      notes: [
        { id: 'n-1', authorId: 'admin-1', noteText: 'Internal note', audience: 'admin_only', createdAt: 2000 },
        { id: 'n-2', authorId: 'admin-2', noteText: 'Ops note', audience: 'ops_safe', createdAt: 3000 },
      ],
      links: [],
    };

    const model = buildIncidentDetailModel(data);

    assert.equal(model.notes.length, 2);
    assert.equal(model.notes[0].audienceLabel, 'Admin only');
    assert.equal(model.notes[0].audience, 'admin_only');
    assert.equal(model.notes[1].audienceLabel, 'Ops safe');
    assert.equal(model.notes[1].audience, 'ops_safe');
  });

  it('returns null for null input', () => {
    const model = buildIncidentDetailModel(null);
    assert.equal(model, null);
  });

  it('returns null when incident is missing', () => {
    const model = buildIncidentDetailModel({ notes: [], links: [] });
    assert.equal(model, null);
  });

  it('includes transitions for active statuses', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'investigating', createdAt: 1000 },
      notes: [],
      links: [],
    };
    const model = buildIncidentDetailModel(data);
    assert.deepEqual(model.transitions, ['waiting_on_parent', 'resolved', 'ignored']);
  });

  it('includes empty transitions for terminal statuses', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'resolved', createdAt: 1000 },
      notes: [],
      links: [],
    };
    const model = buildIncidentDetailModel(data);
    assert.deepEqual(model.transitions, []);
  });
});

// =================================================================
// 6. Linked evidence shows empty when no links / "Evidence unavailable" when deleted
// =================================================================

describe('buildIncidentDetailModel — linked evidence', () => {
  it('returns empty links array when no links provided', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'open', createdAt: 1000 },
      notes: [],
      links: [],
    };
    const model = buildIncidentDetailModel(data);
    assert.equal(model.links.length, 0);
  });

  it('transforms links with type and target', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'open', createdAt: 1000 },
      notes: [],
      links: [
        { id: 'l-1', linkType: 'error_event', linkTargetId: 'evt-123', createdAt: 5000 },
        { id: 'l-2', linkType: 'account', linkTargetId: 'acct-456', createdAt: 6000 },
      ],
    };
    const model = buildIncidentDetailModel(data);
    assert.equal(model.links.length, 2);
    assert.equal(model.links[0].linkType, 'error_event');
    assert.equal(model.links[0].linkTargetId, 'evt-123');
    assert.equal(model.links[1].linkType, 'account');
    assert.equal(model.links[1].linkTargetId, 'acct-456');
  });

  it('handles missing links field gracefully', () => {
    const data = {
      incident: { id: 'inc-1', title: 'Test', status: 'open', createdAt: 1000 },
      notes: [],
    };
    const model = buildIncidentDetailModel(data);
    assert.equal(model.links.length, 0);
  });
});

// =================================================================
// 7. Action classification: incident actions
// =================================================================

describe('incident action classification', () => {
  it('incident-create is medium (no confirmation)', () => {
    const result = classifyAction('incident-create');
    assert.equal(result.level, LEVELS.medium);
    assert.equal(result.requiresConfirmation, false);
  });

  it('incident-status-change is medium (no confirmation)', () => {
    const result = classifyAction('incident-status-change');
    assert.equal(result.level, LEVELS.medium);
    assert.equal(result.requiresConfirmation, false);
  });

  it('incident-resolve is high (requires confirmation)', () => {
    const result = classifyAction('incident-resolve', { targetLabel: 'Login issue' });
    assert.equal(result.level, LEVELS.high);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.requiresTypedTarget, false);
    assert.equal(result.targetDisplay, 'Login issue');
    assert.ok(result.dangerCopy);
  });

  it('incident-ignore is high (requires confirmation)', () => {
    const result = classifyAction('incident-ignore', { targetId: 'inc-123' });
    assert.equal(result.level, LEVELS.high);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.targetDisplay, 'inc-123');
  });
});

// =================================================================
// 8. STATUS_CONFIG completeness
// =================================================================

describe('STATUS_CONFIG', () => {
  it('covers all five statuses', () => {
    const expected = ['open', 'investigating', 'waiting_on_parent', 'resolved', 'ignored'];
    for (const s of expected) {
      assert.ok(STATUS_CONFIG[s], `STATUS_CONFIG missing ${s}`);
      assert.ok(STATUS_CONFIG[s].label);
      assert.ok(STATUS_CONFIG[s].colour);
    }
  });
});

// =================================================================
// 9. NOTE_AUDIENCE_LABELS completeness
// =================================================================

describe('NOTE_AUDIENCE_LABELS', () => {
  it('has labels for both audiences', () => {
    assert.equal(NOTE_AUDIENCE_LABELS.admin_only, 'Admin only');
    assert.equal(NOTE_AUDIENCE_LABELS.ops_safe, 'Ops safe');
  });
});

// =================================================================
// 10. VALID_TRANSITIONS completeness
// =================================================================

describe('VALID_TRANSITIONS', () => {
  it('has entries for open, investigating, waiting_on_parent', () => {
    assert.ok(VALID_TRANSITIONS.has('open'));
    assert.ok(VALID_TRANSITIONS.has('investigating'));
    assert.ok(VALID_TRANSITIONS.has('waiting_on_parent'));
  });

  it('does not have entries for terminal statuses', () => {
    assert.equal(VALID_TRANSITIONS.has('resolved'), false);
    assert.equal(VALID_TRANSITIONS.has('ignored'), false);
  });
});
