import React from 'react';
import { renderRestrictedMarkdown } from '../../platform/ops/active-messages.js';
import { normaliseMarketingMessage } from '../../platform/hubs/admin-marketing-message.js';
import { createAdminMarketingApi } from '../../platform/hubs/admin-marketing-api.js';
import { uid } from '../../platform/core/utils.js';
import { useSubmitLock } from '../../platform/react/use-submit-lock.js';
import { formatTimestamp } from './hub-utils.js';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';

// U6 (P4): Marketing section — wired to admin-marketing.js backend.
//
// Self-contained local state: message list, loading/error, selected
// message, form state, CAS expectedRowVersion. No store/dispatcher.
// Lazy-loaded on tab activation via createAdminMarketingApi().
//
// State machine: draft → scheduled → published → paused → archived
// Plus reverse: scheduled → draft, paused → published, draft → archived.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS = new Map([
  ['draft', ['scheduled', 'archived']],
  ['scheduled', ['published', 'draft']],
  ['published', ['paused', 'archived']],
  ['paused', ['published', 'archived']],
]);

const MESSAGE_TYPES = ['announcement', 'maintenance'];
const AUDIENCE_VALUES = ['internal', 'demo', 'all_signed_in'];
const SEVERITY_TOKENS = ['info', 'warning'];

const STATUS_BADGE_STYLES = {
  draft: { background: '#e8e8e8', color: '#555' },
  scheduled: { background: '#E3F2FD', color: '#1565C0' },
  published: { background: '#E8F5E9', color: '#2E7D32' },
  paused: { background: '#FFF3E0', color: '#E65100' },
  archived: { background: '#F3E5F5', color: '#6A1B9A' },
};

const TRANSITION_LABELS = {
  scheduled: 'Schedule',
  published: 'Publish',
  paused: 'Pause',
  archived: 'Archive',
  draft: 'Unschedule',
};

const EMPTY_FORM = {
  title: '',
  body_text: '',
  message_type: 'announcement',
  audience: 'internal',
  severity_token: 'info',
  starts_at: '',
  ends_at: '',
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_DESCRIPTIONS = {
  scheduled: 'Staged for a future window — will NOT be shown to users until manually published.',
};

function StatusBadge({ status }) {
  const style = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.draft;
  const description = STATUS_DESCRIPTIONS[status] || null;
  return (
    <span
      className="chip"
      data-status={status}
      title={description}
      aria-label={description || status}
      style={{
        ...style,
        fontSize: '0.75rem',
        padding: '2px 8px',
        borderRadius: 4,
        fontWeight: 600,
        textTransform: 'capitalise',
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Safe body_text preview — XSS-safe using renderRestrictedMarkdown
// ---------------------------------------------------------------------------

function BodyTextPreview({ text }) {
  if (!text) return <span className="small muted">No body text</span>;
  const rendered = renderRestrictedMarkdown(text);
  return (
    <div className="marketing-body-preview admin-marketing-body-preview">
      {rendered || text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Broad publish confirmation dialog
// ---------------------------------------------------------------------------

function BroadPublishConfirmDialog({ message, targetAction, onConfirm, onCancel }) {
  return (
    <div
      className="callout warn admin-marketing-confirm-wrap"
      role="alertdialog"
      aria-label="Confirm broad publish"
      data-testid="broad-publish-confirm"
    >
      <strong>Confirm broad publish</strong>
      <p className="admin-marketing-confirm-text">
        You are about to {targetAction === 'published' ? 'publish' : 'schedule'} a message
        to <strong>all signed-in users</strong>.
        This will display a banner to every user of the platform.
      </p>
      <p className="small muted admin-marketing-confirm-meta">
        Message: &ldquo;{message.title}&rdquo; ({message.message_type}, {message.severity_token})
      </p>
      <div className="admin-marketing-confirm-actions">
        <button
          className="btn secondary"
          type="button"
          onClick={onConfirm}
          data-testid="broad-publish-confirm-yes"
        >
          Yes, {targetAction === 'published' ? 'publish' : 'schedule'} to all users
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={onCancel}
          data-testid="broad-publish-confirm-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function MarketingCreateForm({ onSubmit, submitting }) {
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const [validationError, setValidationError] = React.useState('');

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setValidationError('Title is required.');
      return;
    }
    if (!form.body_text.trim()) {
      setValidationError('Body text is required.');
      return;
    }
    if (!MESSAGE_TYPES.includes(form.message_type)) {
      setValidationError('Message type must be "announcement" or "maintenance".');
      return;
    }
    if (!AUDIENCE_VALUES.includes(form.audience)) {
      setValidationError('Audience must be "internal", "demo", or "all_signed_in".');
      return;
    }
    if (!SEVERITY_TOKENS.includes(form.severity_token)) {
      setValidationError('Severity must be "info" or "warning".');
      return;
    }

    const data = {
      title: form.title.trim(),
      body_text: form.body_text,
      message_type: form.message_type,
      audience: form.audience,
      severity_token: form.severity_token,
      starts_at: form.starts_at ? new Date(form.starts_at).getTime() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).getTime() : null,
    };
    try {
      await onSubmit(data);
      setForm({ ...EMPTY_FORM }); // HIGH-2: only clear on success
    } catch {
      // form retains values on failure — parent shows error
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="marketing-create-form" className="admin-marketing-form">
      {validationError && (
        <div className="feedback bad admin-marketing-form-feedback" data-testid="create-form-validation-error">
          {validationError}
        </div>
      )}
      <div className="admin-marketing-form-grid">
        <label className="field admin-marketing-form-grid-full">
          <span>Title</span>
          <input
            className="input"
            type="text"
            name="title"
            value={form.title}
            maxLength={200}
            required
            onChange={(e) => updateField('title', e.target.value)}
            data-testid="create-form-title"
          />
        </label>
        <label className="field admin-marketing-form-grid-full">
          <span>Body text (restricted Markdown: **bold**, *italic*, [text](https://url))</span>
          <textarea
            className="input"
            name="body_text"
            value={form.body_text}
            maxLength={4000}
            rows={4}
            required
            onChange={(e) => updateField('body_text', e.target.value)}
            data-testid="create-form-body"
          />
        </label>
        <label className="field">
          <span>Message type</span>
          <select
            className="select"
            name="message_type"
            value={form.message_type}
            onChange={(e) => updateField('message_type', e.target.value)}
            data-testid="create-form-type"
          >
            {MESSAGE_TYPES.map((t) => <option value={t} key={t}>{t}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Audience</span>
          <select
            className="select"
            name="audience"
            value={form.audience}
            onChange={(e) => updateField('audience', e.target.value)}
            data-testid="create-form-audience"
          >
            {AUDIENCE_VALUES.map((a) => <option value={a} key={a}>{a}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select
            className="select"
            name="severity_token"
            value={form.severity_token}
            onChange={(e) => updateField('severity_token', e.target.value)}
            data-testid="create-form-severity"
          >
            {SEVERITY_TOKENS.map((s) => <option value={s} key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Starts at (optional)</span>
          <input
            className="input"
            type="datetime-local"
            name="starts_at"
            value={form.starts_at}
            onChange={(e) => updateField('starts_at', e.target.value)}
            data-testid="create-form-starts-at"
          />
        </label>
        <label className="field">
          <span>Ends at (optional)</span>
          <input
            className="input"
            type="datetime-local"
            name="ends_at"
            value={form.ends_at}
            onChange={(e) => updateField('ends_at', e.target.value)}
            data-testid="create-form-ends-at"
          />
        </label>
      </div>
      <div className="admin-marketing-form-submit">
        <button
          className="btn secondary"
          type="submit"
          disabled={submitting}
          data-testid="create-form-submit"
        >
          {submitting ? 'Creating...' : 'Create message'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Edit form — pre-filled with current draft values
// ---------------------------------------------------------------------------

function timestampToDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MarketingEditForm({ message, onSubmit, onCancel, submitting }) {
  const [form, setForm] = React.useState({
    title: message.title || '',
    body_text: message.body_text || '',
    severity_token: message.severity_token || 'info',
    starts_at: timestampToDatetimeLocal(message.starts_at),
    ends_at: timestampToDatetimeLocal(message.ends_at),
  });
  const [validationError, setValidationError] = React.useState('');
  const [showPreview, setShowPreview] = React.useState(false);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setValidationError('Title is required.');
      return;
    }
    if (!form.body_text.trim()) {
      setValidationError('Body text is required.');
      return;
    }
    if (!SEVERITY_TOKENS.includes(form.severity_token)) {
      setValidationError('Severity must be "info" or "warning".');
      return;
    }

    const data = {
      title: form.title.trim(),
      body_text: form.body_text,
      severity_token: form.severity_token,
      starts_at: form.starts_at ? new Date(form.starts_at).getTime() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).getTime() : null,
      expectedRowVersion: message.row_version,
    };
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="marketing-edit-form" className="admin-marketing-form">
      {validationError && (
        <div className="feedback bad admin-marketing-form-feedback" data-testid="edit-form-validation-error">
          {validationError}
        </div>
      )}
      <div className="admin-marketing-form-grid">
        <label className="field admin-marketing-form-grid-full">
          <span>Title</span>
          <input
            className="input"
            type="text"
            name="title"
            value={form.title}
            maxLength={200}
            required
            onChange={(e) => updateField('title', e.target.value)}
            data-testid="edit-form-title"
          />
        </label>
        <label className="field admin-marketing-form-grid-full">
          <span>Body text (restricted Markdown: **bold**, *italic*, [text](https://url))</span>
          <textarea
            className="input"
            name="body_text"
            value={form.body_text}
            maxLength={4000}
            rows={4}
            required
            onChange={(e) => updateField('body_text', e.target.value)}
            data-testid="edit-form-body"
          />
        </label>
        {showPreview && form.body_text && (
          <div className="admin-marketing-form-grid-full" data-testid="edit-form-preview">
            <div className="eyebrow">Preview</div>
            <BodyTextPreview text={form.body_text} />
          </div>
        )}
        <div className="admin-marketing-form-grid-full">
          <button
            className="btn link small"
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            data-testid="edit-form-toggle-preview"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
        <label className="field">
          <span>Severity</span>
          <select
            className="select"
            name="severity_token"
            value={form.severity_token}
            onChange={(e) => updateField('severity_token', e.target.value)}
            data-testid="edit-form-severity"
          >
            {SEVERITY_TOKENS.map((s) => <option value={s} key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Starts at (optional)</span>
          <input
            className="input"
            type="datetime-local"
            name="starts_at"
            value={form.starts_at}
            onChange={(e) => updateField('starts_at', e.target.value)}
            data-testid="edit-form-starts-at"
          />
        </label>
        <label className="field">
          <span>Ends at (optional)</span>
          <input
            className="input"
            type="datetime-local"
            name="ends_at"
            value={form.ends_at}
            onChange={(e) => updateField('ends_at', e.target.value)}
            data-testid="edit-form-ends-at"
          />
        </label>
      </div>
      <div className="admin-marketing-form-submit">
        <button
          className="btn secondary"
          type="submit"
          disabled={submitting}
          data-testid="edit-form-submit"
        >
          {submitting ? 'Saving...' : 'Save changes'}
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          data-testid="edit-form-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Message detail view with lifecycle transitions
// ---------------------------------------------------------------------------

function MessageDetail({ message, isAdmin, onTransition, onBack, onEdit, editError, transitionError, transitioning, broadPublishPending, onBroadPublishConfirm, onBroadPublishCancel, schedulingConfirmPending, onSchedulingConfirm, onSchedulingCancel }) {
  const allowedTransitions = VALID_TRANSITIONS.get(message.status) || [];

  return (
    <section className="card admin-card-spaced" data-testid="marketing-message-detail">
      <div className="card-header">
        <div>
          <div className="eyebrow">Marketing message</div>
          <h3 className="section-title admin-section-title">{message.title}</h3>
          <p className="subtitle">
            {message.message_type} &middot; {message.audience} &middot; <StatusBadge status={message.status} />
          </p>
        </div>
        <div className="actions">
          {isAdmin && message.status === 'draft' && (
            <button
              className="btn secondary"
              type="button"
              onClick={onEdit}
              data-testid="edit-draft-btn"
            >
              Edit
            </button>
          )}
          <button className="btn secondary" type="button" onClick={onBack}>Back to list</button>
        </div>
      </div>

      {editError && (
        <div className="feedback bad admin-marketing-feedback-spaced" data-testid="edit-error">
          {editError}
        </div>
      )}

      {message.status === 'scheduled' && (
        <div className="feedback info admin-marketing-feedback-spaced" data-testid="scheduling-truth-note">
          This message is staged but not auto-delivered. Publish manually when ready.
        </div>
      )}

      {transitionError && (
        <div className="feedback bad admin-marketing-feedback-spaced" data-testid="transition-error">
          {transitionError}
        </div>
      )}

      {broadPublishPending && (
        <BroadPublishConfirmDialog
          message={message}
          targetAction={broadPublishPending}
          onConfirm={onBroadPublishConfirm}
          onCancel={onBroadPublishCancel}
        />
      )}

      {schedulingConfirmPending && (
        <div
          className="callout info admin-marketing-confirm-wrap"
          role="alertdialog"
          aria-label="Confirm scheduling"
          data-testid="scheduling-truth-confirm"
        >
          <strong>Manual publish required</strong>
          <p className="admin-marketing-confirm-text">
            Scheduling stages this message. It will NOT be auto-delivered — you must publish manually.
          </p>
          <div className="admin-marketing-confirm-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={onSchedulingConfirm}
              data-testid="scheduling-truth-confirm-yes"
            >
              Confirm schedule
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={onSchedulingCancel}
              data-testid="scheduling-truth-confirm-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-marketing-detail-body">
        <div className="eyebrow">Body text</div>
        <BodyTextPreview text={message.body_text} />
      </div>

      <div className="admin-marketing-detail-grid">
        <div>
          <div className="small muted">Severity</div>
          <strong>{message.severity_token}</strong>
        </div>
        <div>
          <div className="small muted">Starts at</div>
          <span>{message.starts_at ? formatTimestamp(message.starts_at) : 'Not set'}</span>
        </div>
        <div>
          <div className="small muted">Ends at</div>
          <span>{message.ends_at ? formatTimestamp(message.ends_at) : 'Not set'}</span>
        </div>
        <div>
          <div className="small muted">Created</div>
          <span>{formatTimestamp(message.created_at)}</span>
        </div>
        <div>
          <div className="small muted">Updated</div>
          <span>{formatTimestamp(message.updated_at)}</span>
        </div>
        {message.published_at ? (
          <div>
            <div className="small muted">Published</div>
            <span>{formatTimestamp(message.published_at)}</span>
          </div>
        ) : null}
        <div>
          <div className="small muted">Row version (CAS)</div>
          <span>{message.row_version}</span>
        </div>
      </div>

      {isAdmin && allowedTransitions.length > 0 && (
        <div className="admin-marketing-transition-row">
          {allowedTransitions.map((target) => (
            <button
              key={target}
              className="btn secondary"
              type="button"
              disabled={transitioning}
              data-testid={`transition-${target}`}
              data-transition={target}
              onClick={() => onTransition(target)}
            >
              {transitioning ? 'Processing...' : (TRANSITION_LABELS[target] || target)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

function MessageListRow({ message, onSelect }) {
  return (
    <div
      className="skill-row admin-marketing-row-pointer"
      data-testid="marketing-message-row"
      data-message-id={message.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(message.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(message.id); }}
    >
      <div>
        <strong>{message.title || 'Untitled'}</strong>
        <div className="small muted">{message.message_type} &middot; {message.audience}</div>
      </div>
      <div><StatusBadge status={message.status} /></div>
      <div className="small muted">{message.severity_token}</div>
      <div className="small muted">Updated {formatTimestamp(message.updated_at)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section component
// ---------------------------------------------------------------------------

export function AdminMarketingSection({ accessContext }) {
  const isAdmin = (accessContext?.role || accessContext?.shellAccess?.platformRole || '').toLowerCase() === 'admin';

  // API instance — created once
  const apiRef = React.useRef(null);
  if (!apiRef.current) {
    apiRef.current = createAdminMarketingApi();
  }
  const api = apiRef.current;

  // Local state
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [refreshedAt, setRefreshedAt] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [showEditForm, setShowEditForm] = React.useState(false);
  const [editError, setEditError] = React.useState('');
  const [transitionError, setTransitionError] = React.useState('');
  const [broadPublishPending, setBroadPublishPending] = React.useState(null);
  const [schedulingConfirmPending, setSchedulingConfirmPending] = React.useState(false);
  const pendingTransitionRef = React.useRef(null);

  const createLock = useSubmitLock();
  const editLock = useSubmitLock();
  const transitionLock = useSubmitLock();

  // MEDIUM-2: generation counter guards against rapid-refresh race conditions.
  // If a newer fetch starts before an older one resolves, the older response
  // is discarded so stale data never overwrites fresh data.
  const fetchGeneration = React.useRef(0);

  // Fetch messages on mount (lazy-load on tab activation)
  const fetchMessages = React.useCallback(async () => {
    const gen = ++fetchGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.fetchMarketingMessages();
      if (gen !== fetchGeneration.current) return; // stale response — discard
      const normalised = (result?.messages || []).map(normaliseMarketingMessage);
      setMessages(normalised);
      // P6 U4: capture server-provided freshness timestamp
      if (result?.refreshedAt) {
        setRefreshedAt(new Date(result.refreshedAt).getTime() || null);
      } else {
        setRefreshedAt(Date.now());
      }
    } catch (err) {
      if (gen !== fetchGeneration.current) return; // stale error — discard
      setError(err?.message || 'Failed to load marketing messages.');
    } finally {
      if (gen === fetchGeneration.current) setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Select a message
  const selectedMessage = messages.find((m) => m.id === selectedId) || null;

  const handleSelect = (id) => {
    setSelectedId(id);
    setShowEditForm(false);
    setEditError('');
    setTransitionError('');
    setBroadPublishPending(null);
  };

  const handleBack = () => {
    setSelectedId(null);
    setShowEditForm(false);
    setEditError('');
    setTransitionError('');
    setBroadPublishPending(null);
  };

  // Edit draft message
  const handleEditClick = () => {
    setShowEditForm(true);
    setEditError('');
    setTransitionError('');
  };

  const handleEditCancel = () => {
    setShowEditForm(false);
    setEditError('');
  };

  const handleEditSubmit = (data) => {
    return editLock.run(async () => {
      setEditError('');
      try {
        const result = await api.updateMarketingMessage(selectedMessage.id, data);
        if (result?.message) {
          const normalised = normaliseMarketingMessage(result.message);
          setMessages((prev) => prev.map((m) => (m.id === normalised.id ? normalised : m)));
          setShowEditForm(false);
        }
      } catch (err) {
        if (err?.status === 409 || err?.code === 'marketing_message_stale') {
          setEditError('This message was updated by another session. Please go back and refresh the list.');
          fetchMessages();
        } else {
          setEditError(err?.message || 'Failed to save changes.');
        }
      }
    });
  };

  // Create message — returns a promise so MarketingCreateForm can await it
  // and only clear the form on success (HIGH-2).
  const handleCreate = (data) => {
    return createLock.run(async () => {
      setError(null);
      try {
        const result = await api.createMarketingMessage(data);
        if (result?.message) {
          const normalised = normaliseMarketingMessage(result.message);
          setMessages((prev) => [normalised, ...prev]);
          setShowCreateForm(false);
        }
      } catch (err) {
        setError(err?.message || 'Failed to create message.');
        throw err; // re-throw so MarketingCreateForm's await rejects
      }
    });
  };

  // Lifecycle transition
  const handleTransition = (targetAction) => {
    if (!selectedMessage) return;
    setTransitionError('');
    setSchedulingConfirmPending(false);

    // Broad publish gate: all_signed_in audience on publish or schedule
    if (
      (targetAction === 'published' || targetAction === 'scheduled')
      && selectedMessage.audience === 'all_signed_in'
    ) {
      setBroadPublishPending(targetAction);
      pendingTransitionRef.current = targetAction;
      return;
    }

    // Scheduling truth gate: confirm manual-publish semantics
    if (targetAction === 'scheduled') {
      setSchedulingConfirmPending(true);
      pendingTransitionRef.current = targetAction;
      return;
    }

    executeTransition(targetAction, false);
  };

  const executeTransition = (targetAction, confirmBroadPublish) => {
    transitionLock.run(async () => {
      setTransitionError('');
      setBroadPublishPending(null);
      try {
        const result = await api.transitionMarketingMessage(selectedMessage.id, {
          action: targetAction,
          expectedRowVersion: selectedMessage.row_version,
          confirmBroadPublish,
          mutation: { requestId: uid('mkt-transition') },
        });
        if (result?.message) {
          const normalised = normaliseMarketingMessage(result.message);
          setMessages((prev) => prev.map((m) => (m.id === normalised.id ? normalised : m)));
        }
      } catch (err) {
        if (err?.status === 409 || err?.code === 'marketing_message_stale') {
          setTransitionError('This message was updated by another session. Please go back and refresh the list.');
          fetchMessages(); // HIGH-1: refresh stale local state after CAS conflict
        } else {
          setTransitionError(err?.message || 'Transition failed.');
        }
      }
    });
  };

  const handleBroadPublishConfirm = () => {
    const action = pendingTransitionRef.current;
    if (action) {
      executeTransition(action, true);
    }
  };

  const handleBroadPublishCancel = () => {
    setBroadPublishPending(null);
    pendingTransitionRef.current = null;
  };

  const handleSchedulingConfirm = () => {
    const action = pendingTransitionRef.current;
    setSchedulingConfirmPending(false);
    if (action) {
      executeTransition(action, false);
    }
  };

  const handleSchedulingCancel = () => {
    setSchedulingConfirmPending(false);
    pendingTransitionRef.current = null;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Edit form view (replaces detail view)
  if (selectedMessage && showEditForm) {
    return (
      <section className="card admin-card-spaced" data-testid="marketing-edit-view">
        <div className="card-header">
          <div>
            <div className="eyebrow">Edit draft message</div>
            <h3 className="section-title admin-section-title">{selectedMessage.title}</h3>
          </div>
        </div>
        {editError && (
          <div className="feedback bad admin-marketing-feedback-spaced" data-testid="edit-error">
            {editError}
          </div>
        )}
        <MarketingEditForm
          message={selectedMessage}
          onSubmit={handleEditSubmit}
          onCancel={handleEditCancel}
          submitting={editLock.locked}
        />
      </section>
    );
  }

  // Detail view
  if (selectedMessage) {
    return (
      <MessageDetail
        message={selectedMessage}
        isAdmin={isAdmin}
        onTransition={handleTransition}
        onBack={handleBack}
        onEdit={handleEditClick}
        editError={editError}
        transitionError={transitionError}
        transitioning={transitionLock.locked}
        broadPublishPending={broadPublishPending}
        onBroadPublishConfirm={handleBroadPublishConfirm}
        onBroadPublishCancel={handleBroadPublishCancel}
        schedulingConfirmPending={schedulingConfirmPending}
        onSchedulingConfirm={handleSchedulingConfirm}
        onSchedulingCancel={handleSchedulingCancel}
      />
    );
  }

  // List view — uses AdminPanelFrame for unified freshness/failure/empty handling
  return (
    <AdminPanelFrame
      eyebrow="Marketing & Live Ops"
      title="Marketing messages"
      subtitle="Create and manage announcements, maintenance banners, and campaign messages. Messages follow the lifecycle: draft, scheduled, published, paused, archived."
      refreshedAt={refreshedAt}
      refreshError={error ? { message: error } : null}
      onRefresh={fetchMessages}
      data={messages}
      loading={loading}
      headerExtras={
        isAdmin ? (
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            data-testid="toggle-create-form"
          >
            {showCreateForm ? 'Cancel' : 'New message'}
          </button>
        ) : null
      }
      emptyState={
        <p className="small muted" data-testid="marketing-empty">
          No marketing messages found. {isAdmin ? 'Create one to get started.' : ''}
        </p>
      }
      loadingSkeleton={
        <p className="small muted">Loading marketing messages...</p>
      }
    >
      {isAdmin && showCreateForm && (
        <MarketingCreateForm onSubmit={handleCreate} submitting={createLock.locked} />
      )}

      {messages.map((msg) => (
        <MessageListRow key={msg.id} message={msg} onSelect={handleSelect} />
      ))}
    </AdminPanelFrame>
  );
}
