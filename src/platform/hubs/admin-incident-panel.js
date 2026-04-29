// Admin Console P7 / U7: Incident panel platform helpers.
//
// Pure-logic transforms for the incident UI panel. No React imports.
// Transforms API responses into display models and provides status
// transition logic matching the worker's VALID_TRANSITIONS map.

// ---------------------------------------------------------------------------
// Status labels and colours
// ---------------------------------------------------------------------------

const STATUS_CONFIG = Object.freeze({
  open: { label: 'Open', colour: '#d97706' },
  investigating: { label: 'Investigating', colour: '#2563eb' },
  waiting_on_parent: { label: 'Waiting on Parent', colour: '#7c3aed' },
  resolved: { label: 'Resolved', colour: '#16a34a' },
  ignored: { label: 'Ignored', colour: '#6b7280' },
});

// Linear progression plus shortcut-close to terminal (mirrors worker).
const VALID_TRANSITIONS = new Map([
  ['open', ['investigating', 'resolved', 'ignored']],
  ['investigating', ['waiting_on_parent', 'resolved', 'ignored']],
  ['waiting_on_parent', ['resolved', 'ignored']],
]);

const NOTE_AUDIENCE_LABELS = Object.freeze({
  admin_only: 'Admin only',
  ops_safe: 'Ops safe',
});

// ---------------------------------------------------------------------------
// formatIncidentStatus
// ---------------------------------------------------------------------------

/**
 * @param {string} status
 * @returns {{ label: string, colour: string }}
 */
export function formatIncidentStatus(status) {
  const config = STATUS_CONFIG[status];
  if (!config) return { label: String(status || 'Unknown'), colour: '#6b7280' };
  return { label: config.label, colour: config.colour };
}

// ---------------------------------------------------------------------------
// getStatusTransitions
// ---------------------------------------------------------------------------

/**
 * Returns the valid next statuses from the given current status.
 * Terminal statuses (resolved, ignored) have no valid transitions.
 *
 * @param {string} currentStatus
 * @returns {string[]}
 */
export function getStatusTransitions(currentStatus) {
  const transitions = VALID_TRANSITIONS.get(currentStatus);
  return transitions ? [...transitions] : [];
}

// ---------------------------------------------------------------------------
// buildIncidentListModel
// ---------------------------------------------------------------------------

/**
 * Transform the API list response into a display model.
 *
 * @param {{ incidents?: Array }} data — raw API response from GET /api/admin/incidents
 * @returns {{ incidents: Array<object>, hasData: boolean }}
 */
export function buildIncidentListModel(data) {
  if (!data || !Array.isArray(data.incidents)) {
    return { incidents: [], hasData: false };
  }

  const incidents = data.incidents.map((inc) => {
    const statusDisplay = formatIncidentStatus(inc.status);
    return {
      id: inc.id,
      title: inc.title || '(untitled)',
      status: inc.status,
      statusLabel: statusDisplay.label,
      statusColour: statusDisplay.colour,
      accountId: inc.accountId || null,
      learnerId: inc.learnerId || null,
      createdBy: inc.createdBy || null,
      createdAt: inc.createdAt || 0,
      updatedAt: inc.updatedAt || 0,
      resolvedAt: inc.resolvedAt || null,
      rowVersion: inc.rowVersion || 0,
    };
  });

  return { incidents, hasData: incidents.length > 0 };
}

// ---------------------------------------------------------------------------
// buildIncidentDetailModel
// ---------------------------------------------------------------------------

/**
 * Transform a single incident (with notes and links) into a detail view model.
 *
 * @param {{ incident: object, notes?: Array, links?: Array }} data
 * @returns {object}
 */
export function buildIncidentDetailModel(data) {
  if (!data || !data.incident) {
    return null;
  }

  const inc = data.incident;
  const statusDisplay = formatIncidentStatus(inc.status);
  const transitions = getStatusTransitions(inc.status);

  const notes = Array.isArray(data.notes)
    ? data.notes.map((n) => ({
        id: n.id,
        authorId: n.authorId,
        noteText: n.noteText,
        audience: n.audience,
        audienceLabel: NOTE_AUDIENCE_LABELS[n.audience] || n.audience,
        createdAt: n.createdAt || 0,
      }))
    : [];

  const links = Array.isArray(data.links)
    ? data.links.map((l) => ({
        id: l.id,
        linkType: l.linkType,
        linkTargetId: l.linkTargetId,
        createdAt: l.createdAt || 0,
      }))
    : [];

  return {
    id: inc.id,
    title: inc.title || '(untitled)',
    status: inc.status,
    statusLabel: statusDisplay.label,
    statusColour: statusDisplay.colour,
    accountId: inc.accountId || null,
    learnerId: inc.learnerId || null,
    createdBy: inc.createdBy || null,
    createdAt: inc.createdAt || 0,
    updatedAt: inc.updatedAt || 0,
    resolvedAt: inc.resolvedAt || null,
    rowVersion: inc.rowVersion || 0,
    transitions,
    notes,
    links,
  };
}

export { STATUS_CONFIG, VALID_TRANSITIONS, NOTE_AUDIENCE_LABELS };
