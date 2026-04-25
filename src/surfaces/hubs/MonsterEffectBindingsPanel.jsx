import React, { useCallback } from 'react';
import { lookupTemplate } from '../../platform/game/render/effect-templates/index.js';
import { MonsterEffectFieldControls } from './MonsterEffectFieldControls.jsx';
import {
  catalogEntryNeedsReview,
  paramErrorsByField,
} from './monster-effect-catalog-helpers.js';
import {
  assetBindingsAllReviewed,
  bindingRowAllErrors,
  bindingsRowsForAsset,
  defaultBindingRow,
  exclusiveGroupCollisions,
  BINDING_LIFECYCLES,
} from './monster-effect-bindings-helpers.js';

const SLOT_LABELS = {
  persistent: 'Persistent overlays',
  continuous: 'Continuous transforms',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function ensureBindingRow(draftRow) {
  return {
    persistent: Array.isArray(draftRow?.persistent) ? clone(draftRow.persistent) : [],
    continuous: Array.isArray(draftRow?.continuous) ? clone(draftRow.continuous) : [],
  };
}

export function MonsterEffectBindingsPanel({
  asset,
  draft,
  canManage = false,
  onDraftChange = () => {},
  accountId = '',
} = {}) {
  const assetKey = asset?.key || '';
  const catalog = draft?.catalog || {};
  const rows = bindingsRowsForAsset(draft, assetKey);
  const collisions = exclusiveGroupCollisions(rows, catalog);
  const reviewedAll = assetBindingsAllReviewed(draft, assetKey, { catalog });
  const catalogKinds = Object.keys(catalog).sort();
  const rowsBySlot = { persistent: [], continuous: [] };
  for (const row of rows) {
    if (rowsBySlot[row.slot]) rowsBySlot[row.slot].push(row);
  }

  const writeDraft = useCallback((mutator) => {
    if (!canManage) return;
    const next = clone(draft) || { catalog: {}, bindings: {}, celebrationTunables: {} };
    next.bindings = next.bindings || {};
    next.bindings[assetKey] = ensureBindingRow(next.bindings[assetKey]);
    mutator(next);
    onDraftChange(next);
  }, [canManage, draft, onDraftChange, assetKey]);

  const updateBindingAt = useCallback((slot, index, mutator) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const entry = next.bindings[assetKey][slot][index];
      if (!entry) return;
      mutator(entry);
      // Any edit resets `reviewed=false` — admin must re-confirm.
      entry.reviewed = false;
    });
  }, [canManage, assetKey, writeDraft]);

  const handleAddBinding = useCallback((kind) => {
    if (!canManage || !kind || !assetKey) return;
    writeDraft((next) => {
      const created = defaultBindingRow({ kind, catalog });
      next.bindings[assetKey][created.lifecycle].push(created);
    });
  }, [canManage, assetKey, catalog, writeDraft]);

  const handleParamChange = useCallback((slot, index) => (paramName, value) => {
    updateBindingAt(slot, index, (entry) => {
      entry.params = entry.params || {};
      entry.params[paramName] = value;
    });
  }, [updateBindingAt]);

  const handleEnabledChange = useCallback((slot, index, enabled) => {
    updateBindingAt(slot, index, (entry) => {
      entry.enabled = enabled === true;
    });
  }, [updateBindingAt]);

  const handleMove = useCallback((slot, index, direction) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const list = next.bindings[assetKey][slot];
      const target = index + direction;
      if (target < 0 || target >= list.length) return;
      const [entry] = list.splice(index, 1);
      list.splice(target, 0, entry);
    });
  }, [canManage, assetKey, writeDraft]);

  const handleRemove = useCallback((slot, index) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const list = next.bindings[assetKey][slot];
      list.splice(index, 1);
    });
  }, [canManage, assetKey, writeDraft]);

  const handleMarkReviewed = useCallback((slot, index) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const entry = next.bindings[assetKey][slot]?.[index];
      if (!entry) return;
      // Validate against the freshly cloned catalog so a concurrent catalog
      // edit in the same draft is reflected in the gate.
      const errors = bindingRowAllErrors(entry, { catalog: next.catalog || {} });
      if (errors.length > 0) return;
      entry.reviewed = true;
      entry.reviewedAt = Date.now();
      entry.reviewedBy = accountId || 'admin';
    });
  }, [accountId, canManage, assetKey, writeDraft]);

  if (!asset || !draft) return null;

  const renderRow = ({ slot, index, entry }) => {
    const catalogEntry = catalog[entry.kind] || null;
    const template = catalogEntry ? lookupTemplate(catalogEntry.template) : null;
    const errors = bindingRowAllErrors(entry, { catalog });
    const paramErrors = paramErrorsByField(entry, { catalog, source: 'value' });
    const missingCatalog = !catalogEntry;
    const reviewable = errors.length === 0 && entry.reviewed !== true;
    const rowKey = `${slot}-${index}-${entry.kind}`;
    const list = rowsBySlot[slot] || [];
    const canMoveUp = index > 0;
    const canMoveDown = index < list.length - 1;
    const topError = errors.find((issue) => issue.field === 'kind' || issue.field === 'row') || errors[0];
    return (
      <div
        className={`monster-effect-row ${missingCatalog ? 'has-error' : ''}`}
        key={rowKey}
      >
        <div className="monster-effect-row-header">
          <div>
            <strong>{entry.kind || '(missing kind)'}</strong>
            <span className="small muted">
              {' · '}
              {catalogEntry?.template || '—'}
            </span>
          </div>
          <div className="monster-effect-row-actions">
            <span className={`chip ${entry.reviewed === true ? 'good' : 'warn'}`}>
              {entry.reviewed === true ? 'Reviewed' : 'Needs review'}
            </span>
            {entry.enabled === false ? (
              <span className="chip">Disabled</span>
            ) : null}
            {canManage ? (
              <>
                <button
                  className="btn ghost icon"
                  type="button"
                  disabled={!canMoveUp}
                  onClick={() => handleMove(slot, index, -1)}
                  aria-label="Move binding up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn ghost icon"
                  type="button"
                  disabled={!canMoveDown}
                  onClick={() => handleMove(slot, index, 1)}
                  aria-label="Move binding down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="btn ghost icon"
                  type="button"
                  onClick={() => handleRemove(slot, index)}
                  aria-label="Remove binding"
                  title="Remove"
                >
                  ×
                </button>
              </>
            ) : null}
          </div>
        </div>

        {errors.length > 0 ? (
          <div className="feedback bad" style={{ marginBottom: 8 }} role="alert">
            {topError.message}
          </div>
        ) : null}

        {!missingCatalog ? (
          <div className="monster-effect-fields-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label className="field">
              <span>Enabled</span>
              <input
                className="input"
                type="checkbox"
                checked={entry.enabled !== false}
                disabled={!canManage}
                onChange={(event) => handleEnabledChange(slot, index, event.target.checked)}
              />
            </label>
          </div>
        ) : null}

        {!missingCatalog && template?.paramSchema ? (
          <div className="monster-effect-fields-params" style={{ marginTop: 8 }}>
            <strong className="small">Params</strong>
            <MonsterEffectFieldControls
              paramSchema={template.paramSchema}
              params={Object.fromEntries(
                Object.entries(entry.params || {}).map(([name, value]) => [
                  name,
                  { type: template.paramSchema[name]?.type, default: value },
                ]),
              )}
              errorsByField={paramErrors}
              disabled={!canManage || missingCatalog}
              onChange={handleParamChange(slot, index)}
            />
          </div>
        ) : null}

        {canManage ? (
          <div className="actions" style={{ marginTop: 8 }}>
            <button
              className="btn good"
              type="button"
              disabled={!reviewable}
              onClick={() => handleMarkReviewed(slot, index)}
            >
              Mark reviewed
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="card monster-effect-bindings-panel" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Effect bindings</div>
          <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Per-monster overlay stack</h3>
          <div className="chip-row" style={{ marginTop: 12 }}>
            <span className="chip">{rows.length} bindings</span>
            <span className={`chip ${reviewedAll ? 'good' : 'warn'}`}>
              {reviewedAll ? 'All reviewed' : 'Needs review'}
            </span>
            <span className={`chip ${canManage ? 'good' : 'warn'}`}>{canManage ? 'Admin edit' : 'Read-only'}</span>
          </div>
        </div>
        {canManage ? (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <label className="field" style={{ minWidth: 240 }}>
              <span>Add binding</span>
              <select
                className="select"
                value=""
                onChange={(event) => {
                  const kind = event.target.value;
                  if (!kind) return;
                  handleAddBinding(kind);
                  event.target.value = '';
                }}
              >
                <option value="">Select catalog kind…</option>
                {catalogKinds.map((kind) => {
                  const entry = catalog[kind];
                  const unreviewed = catalogEntryNeedsReview(entry);
                  const lifecycle = entry?.lifecycle === 'continuous' ? 'continuous' : 'persistent';
                  const group = entry?.exclusiveGroup ? ` · group: ${entry.exclusiveGroup}` : '';
                  return (
                    <option
                      value={kind}
                      key={kind}
                      disabled={unreviewed}
                      title={unreviewed ? 'Unreviewed catalog entry' : ''}
                    >
                      {`[${lifecycle}] ${kind}${group}`}{unreviewed ? ' (unreviewed)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {Object.entries(collisions).length > 0 ? (
        <div className="feedback warn" style={{ marginBottom: 12 }} role="status">
          <strong>Exclusive group collision</strong>
          <div className="small" style={{ marginTop: 4 }}>
            Only the later binding wins at render time:
          </div>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {Object.entries(collisions).map(([groupId, kinds]) => (
              <li key={groupId}>{groupId}: {kinds.join(' vs ')}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="small muted">No bindings yet. Add one from the catalog above.</p>
      ) : (
        <div className="monster-effect-bindings-rows">
          {BINDING_LIFECYCLES.map((slot) => {
            const list = rowsBySlot[slot] || [];
            if (list.length === 0) return null;
            return (
              <div key={slot}>
                <div className="monster-effect-bindings-section-divider">{SLOT_LABELS[slot]}</div>
                {list.map(renderRow)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
