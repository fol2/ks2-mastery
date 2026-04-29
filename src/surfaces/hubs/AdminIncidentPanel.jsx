import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { AdminConfirmAction } from './AdminConfirmAction.jsx';
import { formatTimestamp } from './hub-utils.js';
import {
  buildIncidentListModel,
  buildIncidentDetailModel,
  formatIncidentStatus,
  getStatusTransitions,
} from '../../platform/hubs/admin-incident-panel.js';
import { classifyAction } from '../../platform/hubs/admin-action-classification.js';

// P7 U7: Support Incident UI Panel.
//
// List view with status filter tabs, create dialog, detail drawer with
// status timeline, notes (audience badges), and linked evidence.
// Uses fetch-generation counter pattern for stale response protection.

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'waiting_on_parent', label: 'Waiting' },
  { key: 'resolved', label: 'Resolved' },
];

// ---------------------------------------------------------------------------
// IncidentStatusBadge
// ---------------------------------------------------------------------------

function IncidentStatusBadge({ status }) {
  const display = formatIncidentStatus(status);
  return (
    <span
      className="chip"
      style={{ backgroundColor: display.colour, color: '#fff', fontSize: '0.75rem' }}
      data-testid="incident-status-badge"
    >
      {display.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// IncidentRow
// ---------------------------------------------------------------------------

function IncidentRow({ incident, onSelect }) {
  return (
    <div
      className="skill-row"
      data-testid="incident-row"
      data-incident-id={incident.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(incident.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(incident.id); }}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ flex: 1 }}>
        <strong>{incident.title}</strong>
        {incident.accountId && (
          <div className="small muted">Account: {incident.accountId}</div>
        )}
      </div>
      <IncidentStatusBadge status={incident.status} />
      <div className="small muted">{formatTimestamp(incident.createdAt)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateIncidentDialog
// ---------------------------------------------------------------------------

function CreateIncidentDialog({ onSubmit, onCancel }) {
  const [title, setTitle] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [learnerId, setLearnerId] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setError('');
    onSubmit({
      title: title.trim(),
      accountId: accountId.trim() || null,
      learnerId: learnerId.trim() || null,
    });
  };

  return (
    <div className="card admin-card-spaced" data-testid="create-incident-dialog" role="dialog" aria-label="Create incident">
      <div className="eyebrow">New incident</div>
      <h4 style={{ margin: '4px 0 12px', fontSize: '0.95rem' }}>Create support incident</h4>
      {error && <div className="feedback warn" data-testid="create-incident-error">{error}</div>}
      <label className="field" style={{ display: 'block', marginBottom: 8 }}>
        <span>Title (required)</span>
        <input
          className="input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          data-testid="create-incident-title"
          placeholder="Brief description of the issue"
        />
      </label>
      <label className="field" style={{ display: 'block', marginBottom: 8 }}>
        <span>Account ID (optional)</span>
        <input
          className="input"
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          data-testid="create-incident-account"
          placeholder="acct-xxxx"
        />
      </label>
      <label className="field" style={{ display: 'block', marginBottom: 8 }}>
        <span>Learner ID (optional)</span>
        <input
          className="input"
          type="text"
          value={learnerId}
          onChange={(e) => setLearnerId(e.target.value)}
          data-testid="create-incident-learner"
          placeholder="learner-xxxx"
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" type="button" onClick={handleSubmit} data-testid="create-incident-submit">Create</button>
        <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentNoteForm
// ---------------------------------------------------------------------------

function IncidentNoteForm({ onSubmit }) {
  const [noteText, setNoteText] = React.useState('');
  const [audience, setAudience] = React.useState('admin_only');

  const handleSubmit = () => {
    if (!noteText.trim()) return;
    onSubmit({ noteText: noteText.trim(), audience });
    setNoteText('');
  };

  return (
    <div style={{ marginTop: 12, padding: '8px 0', borderTop: '1px solid #e5e7eb' }} data-testid="incident-note-form">
      <label className="field" style={{ display: 'block', marginBottom: 8 }}>
        <span>Add note</span>
        <textarea
          className="input"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={2}
          maxLength={8000}
          placeholder="Internal note..."
          data-testid="incident-note-text"
        />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          className="select"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          data-testid="incident-note-audience"
        >
          <option value="admin_only">Admin only</option>
          <option value="ops_safe">Ops safe</option>
        </select>
        <button className="btn secondary" type="button" onClick={handleSubmit} data-testid="incident-note-submit">Add note</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentDetailDrawer
// ---------------------------------------------------------------------------

function IncidentDetailDrawer({ detail, onClose, onStatusChange, onAddNote }) {
  const [pendingStatus, setPendingStatus] = React.useState(null);
  const [confirmAction, setConfirmAction] = React.useState(null);

  if (!detail) return null;

  const handleStatusSelect = (newStatus) => {
    // Check if this requires confirmation
    const actionKey = newStatus === 'resolved' ? 'incident-resolve' : newStatus === 'ignored' ? 'incident-ignore' : 'incident-status-change';
    const classification = classifyAction(actionKey, { targetLabel: detail.title });

    if (classification.requiresConfirmation) {
      setPendingStatus(newStatus);
      setConfirmAction(classification);
    } else {
      onStatusChange(newStatus);
    }
  };

  const handleConfirm = async () => {
    if (pendingStatus) {
      onStatusChange(pendingStatus);
    }
    setPendingStatus(null);
    setConfirmAction(null);
  };

  const handleCancelConfirm = () => {
    setPendingStatus(null);
    setConfirmAction(null);
  };

  return (
    <div className="card admin-card-spaced" data-testid="incident-detail-drawer">
      <div className="card-header">
        <div>
          <div className="eyebrow">Incident detail</div>
          <h3 className="section-title admin-section-title">{detail.title}</h3>
          <div className="small muted">
            Created {formatTimestamp(detail.createdAt)}
            {detail.accountId && ` · Account: ${detail.accountId}`}
          </div>
        </div>
        <div className="actions">
          <IncidentStatusBadge status={detail.status} />
          <button className="btn secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Status transitions */}
      {detail.transitions.length > 0 && (
        <div style={{ margin: '12px 0' }} data-testid="incident-status-transitions">
          <span className="small" style={{ marginRight: 8 }}>Change status:</span>
          {detail.transitions.map((t) => {
            const display = formatIncidentStatus(t);
            return (
              <button
                key={t}
                className="btn ghost"
                type="button"
                style={{ marginRight: 4, fontSize: '0.8rem' }}
                onClick={() => handleStatusSelect(t)}
                data-testid={`transition-${t}`}
              >
                {display.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Confirmation overlay */}
      {confirmAction && (
        <AdminConfirmAction
          level={confirmAction.level}
          dangerCopy={confirmAction.dangerCopy}
          targetDisplay={confirmAction.targetDisplay || detail.title}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}

      {/* Notes */}
      <div style={{ marginTop: 12 }}>
        <div className="eyebrow">Notes ({detail.notes.length})</div>
        {detail.notes.length > 0 ? detail.notes.map((note) => (
          <div key={note.id} className="skill-row" data-testid="incident-note" data-audience={note.audience}>
            <div style={{ flex: 1 }}>
              <div>{note.noteText}</div>
              <div className="small muted">{formatTimestamp(note.createdAt)} · {note.authorId}</div>
            </div>
            <span
              className="chip"
              data-testid="note-audience-badge"
              style={{
                backgroundColor: note.audience === 'admin_only' ? '#dc2626' : '#0284c7',
                color: '#fff',
                fontSize: '0.7rem',
              }}
            >
              {note.audienceLabel}
            </span>
          </div>
        )) : <p className="small muted">No notes yet.</p>}
        <IncidentNoteForm onSubmit={onAddNote} />
      </div>

      {/* Linked evidence */}
      <div style={{ marginTop: 12 }}>
        <div className="eyebrow">Linked evidence ({detail.links.length})</div>
        {detail.links.length > 0 ? detail.links.map((link) => (
          <div key={link.id} className="skill-row" data-testid="incident-link">
            <div>
              <strong>{link.linkType}</strong>
              <div className="small muted">{link.linkTargetId}</div>
            </div>
            <div className="small muted">{formatTimestamp(link.createdAt)}</div>
          </div>
        )) : <p className="small muted" data-testid="incident-no-links">No linked evidence.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdminIncidentPanel (main export)
// ---------------------------------------------------------------------------

export function AdminIncidentPanel({ actions }) {
  const [incidents, setIncidents] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [refreshedAt, setRefreshedAt] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [selectedDetail, setSelectedDetail] = React.useState(null);
  const fetchGenRef = React.useRef(0);

  const fetchIncidents = React.useCallback(async (statusFilter) => {
    const generation = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const url = `/api/admin/incidents${params.toString() ? `?${params}` : ''}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (generation !== fetchGenRef.current) return;
      setIncidents(json);
      setRefreshedAt(Date.now());
    } catch (err) {
      if (generation !== fetchGenRef.current) return;
      setError({ message: err.message || 'Error loading incidents' });
    } finally {
      if (generation === fetchGenRef.current) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    fetchIncidents(filter);
  }, [fetchIncidents, filter]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setSelectedDetail(null);
    setShowCreate(false);
  };

  const handleCreate = async (data) => {
    try {
      const resp = await fetch('/api/admin/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setShowCreate(false);
      fetchIncidents(filter);
    } catch (err) {
      setError({ message: err.message || 'Failed to create incident' });
    }
  };

  const handleSelectIncident = async (incidentId) => {
    try {
      const resp = await fetch(`/api/admin/incidents?id=${encodeURIComponent(incidentId)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const model = buildIncidentDetailModel(json);
      setSelectedDetail(model);
    } catch (err) {
      setError({ message: err.message || 'Failed to load incident detail' });
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedDetail) return;
    try {
      const resp = await fetch('/api/admin/incidents/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedDetail.id,
          status: newStatus,
          rowVersion: selectedDetail.rowVersion,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // Reload detail
      handleSelectIncident(selectedDetail.id);
      fetchIncidents(filter);
    } catch (err) {
      setError({ message: err.message || 'Failed to update status' });
    }
  };

  const handleAddNote = async ({ noteText, audience }) => {
    if (!selectedDetail) return;
    try {
      const resp = await fetch('/api/admin/incidents/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: selectedDetail.id,
          noteText,
          audience,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // Reload detail
      handleSelectIncident(selectedDetail.id);
    } catch (err) {
      setError({ message: err.message || 'Failed to add note' });
    }
  };

  const model = buildIncidentListModel(incidents);

  if (selectedDetail) {
    return (
      <IncidentDetailDrawer
        detail={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        onStatusChange={handleStatusChange}
        onAddNote={handleAddNote}
      />
    );
  }

  if (showCreate) {
    return (
      <CreateIncidentDialog
        onSubmit={handleCreate}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  return (
    <AdminPanelFrame
      eyebrow="Support"
      title="Incidents"
      subtitle="Track, triage, and resolve parent support incidents."
      refreshedAt={refreshedAt}
      refreshError={error}
      onRefresh={() => fetchIncidents(filter)}
      data={model.hasData ? model.incidents : null}
      loading={loading}
      emptyState={<p className="small muted" data-testid="incident-empty-state">No support incidents</p>}
    >
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }} data-testid="incident-filter-tabs">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`btn ${filter === tab.key ? '' : 'ghost'}`}
            type="button"
            style={{ fontSize: '0.8rem' }}
            onClick={() => handleFilterChange(tab.key)}
            data-testid={`filter-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
        <button
          className="btn secondary"
          type="button"
          style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
          onClick={() => setShowCreate(true)}
          data-testid="create-incident-btn"
        >
          Create incident
        </button>
      </div>

      {/* Incident list */}
      {model.incidents.map((inc) => (
        <IncidentRow key={inc.id} incident={inc} onSelect={handleSelectIncident} />
      ))}
    </AdminPanelFrame>
  );
}
