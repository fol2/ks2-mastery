import React, { useCallback, useMemo, useState } from 'react';
import { lookupTemplate } from '../../platform/game/render/effect-templates/index.js';
import { MonsterEffectFieldControls } from './MonsterEffectFieldControls.jsx';
import {
  applyCatalogTemplateChange,
  buildCatalogEntryFromTemplate,
  bundledCatalogEntry,
  catalogEntryAllErrors,
  catalogEntryDiffersFromBundled,
  catalogEntryIsBundled,
  catalogEntryNeedsReview,
  catalogParamSchemaErrors,
  EFFECT_CATALOG_BUNDLED_KINDS,
  EFFECT_CATALOG_TEMPLATE_OPTIONS,
} from './monster-effect-catalog-helpers.js';

// Re-export pure helpers for tests + sibling panels. Source of truth lives
// in `monster-effect-catalog-helpers.js`.
export {
  applyCatalogTemplateChange,
  buildCatalogEntryFromTemplate,
  bundledCatalogEntry,
  catalogEntryAllErrors,
  catalogEntryDiffersFromBundled,
  catalogEntryIsBundled,
  catalogEntryNeedsReview,
  catalogParamSchemaErrors,
  EFFECT_CATALOG_BUNDLED_KINDS,
  EFFECT_CATALOG_TEMPLATE_OPTIONS,
};

const ALLOWED_LIFECYCLES = ['persistent', 'transient', 'continuous'];
const ALLOWED_LAYERS = ['base', 'overlay'];
const ALLOWED_REDUCED_MOTION = ['omit', 'simplify', 'asis'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sortedCatalogKinds(catalog) {
  const kinds = Object.keys(catalog || {});
  // Bundled kinds first (in their declared order), then admin-created
  // kinds alphabetically — gives admin a predictable list ordering.
  const bundled = EFFECT_CATALOG_BUNDLED_KINDS.filter((kind) => catalog?.[kind]);
  const extras = kinds.filter((kind) => !catalogEntryIsBundled(kind)).sort();
  return [...bundled, ...extras];
}

function errorsByField(entry) {
  const map = {};
  for (const issue of catalogEntryAllErrors(entry)) {
    if (!issue?.field) continue;
    if (!map[issue.field]) map[issue.field] = [];
    map[issue.field].push(issue);
  }
  return map;
}

// Internal: produces the `errorsByField` shape the field controls expect for
// per-param schema errors only (not the full entry validation).
function paramErrorsByField(entry) {
  if (!entry) return {};
  const template = lookupTemplate(entry.template);
  const schema = template?.paramSchema || {};
  const map = {};
  for (const [name, descriptor] of Object.entries(entry.params || {})) {
    const issues = catalogParamSchemaErrors({
      paramName: name,
      descriptor,
      schema: schema[name],
    });
    if (issues.length > 0) map[name] = issues;
  }
  return map;
}

export function MonsterEffectCatalogPanel({
  draft,
  published,
  canManage = false,
  onDraftChange = () => {},
  accountId = '',
} = {}) {
  const catalog = draft?.catalog || {};
  const orderedKinds = useMemo(() => sortedCatalogKinds(catalog), [catalog]);
  const [selectedKind, setSelectedKind] = useState(orderedKinds[0] || null);
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState('');
  const [newTemplateId, setNewTemplateId] = useState(EFFECT_CATALOG_TEMPLATE_OPTIONS[0] || '');
  const [collisionMessage, setCollisionMessage] = useState('');
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');

  const selectedEntry = selectedKind ? catalog[selectedKind] : null;
  const selectedTemplate = selectedEntry ? lookupTemplate(selectedEntry.template) : null;
  const selectedErrors = useMemo(() => catalogEntryAllErrors(selectedEntry), [selectedEntry]);
  const selectedParamErrors = useMemo(() => paramErrorsByField(selectedEntry), [selectedEntry]);
  const hasErrors = selectedErrors.length > 0;

  const writeDraft = useCallback((mutator) => {
    if (!canManage) return;
    const next = clone(draft) || { catalog: {}, bindings: {}, celebrationTunables: {} };
    next.catalog = next.catalog || {};
    mutator(next);
    onDraftChange(next);
  }, [canManage, draft, onDraftChange]);

  const handleCreate = useCallback(() => {
    if (!canManage) return;
    if (!newKind) {
      setCollisionMessage('Kind is required.');
      return;
    }
    if (catalog[newKind]) {
      setCollisionMessage(`Kind "${newKind}" already exists in the catalog.`);
      return;
    }
    setCollisionMessage('');
    const created = buildCatalogEntryFromTemplate({ kind: newKind, templateId: newTemplateId });
    writeDraft((next) => {
      next.catalog[newKind] = created;
    });
    setSelectedKind(newKind);
    setCreating(false);
    setNewKind('');
  }, [canManage, catalog, newKind, newTemplateId, writeDraft]);

  const updateSelectedEntry = useCallback((mutator) => {
    if (!canManage || !selectedKind) return;
    writeDraft((next) => {
      const entry = next.catalog[selectedKind];
      if (!entry) return;
      mutator(entry);
      // Any edit to the entry's body resets the reviewed flag — admin must
      // re-confirm. Mirrors the visual panel's review-on-edit behaviour.
      entry.reviewed = false;
    });
  }, [canManage, selectedKind, writeDraft]);

  const handleParamChange = useCallback((paramName, value) => {
    updateSelectedEntry((entry) => {
      entry.params = entry.params || {};
      const descriptor = entry.params[paramName] || { type: 'number' };
      entry.params[paramName] = { ...descriptor, default: value };
    });
  }, [updateSelectedEntry]);

  const handleMetaChange = useCallback((field, value) => {
    updateSelectedEntry((entry) => {
      if (field === 'surfaces') {
        entry.surfaces = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
      } else if (field === 'zIndex') {
        entry.zIndex = Number(value) || 0;
      } else if (field === 'exclusiveGroup') {
        entry.exclusiveGroup = value === '' ? null : String(value);
      } else {
        entry[field] = value;
      }
    });
  }, [updateSelectedEntry]);

  const handleTemplateChange = useCallback((nextTemplateId) => {
    if (!canManage || !selectedKind) return;
    writeDraft((next) => {
      const entry = next.catalog[selectedKind];
      if (!entry) return;
      next.catalog[selectedKind] = applyCatalogTemplateChange({
        entry,
        nextTemplateId,
      });
    });
  }, [canManage, selectedKind, writeDraft]);

  const handleMarkReviewed = useCallback(() => {
    if (!canManage || !selectedKind) return;
    if (hasErrors) return;
    writeDraft((next) => {
      const entry = next.catalog[selectedKind];
      if (!entry) return;
      entry.reviewed = true;
      entry.reviewedAt = Date.now();
      entry.reviewedBy = accountId || 'admin';
    });
  }, [accountId, canManage, hasErrors, selectedKind, writeDraft]);

  const handleRevert = useCallback(() => {
    if (!canManage || !selectedKind) return;
    const bundled = bundledCatalogEntry(selectedKind);
    if (!bundled) return;
    writeDraft((next) => {
      next.catalog[selectedKind] = bundled;
    });
  }, [canManage, selectedKind, writeDraft]);

  const handleDelete = useCallback((kind) => {
    if (!canManage) return;
    if (catalogEntryIsBundled(kind)) {
      setDeleteBlockedMessage(`"${kind}" is a code-default entry and cannot be deleted. Use Revert to reset it.`);
      return;
    }
    setDeleteBlockedMessage('');
    writeDraft((next) => {
      delete next.catalog[kind];
    });
    if (selectedKind === kind) {
      const remaining = sortedCatalogKinds(catalog).filter((other) => other !== kind);
      setSelectedKind(remaining[0] || null);
    }
  }, [canManage, catalog, selectedKind, writeDraft]);

  if (!draft) return null;

  return (
    <section className="card monster-effect-catalog-panel" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Effect catalog</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Templates and per-kind params</h3>
          <div className="chip-row" style={{ marginTop: 12 }}>
            <span className="chip">{Object.keys(catalog).length} entries</span>
            <span className={`chip ${canManage ? 'good' : 'warn'}`}>{canManage ? 'Admin edit' : 'Read-only'}</span>
          </div>
        </div>
        {canManage ? (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setCreating(true);
                setCollisionMessage('');
              }}
            >
              New entry
            </button>
          </div>
        ) : null}
      </div>

      {creating && canManage ? (
        <div className="feedback warn" style={{ marginBottom: 12 }}>
          <strong>New catalog entry</strong>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Kind</span>
              <input
                className="input"
                type="text"
                value={newKind}
                onChange={(event) => setNewKind(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Template</span>
              <select
                className="select"
                value={newTemplateId}
                onChange={(event) => setNewTemplateId(event.target.value)}
              >
                {EFFECT_CATALOG_TEMPLATE_OPTIONS.map((id) => (
                  <option value={id} key={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          {collisionMessage ? (
            <div className="field-error" role="alert" style={{ marginTop: 8 }}>{collisionMessage}</div>
          ) : null}
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn good" type="button" onClick={handleCreate}>Create</button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setCreating(false);
                setNewKind('');
                setCollisionMessage('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {deleteBlockedMessage ? (
        <div className="feedback bad" style={{ marginBottom: 12 }} role="alert">{deleteBlockedMessage}</div>
      ) : null}

      <div className="monster-effect-layout" style={{ display: 'flex', gap: 16 }}>
        <aside className="monster-effect-list" style={{ minWidth: 260 }}>
          <div className="monster-effect-list-rows">
            {orderedKinds.map((kind) => {
              const entry = catalog[kind];
              const reviewed = entry?.reviewed === true;
              const bundled = catalogEntryIsBundled(kind);
              const active = selectedKind === kind;
              return (
                <div
                  className={`monster-effect-row ${active ? 'active' : ''}`}
                  key={kind}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setSelectedKind(kind)}
                    style={{ flex: 1, textAlign: 'left' }}
                  >
                    <strong>{kind}</strong>
                    <span className="small muted"> · {entry?.template} · {entry?.layer} · {entry?.lifecycle}</span>
                  </button>
                  <span className={`chip ${reviewed ? 'good' : 'warn'}`}>
                    {reviewed ? 'Reviewed' : 'Needs review'}
                  </span>
                  {canManage && !bundled ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => handleDelete(kind)}
                      title="Delete admin-created entry"
                    >
                      Delete
                    </button>
                  ) : null}
                  {canManage && bundled ? (
                    <span
                      className="chip"
                      title="Code-default entries cannot be deleted; use Revert to restore."
                    >
                      Bundled
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <div className="monster-effect-detail" style={{ flex: 1 }}>
          {selectedEntry ? (
            <div className="monster-effect-control-group">
              <div className="monster-effect-control-title" style={{ marginBottom: 8 }}>
                <strong>{selectedKind}</strong>
                {' · '}
                <span className="small muted">{selectedEntry.template}</span>
              </div>

              {hasErrors ? (
                <div className="feedback bad" style={{ marginBottom: 12 }} role="alert">
                  {selectedErrors.length} validation issue{selectedErrors.length === 1 ? '' : 's'}: {selectedErrors[0]?.message || ''}
                </div>
              ) : null}

              <div className="monster-effect-fields-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label className="field">
                  <span>Template</span>
                  <select
                    className="select"
                    value={selectedEntry.template || ''}
                    disabled={!canManage}
                    onChange={(event) => handleTemplateChange(event.target.value)}
                  >
                    {EFFECT_CATALOG_TEMPLATE_OPTIONS.map((id) => (
                      <option value={id} key={id}>{id}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Lifecycle</span>
                  <select
                    className="select"
                    value={selectedEntry.lifecycle || 'persistent'}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('lifecycle', event.target.value)}
                  >
                    {ALLOWED_LIFECYCLES.map((value) => <option value={value} key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Layer</span>
                  <select
                    className="select"
                    value={selectedEntry.layer || 'overlay'}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('layer', event.target.value)}
                  >
                    {ALLOWED_LAYERS.map((value) => <option value={value} key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Reduced motion</span>
                  <select
                    className="select"
                    value={selectedEntry.reducedMotion || 'simplify'}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('reducedMotion', event.target.value)}
                  >
                    {ALLOWED_REDUCED_MOTION.map((value) => <option value={value} key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Surfaces (comma-separated)</span>
                  <input
                    className="input"
                    type="text"
                    value={Array.isArray(selectedEntry.surfaces) ? selectedEntry.surfaces.join(', ') : ''}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('surfaces', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>z-index</span>
                  <input
                    className="input"
                    type="number"
                    value={Number.isFinite(Number(selectedEntry.zIndex)) ? String(selectedEntry.zIndex) : '0'}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('zIndex', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Exclusive group</span>
                  <input
                    className="input"
                    type="text"
                    value={selectedEntry.exclusiveGroup || ''}
                    disabled={!canManage}
                    onChange={(event) => handleMetaChange('exclusiveGroup', event.target.value)}
                  />
                </label>
              </div>

              <div className="monster-effect-fields-params" style={{ marginTop: 12 }}>
                <strong>Params</strong>
                <MonsterEffectFieldControls
                  paramSchema={selectedTemplate?.paramSchema || {}}
                  params={selectedEntry.params || {}}
                  errorsByField={selectedParamErrors}
                  disabled={!canManage}
                  onChange={handleParamChange}
                />
              </div>

              {canManage ? (
                <div className="actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn good"
                    type="button"
                    disabled={hasErrors || selectedEntry.reviewed === true}
                    onClick={handleMarkReviewed}
                  >
                    Mark reviewed
                  </button>
                  {catalogEntryIsBundled(selectedKind) ? (
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={!catalogEntryDiffersFromBundled(selectedEntry, selectedKind)}
                      onClick={handleRevert}
                    >
                      Revert
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="small muted">Select a catalog entry to edit.</p>
          )}
        </div>
      </div>
    </section>
  );
}
