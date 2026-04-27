import React from 'react';
import { formatTimestamp, isBlocked } from './hub-utils.js';
import { MonsterVisualConfigPanel } from './MonsterVisualConfigPanel.jsx';
import { AdultConfidenceChip } from '../../subjects/grammar/components/AdultConfidenceChip.jsx';
import { GRAMMAR_RECENT_ATTEMPT_HORIZON } from '../../../shared/grammar/confidence.js';
import { buildAssetRegistry } from '../../platform/hubs/admin-asset-registry.js';

// U4+U5: Content section — content release, import validation, post-mega
// spelling debug, seed harness, grammar confidence, grammar writing try,
// and monster visual config. Extracted from AdminHubSurface.jsx.
// U10 (P3): Asset & Effect Registry card added above the raw config panel.

function ContentReleaseAndImport({ model, accessContext, actions }) {
  return (
    <section className="two-col" style={{ marginBottom: 20 }}>
      <article className="card">
        <div className="eyebrow">Content release status</div>
        <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Published spelling snapshot</h3>
        <div className="chip-row" style={{ marginTop: 14 }}>
          <span className="chip good">Release {String(model.contentReleaseStatus.publishedVersion || 0)}</span>
          <span className="chip">{model.contentReleaseStatus.publishedReleaseId || 'unpublished'}</span>
          <span className="chip">{String(model.contentReleaseStatus.runtimeWordCount || 0)} words</span>
          <span className="chip">{String(model.contentReleaseStatus.runtimeSentenceCount || 0)} sentences</span>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Draft {model.contentReleaseStatus.currentDraftId} · version {String(model.contentReleaseStatus.currentDraftVersion || 1)} · updated {formatTimestamp(model.contentReleaseStatus.draftUpdatedAt)}
        </p>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.openSubject('spelling')}>Open Spelling</button>
          <button className="btn secondary" type="button" disabled={isBlocked('open-subject', accessContext)} onClick={() => actions.dispatch('open-subject', { subjectId: 'spelling', tab: 'settings' })}>Open settings tab</button>
          <button className="btn ghost" type="button" onClick={() => actions.dispatch('spelling-content-export')}>Export content</button>
        </div>
      </article>
      <article className="card soft">
        <div className="eyebrow">Import / validation status</div>
        <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Draft versus published safety</h3>
        <div className={`feedback ${model.importValidationStatus.ok ? 'good' : 'bad'}`}>
          <strong>{model.importValidationStatus.ok ? 'Validation clean' : 'Validation problems present'}</strong>
          <div style={{ marginTop: 8 }}>Errors: {String(model.importValidationStatus.errorCount || 0)} · warnings: {String(model.importValidationStatus.warningCount || 0)}</div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Import provenance source: {model.importValidationStatus.source || 'bundled baseline'} · imported at {formatTimestamp(model.importValidationStatus.importedAt)}</p>
        {(model.importValidationStatus.errors || []).length ? (
          <details style={{ marginTop: 12 }}>
            <summary>Validation issues</summary>
            <div className="small muted" style={{ marginTop: 10 }}>
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
    <section className="card" style={{ marginBottom: 20 }} data-panel="post-mega-spelling-debug">
      <div className="eyebrow">Spelling · post-mega</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Why is Guardian locked?</h3>
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
      <section className="card" style={{ marginBottom: 20 }} data-panel="post-mega-seed-harness">
        <div className="eyebrow">QA · post-Mega seed</div>
        <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Admin-only seed harness</h3>
        <div className="feedback warn">Only admin accounts can apply QA seed shapes. Ops-role viewers keep read-only access to the diagnostic panels.</div>
      </section>
    );
  }

  const effectiveLearnerId = manualLearnerId.trim() || learnerId;
  const canApply = Boolean(effectiveLearnerId) && Boolean(shapeName);

  return (
    <section className="card" style={{ marginBottom: 20 }} data-panel="post-mega-seed-harness">
      <div className="eyebrow">QA · post-Mega seed</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Post-Mega learner seed harness</h3>
      <p className="small muted">
        Write a deterministic post-Mega learner state into the child subject
        store. Useful for reproducing the 8 canonical fixtures without playing
        a round. Seed overwrites existing state; the pre-image is captured in
        the audit log for rollback.
      </p>
      <div className="skill-row">
        <label className="field" style={{ minWidth: 220 }}>
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
        <label className="field" style={{ minWidth: 220 }}>
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
        <label className="field" style={{ minWidth: 220 }}>
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
          <div className="small muted" style={{ marginTop: 6 }}>
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
    <section className="card" style={{ marginBottom: 20 }} data-panel="grammar-concept-confidence">
      <div className="eyebrow">Grammar · concept confidence</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Grammar concepts</h3>
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
      <section className="card" style={{ marginBottom: 20 }} data-panel="grammar-writing-try-admin">
        <div className="eyebrow">Grammar · Writing Try admin</div>
        <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Writing Try — archive and delete</h3>
        <p className="small muted">Choose a learner to manage their saved Writing Try entries.</p>
      </section>
    );
  }
  return (
    <section className="card" style={{ marginBottom: 20 }} data-panel="grammar-writing-try-admin">
      <div className="eyebrow">Grammar · Writing Try admin</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Writing Try — archive and delete</h3>
      <p className="small muted">
        Writing Try evidence is non-scored. Archive removes an entry from the learner's active list without deleting it. Delete is only allowed once an entry is archived.
      </p>
      <section aria-labelledby="grammar-writing-try-admin-live" style={{ marginTop: 16 }}>
        <h4 id="grammar-writing-try-admin-live" className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
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
      <section aria-labelledby="grammar-writing-try-admin-archive" style={{ marginTop: 20 }}>
        <h4 id="grammar-writing-try-admin-archive" className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
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
              className="skill-list"
              style={{ marginTop: 12 }}
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
            <p className="small muted" style={{ marginTop: 12 }}>
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
      className="card"
      data-panel="asset-registry-card"
      data-asset-id={entry.assetId}
      style={{ marginBottom: 20 }}
    >
      <div className="card-header">
        <div>
          <div className="eyebrow">Asset registry · {entry.category}</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>{entry.displayName}</h3>
          <div className="chip-row" style={{ marginTop: 12 }}>
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
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
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

      <div style={{ marginTop: 16 }}>
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
        <div className="feedback bad" style={{ marginTop: 16 }} data-testid="registry-validation-errors">
          <strong>Validation blockers ({String(entry.validationState.errorCount)})</strong>
          {entry.validationState.warningCount > 0 ? (
            <span className="small muted" style={{ marginLeft: 8 }}>
              + {String(entry.validationState.warningCount)} warning{entry.validationState.warningCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {entry.validationState.errors.length > 0 ? (
            <details style={{ marginTop: 8 }}>
              <summary className="small">Show blockers</summary>
              <ul className="small muted" style={{ marginTop: 6, paddingLeft: 18 }}>
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
        <div className="feedback warn" style={{ marginTop: 16 }} data-testid="registry-empty-state">
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
    <section data-panel="asset-registry" style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Asset &amp; Effect Registry</div>
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
