import React from 'react';
import { formatTimestamp, isBlocked } from './hub-utils.js';
import { MonsterVisualConfigPanel } from './MonsterVisualConfigPanel.jsx';
import { AdultConfidenceChip } from '../../subjects/grammar/components/AdultConfidenceChip.jsx';
import { GRAMMAR_RECENT_ATTEMPT_HORIZON } from '../../../shared/grammar/confidence.js';
import { buildAssetRegistry } from '../../platform/hubs/admin-asset-registry.js';
import {
  buildSubjectContentOverview,
  statusBadgeClass,
  statusLabel,
  drilldownPanelSelector,
} from '../../platform/hubs/admin-content-overview.js';

// U4+U5: Content section — content release, import validation, post-mega
// spelling debug, seed harness, grammar confidence, grammar writing try,
// and monster visual config. Extracted from AdminHubSurface.jsx.
// U10 (P3): Asset & Effect Registry card added above the raw config panel.
// U9 (P3): Subject Overview panel at top — cross-subject operating surface.

// U9 (P3): Subject Overview panel. Renders a cross-subject status table
// that distinguishes live, gated, and placeholder subjects. Surfaces
// release version, validation errors, 7d error counts, and support load
// signals per subject. Content-free leaf: imports only the provider
// contract and rendering helpers from admin-content-overview.js.
//
// U9 (P5): Honest drilldown actions. Each row now surfaces a truthful
// action label indicating whether clicking does anything. Rows are only
// clickable when drilldownAction maps to a real panel.

/**
 * Human-readable action label for the drilldown column.
 */
function drilldownActionLabel(action) {
  if (action === 'diagnostics') return 'Open diagnostics';
  if (action === 'asset_registry') return 'Open asset registry';
  if (action === 'content_release') return 'Open content release';
  if (action === 'none') return 'No drilldown yet';
  return 'Placeholder — not live';
}

function SubjectOverviewPanel({ model, actions }) {
  const overview = React.useMemo(
    () => buildSubjectContentOverview(model?.contentOverview),
    [model?.contentOverview],
  );

  // Error state: overview data failed to load
  if (model?.contentOverviewError) {
    return (
      <section className="card admin-card-spaced" data-panel="subject-overview">
        <div className="eyebrow">Content Management</div>
        <h3 className="section-title admin-section-title">Subject Overview</h3>
        <div className="feedback bad">
          <strong>Unable to load subject overview</strong>
          <div className="small muted admin-note-spaced">
            {typeof model.contentOverviewError === 'string'
              ? model.contentOverviewError
              : 'The content overview endpoint returned an error. Per-subject panels below may still work.'}
          </div>
        </div>
      </section>
    );
  }

  if (!overview.length) {
    return null;
  }

  const isClickable = (subject) =>
    subject.drilldownAction !== 'none' && subject.drilldownAction !== 'placeholder';

  const handleRowClick = (subject) => {
    if (!isClickable(subject)) return;
    const selector = drilldownPanelSelector(subject);
    if (!selector) return;
    const target = document.querySelector(selector);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="card admin-card-spaced" data-panel="subject-overview">
      <div className="eyebrow">Content Management</div>
      <h3 className="section-title admin-section-title">Subject Overview</h3>
      <p className="small muted admin-overview-desc">
        Cross-subject operating surface. Live subjects have production data; placeholders
        are planned but not yet active.
      </p>
      <table className="admin-subject-overview-table admin-overview-table" aria-label="Subject content overview">
        <thead>
          <tr className="admin-overview-thead-row">
            <th className="small admin-overview-th-first">Subject</th>
            <th className="small admin-overview-th">Status</th>
            <th className="small admin-overview-th">Release</th>
            <th className="small admin-overview-th-right">Errors (7d)</th>
            <th className="small admin-overview-th-right">Validation</th>
            <th className="small admin-overview-th">Support Load</th>
            <th className="small admin-overview-th">Action</th>
          </tr>
        </thead>
        <tbody>
          {overview.map((subject) => (
            <tr
              key={subject.subjectKey}
              className="admin-overview-tbody-row"
              data-subject-key={subject.subjectKey}
              data-subject-status={subject.status}
              data-drilldown-action={subject.drilldownAction}
              data-clickable={isClickable(subject) ? 'true' : undefined}
              onClick={isClickable(subject) ? () => handleRowClick(subject) : undefined}
              role={isClickable(subject) ? 'button' : undefined}
              tabIndex={isClickable(subject) ? 0 : undefined}
              aria-label={isClickable(subject) ? `Scroll to ${subject.displayName} diagnostics` : undefined}
            >
              <td className="admin-overview-td-first">
                {subject.displayName}
              </td>
              <td className="admin-overview-td">
                <span
                  className={`chip ${statusBadgeClass(subject.status)}`}
                  data-testid={`status-badge-${subject.subjectKey}`}
                >
                  {statusLabel(subject.status)}
                </span>
              </td>
              <td className="small admin-overview-td">
                {subject.releaseVersion
                  ? <span data-testid={`release-${subject.subjectKey}`}>v{subject.releaseVersion}</span>
                  : <span className="muted" data-testid={`release-${subject.subjectKey}`}>
                      {subject.status === 'placeholder' ? '—' : 'No release'}
                    </span>}
              </td>
              <td className="small admin-overview-td-right">
                <span data-testid={`errors-${subject.subjectKey}`}>
                  {String(subject.errorCount7d)}
                </span>
              </td>
              <td className="small admin-overview-td-right">
                <span data-testid={`validation-${subject.subjectKey}`}>
                  {subject.status === 'placeholder'
                    ? '—'
                    : String(subject.validationErrors)}
                </span>
              </td>
              <td className="admin-overview-td">
                {subject.status !== 'placeholder' ? (
                  <span
                    className={`chip ${subject.supportLoadSignal === 'high' ? 'bad' : subject.supportLoadSignal === 'medium' ? 'warn' : subject.supportLoadSignal === 'low' ? '' : ''}`}
                    data-testid={`support-${subject.subjectKey}`}
                  >
                    {subject.supportLoadSignal === 'none' ? 'Clear' : subject.supportLoadSignal.charAt(0).toUpperCase() + subject.supportLoadSignal.slice(1)}
                  </span>
                ) : (
                  <span className="small muted" data-testid={`support-${subject.subjectKey}`}>—</span>
                )}
              </td>
              <td className="small admin-overview-td">
                <span
                  className={isClickable(subject) ? '' : 'muted'}
                  data-testid={`action-${subject.subjectKey}`}
                >
                  {drilldownActionLabel(subject.drilldownAction)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ContentReleaseAndImport({ model, accessContext, actions }) {
  return (
    <section className="two-col admin-card-spaced">
      <article className="card">
        <div className="eyebrow">Content release status</div>
        <h3 className="section-title admin-section-title">Published spelling snapshot</h3>
        <div className="chip-row admin-chip-row-spaced">
          <span className="chip good">Release {String(model.contentReleaseStatus.publishedVersion || 0)}</span>
          <span className="chip">{model.contentReleaseStatus.publishedReleaseId || 'unpublished'}</span>
          <span className="chip">{String(model.contentReleaseStatus.runtimeWordCount || 0)} words</span>
          <span className="chip">{String(model.contentReleaseStatus.runtimeSentenceCount || 0)} sentences</span>
        </div>
        <p className="small muted admin-meta-spaced">
          Draft {model.contentReleaseStatus.currentDraftId} · version {String(model.contentReleaseStatus.currentDraftVersion || 1)} · updated {formatTimestamp(model.contentReleaseStatus.draftUpdatedAt)}
        </p>
        <div className="actions admin-actions-spaced">
          <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.openSubject('spelling')}>Open Spelling</button>
          <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.dispatch('open-subject', { subjectId: 'spelling', tab: 'settings' })}>Open settings tab</button>
          <button className="btn ghost" type="button" onClick={() => actions.dispatch('spelling-content-export')}>Export content</button>
        </div>
      </article>
      <article className="card soft">
        <div className="eyebrow">Import / validation status</div>
        <h3 className="section-title admin-section-title">Draft versus published safety</h3>
        <div className={`feedback ${model.importValidationStatus.ok ? 'good' : 'bad'}`}>
          <strong>{model.importValidationStatus.ok ? 'Validation clean' : 'Validation problems present'}</strong>
          <div className="admin-detail-spaced">Errors: {String(model.importValidationStatus.errorCount || 0)} · warnings: {String(model.importValidationStatus.warningCount || 0)}</div>
        </div>
        <p className="small muted admin-meta-spaced">Import provenance source: {model.importValidationStatus.source || 'bundled baseline'} · imported at {formatTimestamp(model.importValidationStatus.importedAt)}</p>
        {(model.importValidationStatus.errors || []).length ? (
          <details className="admin-validation-details">
            <summary>Validation issues</summary>
            <div className="small muted admin-validation-list">
              {model.importValidationStatus.errors.map((issue) => `${issue.code} - ${issue.message}`).join('\n')}
            </div>
          </details>
        ) : null}
      </article>
    </section>
  );
}

function PostMegaSpellingDebugPanel({ debug = null }) {
  const safe = debug && typeof debug === 'object' && !Array.isArray(debug) ? debug : {};
  const source = typeof safe.source === 'string' && safe.source ? safe.source : 'locked-fallback';
  const preview = Array.isArray(safe.blockingCoreSlugsPreview) ? safe.blockingCoreSlugsPreview : [];
  const items = [
    ['Source', source],
    ['All core Mega', safe.allWordsMega ? 'true' : 'false'],
    ['Sticky unlocked', safe.stickyUnlocked ? 'true' : 'false'],
    ['Published core count', String(Number(safe.publishedCoreCount) || 0)],
    ['Secure core count', String(Number(safe.secureCoreCount) || 0)],
    ['Blocking core count', String(Number(safe.blockingCoreCount) || 0)],
    ['Guardian map count', String(Number(safe.guardianMapCount) || 0)],
    ['Extra words ignored', String(Number(safe.extraWordsIgnoredCount) || 0)],
    ['Content release id', safe.contentReleaseId ? String(safe.contentReleaseId) : '—'],
  ];
  return (
    <section className="card admin-card-spaced" data-panel="post-mega-spelling-debug">
      <div className="eyebrow">Spelling · post-mega</div>
      <h3 className="section-title admin-section-title">Why is Guardian locked?</h3>
      <p className="small muted">
        Diagnostic snapshot for the currently selected learner. Surfaces the post-mega gate inputs so
        an operator can see which core words still block graduation. No personal data is rendered —
        only curriculum-public slug strings and integer counts.
      </p>
      <dl className="post-mega-debug-dl">
        {items.map(([label, value]) => (
          <div className="post-mega-debug-row" key={label}>
            <dt className="small muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className="post-mega-debug-row" key="blockingCoreSlugsPreview">
          <dt className="small muted">Blocking slugs (first 10)</dt>
          <dd>
            {preview.length
              ? <code className="small">{preview.join(', ')}</code>
              : <span className="small muted">None — every core slug is secure.</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function PostMegaSeedHarnessPanel({ model, actions }) {
  const isAdmin = model?.permissions?.platformRole === 'admin';
  const shapes = Array.isArray(model?.postMegaSeedHarness?.shapes)
    ? model.postMegaSeedHarness.shapes
    : [];
  const accessibleLearners = Array.isArray(model?.learnerSupport?.accessibleLearners)
    ? model.learnerSupport.accessibleLearners
    : [];
  const defaultLearnerId = model?.learnerSupport?.selectedLearnerId || '';
  const [shapeName, setShapeName] = React.useState(shapes[0] || '');
  const [learnerId, setLearnerId] = React.useState(defaultLearnerId);
  const [manualLearnerId, setManualLearnerId] = React.useState('');

  React.useEffect(() => {
    if (!shapeName && shapes.length) setShapeName(shapes[0]);
  }, [shapes, shapeName]);
  React.useEffect(() => {
    if (!learnerId && defaultLearnerId) setLearnerId(defaultLearnerId);
  }, [defaultLearnerId, learnerId]);

  if (!isAdmin) {
    return (
      <section className="card admin-card-spaced" data-panel="post-mega-seed-harness">
        <div className="eyebrow">QA · post-Mega seed</div>
        <h3 className="section-title admin-section-title">Admin-only seed harness</h3>
        <div className="feedback warn">Only admin accounts can apply QA seed shapes. Ops-role viewers keep read-only access to the diagnostic panels.</div>
      </section>
    );
  }

  const effectiveLearnerId = manualLearnerId.trim() || learnerId;
  const canApply = Boolean(effectiveLearnerId) && Boolean(shapeName);

  return (
    <section className="card admin-card-spaced" data-panel="post-mega-seed-harness">
      <div className="eyebrow">QA · post-Mega seed</div>
      <h3 className="section-title admin-section-title">Post-Mega learner seed harness</h3>
      <p className="small muted">
        Write a deterministic post-Mega learner state into the child subject
        store. Useful for reproducing the 8 canonical fixtures without playing
        a round. Seed overwrites existing state; the pre-image is captured in
        the audit log for rollback.
      </p>
      <div className="skill-row">
        <label className="field admin-field-select">
          <span>Seed shape</span>
          <select
            className="select"
            name="postMegaSeedShape"
            value={shapeName}
            onChange={(event) => setShapeName(event.target.value)}
          >
            {shapes.map((shape) => (
              <option value={shape} key={shape}>{shape}</option>
            ))}
          </select>
        </label>
        <label className="field admin-field-select">
          <span>Existing learner</span>
          <select
            className="select"
            name="postMegaSeedLearnerId"
            value={learnerId}
            onChange={(event) => setLearnerId(event.target.value)}
          >
            <option value="">— choose learner —</option>
            {accessibleLearners.map((entry) => (
              <option value={entry.learnerId} key={entry.learnerId}>
                {entry.learnerName} · {entry.yearGroup}
              </option>
            ))}
          </select>
        </label>
        <label className="field admin-field-select">
          <span>…or new learner id</span>
          <input
            className="input"
            type="text"
            name="postMegaSeedManualLearnerId"
            value={manualLearnerId}
            maxLength={64}
            pattern="[a-z0-9][a-z0-9-]{0,63}"
            title="Lowercase letters, digits, and hyphens. Must start with a letter or digit. Maximum 64 characters."
            onChange={(event) => setManualLearnerId(event.target.value)}
            placeholder="seed-learner-2026-04-26"
          />
        </label>
        <div>
          <button
            className="btn secondary"
            type="button"
            disabled={!canApply}
            onClick={() => actions.dispatch('post-mega-seed-apply', {
              learnerId: effectiveLearnerId,
              shapeName,
            })}
          >
            Apply seed
          </button>
          <div className="small muted admin-note-spaced">
            {canApply
              ? `Will write ${shapeName} → ${effectiveLearnerId}.`
              : 'Choose a shape and learner to apply.'}
          </div>
        </div>
      </div>
    </section>
  );
}

function GrammarConceptConfidencePanel({ evidence }) {
  const rows = Array.isArray(evidence?.conceptStatus) ? evidence.conceptStatus : [];
  return (
    <section className="card admin-card-spaced" data-panel="grammar-concept-confidence">
      <div className="eyebrow">Grammar · concept confidence</div>
      <h3 className="section-title admin-section-title">Grammar concepts</h3>
      <p className="small muted">
        Adult-facing confidence label per concept for the selected learner, with the full evidence shape: sample size, recent misses, interval-days spacing, and distinct-template coverage over the last {GRAMMAR_RECENT_ATTEMPT_HORIZON} attempts.
      </p>
      {rows.length ? (
        <ul className="admin-grammar-confidence-list" aria-label="Grammar concept confidence chips">
          {rows.map((row) => (
            <li
              className="admin-grammar-confidence-row skill-row"
              key={row.id || row.name}
              data-concept-id={row.id || ''}
            >
              <div>
                <strong>{row.name || row.id}</strong>
                <div className="small muted">{row.domain || 'Grammar'}</div>
              </div>
              <div>
                <AdultConfidenceChip
                  confidence={row.confidence || null}
                  showAdminExtras
                />
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="small muted">No Grammar concept evidence has been recorded for this learner.</p>}
    </section>
  );
}

function GrammarWritingTryAdminPanel({ learnerId, transfer, actions }) {
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const liveEntries = Array.isArray(transfer?.evidence) ? transfer.evidence : [];
  const archivedEntries = Array.isArray(transfer?.archive) ? transfer.archive : [];
  if (!learnerId) {
    return (
      <section className="card admin-card-spaced" data-panel="grammar-writing-try-admin">
        <div className="eyebrow">Grammar · Writing Try admin</div>
        <h3 className="section-title admin-section-title">Writing Try — archive and delete</h3>
        <p className="small muted">Choose a learner to manage their saved Writing Try entries.</p>
      </section>
    );
  }
  return (
    <section className="card admin-card-spaced" data-panel="grammar-writing-try-admin">
      <div className="eyebrow">Grammar · Writing Try admin</div>
      <h3 className="section-title admin-section-title">Writing Try — archive and delete</h3>
      <p className="small muted">
        Writing Try evidence is non-scored. Archive removes an entry from the learner's active list without deleting it. Delete is only allowed once an entry is archived.
      </p>
      <section aria-labelledby="grammar-writing-try-admin-live" className="admin-writing-try-section">
        <h4 id="grammar-writing-try-admin-live" className="small admin-writing-try-heading">
          Active entries
        </h4>
        {liveEntries.length ? (
          <ul className="skill-list" aria-label="Active Writing Try entries">
            {liveEntries.map((entry) => (
              <li
                className="skill-row"
                key={`live-${entry.promptId}`}
                data-prompt-id={entry.promptId}
                data-entry-kind="live"
              >
                <div>
                  <strong>{entry.promptId}</strong>
                  <div className="small muted">
                    Saved {formatTimestamp(entry.latest?.savedAt || entry.updatedAt)}
                  </div>
                </div>
                <div>
                  <button
                    className="btn secondary"
                    type="button"
                    data-action="grammar-transfer-admin-archive"
                    data-prompt-id={entry.promptId}
                    onClick={() => actions.dispatch('grammar-transfer-admin-archive', {
                      learnerId,
                      promptId: entry.promptId,
                    })}
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No active Writing Try entries for this learner.</p>
        )}
      </section>
      <section aria-labelledby="grammar-writing-try-admin-archive" className="admin-writing-try-archive-section">
        <h4 id="grammar-writing-try-admin-archive" className="small admin-writing-try-heading">
          Archived entries
        </h4>
        <button
          className="btn ghost sm"
          type="button"
          aria-expanded={archiveOpen ? 'true' : 'false'}
          aria-controls="grammar-writing-try-admin-archive-list"
          onClick={() => setArchiveOpen((open) => !open)}
        >
          {archiveOpen ? 'Hide archive' : `Show archive (${archivedEntries.length})`}
        </button>
        {archiveOpen ? (
          archivedEntries.length ? (
            <ul
              id="grammar-writing-try-admin-archive-list"
              className="skill-list admin-writing-try-archive-list"
              aria-label="Archived Writing Try entries"
            >
              {archivedEntries.map((entry) => (
                <li
                  className="skill-row"
                  key={`archive-${entry.promptId}`}
                  data-prompt-id={entry.promptId}
                  data-entry-kind="archive"
                >
                  <div>
                    <strong>{entry.promptId}</strong>
                    <div className="small muted">
                      Archived {formatTimestamp(entry.archivedAt || entry.updatedAt)}
                    </div>
                  </div>
                  <div>
                    <button
                      className="btn warn"
                      type="button"
                      data-action="grammar-transfer-admin-delete"
                      data-prompt-id={entry.promptId}
                      onClick={() => actions.dispatch('grammar-transfer-admin-delete', {
                        learnerId,
                        promptId: entry.promptId,
                      })}
                    >
                      Delete permanently
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted admin-writing-try-archive-empty">
              No archived Writing Try entries for this learner.
            </p>
          )
        ) : null}
      </section>
    </section>
  );
}

// U10 (P3): Registry-shaped card for a single asset entry. Renders status
// badges, version indicators, validation state, and action buttons that
// delegate to existing mutation dispatch keys. Designed so multiple cards
// can be stacked when future asset categories are added.
function AssetRegistryCard({ entry, model, actions }) {
  if (!entry) return null;

  const publishedLabel = entry.publishedVersion > 0
    ? `v${entry.publishedVersion}`
    : 'First publish pending';
  const publishedAtLabel = entry.lastPublishedAt > 0
    ? formatTimestamp(entry.lastPublishedAt)
    : null;
  const hashLabel = entry.manifestHash
    ? entry.manifestHash.slice(0, 12)
    : null;

  const statusChipClass = entry.reviewStatus === 'publishable'
    ? 'good'
    : entry.reviewStatus === 'has-blockers'
      ? 'bad'
      : entry.reviewStatus === 'clean'
        ? 'warn'
        : '';
  const statusChipLabel = entry.reviewStatus === 'publishable'
    ? 'Publishable'
    : entry.reviewStatus === 'has-blockers'
      ? `${entry.validationState.errorCount} blocker${entry.validationState.errorCount === 1 ? '' : 's'}`
      : entry.reviewStatus === 'clean'
        ? 'Warnings Only'
        : 'No Validation';

  const visual = model?.monsterVisualConfig || {};
  const status = visual?.status || {};

  return (
    <article
      className="card admin-card-spaced"
      data-panel="asset-registry-card"
      data-asset-id={entry.assetId}
    >
      <div className="card-header">
        <div>
          <div className="eyebrow">Asset registry · {entry.category}</div>
          <h3 className="section-title admin-section-title">{entry.displayName}</h3>
          <div className="chip-row admin-meta-spaced">
            <span className="chip" data-testid="registry-published-version">
              Published: {publishedLabel}
            </span>
            <span className="chip" data-testid="registry-draft-version">
              Draft: rev {String(entry.draftVersion)}
            </span>
            <span className={`chip ${statusChipClass}`} data-testid="registry-review-status">
              {statusChipLabel}
            </span>
            {entry.canManage
              ? <span className="chip good">Admin edit</span>
              : <span className="chip warn">Read-only</span>}
          </div>
        </div>
        <div className="actions admin-registry-actions-end">
          <button
            className="btn good"
            type="button"
            disabled={!entry.canManage || !entry.validationState.ok || !entry.hasDraft}
            data-action="registry-publish"
            onClick={() => actions.dispatch('monster-visual-config-publish', {
              expectedDraftRevision: status.draftRevision,
            })}
          >
            Publish
          </button>
          <select
            className="select"
            disabled={!entry.canManage || !entry.versions.length}
            data-action="registry-restore"
            onChange={(event) => {
              const version = Number(event.target.value) || 0;
              if (!version) return;
              actions.dispatch('monster-visual-config-restore', {
                version,
                expectedDraftRevision: status.draftRevision,
              });
              event.target.value = '';
            }}
            defaultValue=""
            aria-label="Restore version"
          >
            <option value="">Restore version</option>
            {entry.versions.map((version) => (
              <option value={version.version} key={version.version}>
                Version {version.version} - {formatTimestamp(version.publishedAt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-registry-card-body">
        <dl className="registry-detail-grid" data-testid="registry-details">
          <div className="registry-detail-row">
            <dt className="small muted">Category</dt>
            <dd>{entry.category}</dd>
          </div>
          <div className="registry-detail-row">
            <dt className="small muted">Published version</dt>
            <dd data-testid="registry-published-value">{publishedLabel}</dd>
          </div>
          <div className="registry-detail-row">
            <dt className="small muted">Draft revision</dt>
            <dd>{String(entry.draftVersion)}</dd>
          </div>
          {hashLabel ? (
            <div className="registry-detail-row">
              <dt className="small muted">Manifest hash</dt>
              <dd data-testid="registry-manifest-hash">
                <code className="small">{hashLabel}</code>
              </dd>
            </div>
          ) : null}
          {publishedAtLabel ? (
            <div className="registry-detail-row">
              <dt className="small muted">Last published</dt>
              <dd data-testid="registry-published-at">{publishedAtLabel}</dd>
            </div>
          ) : null}
          {entry.lastPublishedBy ? (
            <div className="registry-detail-row">
              <dt className="small muted">Published by</dt>
              <dd data-testid="registry-published-by">{entry.lastPublishedBy}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {!entry.validationState.ok && entry.validationState.errorCount > 0 ? (
        <div className="feedback bad admin-registry-validation-feedback" data-testid="registry-validation-errors">
          <strong>Validation blockers ({String(entry.validationState.errorCount)})</strong>
          {entry.validationState.warningCount > 0 ? (
            <span className="small muted admin-registry-validation-warning-label">
              + {String(entry.validationState.warningCount)} warning{entry.validationState.warningCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {entry.validationState.errors.length > 0 ? (
            <details className="admin-registry-validation-details">
              <summary className="small">Show blockers</summary>
              <ul className="small muted admin-validation-issues-list">
                {entry.validationState.errors.slice(0, 5).map((issue, idx) => (
                  <li key={idx}>
                    {[issue.assetKey, issue.context, issue.field, issue.code].filter(Boolean).join(' / ') || issue.message || 'Validation error'}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {!entry.hasDraft && !entry.hasPublished ? (
        <div className="feedback warn admin-registry-empty-state" data-testid="registry-empty-state">
          No configuration has been initialised for this asset. Create a draft to get started.
        </div>
      ) : null}
    </article>
  );
}

// U10 (P3): Container that renders registry cards for all registered
// asset entries. Currently one (monster-visual-config); future categories
// extend by adding entries to `buildAssetRegistry`.
function AssetRegistrySection({ model, actions }) {
  const registry = React.useMemo(() => buildAssetRegistry(model), [model]);
  if (!registry.length) return null;
  return (
    <section data-panel="asset-registry" className="admin-registry-section">
      <div className="eyebrow admin-registry-section-eyebrow">Asset &amp; Effect Registry</div>
      {registry.map((entry) => (
        <AssetRegistryCard
          key={entry.assetId}
          entry={entry}
          model={model}
          actions={actions}
        />
      ))}
    </section>
  );
}

export function AdminContentSection({ model, appState, accessContext, actions }) {
  const selectedDiagnostics = model.learnerSupport?.selectedDiagnostics || null;
  const selectedLearnerId = model.learnerSupport?.selectedLearnerId || selectedDiagnostics?.learnerId || '';
  const selectedGrammarEvidence = selectedDiagnostics?.grammarEvidence || {};

  return (
    <>
      <SubjectOverviewPanel model={model} actions={actions} />
      <ContentReleaseAndImport model={model} accessContext={accessContext} actions={actions} />
      <PostMegaSpellingDebugPanel debug={model.postMasteryDebug} />
      <PostMegaSeedHarnessPanel model={model} actions={actions} />
      <GrammarConceptConfidencePanel evidence={selectedGrammarEvidence} />
      <GrammarWritingTryAdminPanel
        learnerId={selectedLearnerId}
        transfer={selectedDiagnostics?.grammarTransferAdmin || null}
        actions={actions}
      />
      <AssetRegistrySection model={model} actions={actions} />
      <MonsterVisualConfigPanel model={model} accountId={model.account?.id || ''} actions={actions} />
    </>
  );
}
