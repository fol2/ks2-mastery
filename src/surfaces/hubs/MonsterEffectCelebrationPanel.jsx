import React, { useCallback, useState } from 'react';
import { BUNDLED_CELEBRATION_TUNABLES } from '../../platform/game/render/effect-config-defaults.js';
import { EFFECT_CONFIG_MODIFIER_CLASSES } from '../../platform/game/render/effect-config-schema.js';
import {
  CELEBRATION_KINDS,
  assetCelebrationAllReviewed,
  celebrationTunableFromDraft,
  celebrationTunablesAllErrors,
  defaultCelebrationTunables,
} from './monster-effect-celebration-helpers.js';

function bundledTunableForKind(kind) {
  for (const row of Object.values(BUNDLED_CELEBRATION_TUNABLES)) {
    if (row?.[kind]) return row[kind];
  }
  return null;
}

const KIND_LABEL = {
  caught: 'Caught',
  evolve: 'Evolve',
  mega: 'Mega',
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function MonsterEffectCelebrationPanel({
  asset,
  draft,
  canManage = false,
  onDraftChange = () => {},
  accountId = '',
} = {}) {
  const assetKey = asset?.key || '';
  const [activeKind, setActiveKind] = useState(CELEBRATION_KINDS[0]);
  const reviewedAll = assetCelebrationAllReviewed(draft, assetKey);

  const writeDraft = useCallback((mutator) => {
    if (!canManage) return;
    const next = clone(draft) || { catalog: {}, bindings: {}, celebrationTunables: {} };
    next.celebrationTunables = next.celebrationTunables || {};
    if (!next.celebrationTunables[assetKey] || typeof next.celebrationTunables[assetKey] !== 'object') {
      // Seed every kind so the row validator doesn't trip on a missing kind.
      // Carry the bundled `reviewed` flag (true) through so the seed itself
      // does not appear "incomplete" before any admin edit; `updateTunable`
      // resets reviewed=false on the kind the admin actually edits.
      next.celebrationTunables[assetKey] = {};
      for (const kind of CELEBRATION_KINDS) {
        const seeded = defaultCelebrationTunables(kind);
        seeded.reviewed = bundledTunableForKind(kind)?.reviewed === true;
        next.celebrationTunables[assetKey][kind] = seeded;
      }
    }
    mutator(next);
    onDraftChange(next);
  }, [canManage, draft, onDraftChange, assetKey]);

  const updateTunable = useCallback((kind, mutator) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const current = next.celebrationTunables[assetKey][kind] || defaultCelebrationTunables(kind);
      mutator(current);
      // Any edit resets `reviewed=false`.
      current.reviewed = false;
      next.celebrationTunables[assetKey][kind] = current;
    });
  }, [canManage, assetKey, writeDraft]);

  const handleToggle = useCallback((kind, field) => (event) => {
    updateTunable(kind, (tunable) => {
      tunable[field] = event.target.checked === true;
    });
  }, [updateTunable]);

  const handleModifierChange = useCallback((kind) => (event) => {
    updateTunable(kind, (tunable) => {
      tunable.modifierClass = String(event.target.value || '');
    });
  }, [updateTunable]);

  const handleMarkReviewed = useCallback((kind) => {
    if (!canManage || !assetKey) return;
    writeDraft((next) => {
      const tunable = next.celebrationTunables[assetKey][kind];
      if (!tunable) return;
      const errors = celebrationTunablesAllErrors(tunable, { kind });
      if (errors.length > 0) return;
      tunable.reviewed = true;
      tunable.reviewedAt = Date.now();
      tunable.reviewedBy = accountId || 'admin';
    });
  }, [accountId, canManage, assetKey, writeDraft]);

  if (!asset || !draft) return null;

  const tunable = celebrationTunableFromDraft(draft, assetKey, activeKind);
  const errors = celebrationTunablesAllErrors(tunable, { kind: activeKind });
  const modifierIssues = errors.filter((issue) => issue.field === 'modifierClass');
  const reviewable = errors.length === 0 && tunable.reviewed !== true;

  return (
    <section className="card monster-effect-celebration-panel" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Celebration tunables</div>
          <h3 className="section-title" style={{ fontSize: '1.1rem' }}>Per-monster celebration overrides</h3>
          <div className="chip-row" style={{ marginTop: 12 }}>
            <span className={`chip ${reviewedAll ? 'good' : 'warn'}`}>
              {reviewedAll ? 'All reviewed' : 'Needs review'}
            </span>
            <span className={`chip ${canManage ? 'good' : 'warn'}`}>{canManage ? 'Admin edit' : 'Read-only'}</span>
          </div>
        </div>
      </div>

      <div className="monster-effect-celebration-tabs" role="tablist">
        {CELEBRATION_KINDS.map((kind) => {
          const tabTunable = celebrationTunableFromDraft(draft, assetKey, kind);
          const reviewed = tabTunable.reviewed === true;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={activeKind === kind}
              className={`monster-effect-celebration-tab ${activeKind === kind ? 'active' : ''}`}
              onClick={() => setActiveKind(kind)}
            >
              {KIND_LABEL[kind] || kind}
              {' '}
              <span className={`chip ${reviewed ? 'good' : 'warn'}`} style={{ marginLeft: 6 }}>
                {reviewed ? 'Reviewed' : 'Needs review'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="monster-effect-row" role="tabpanel">
        <div className="monster-effect-row-header">
          <div>
            <strong>{KIND_LABEL[activeKind] || activeKind}</strong>
          </div>
          <div className="monster-effect-row-actions">
            <span className={`chip ${tunable.reviewed === true ? 'good' : 'warn'}`}>
              {tunable.reviewed === true ? 'Reviewed' : 'Needs review'}
            </span>
          </div>
        </div>

        <div className="monster-effect-fields-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="field">
            <span>Show particles</span>
            <input
              className="input"
              type="checkbox"
              checked={tunable.showParticles === true}
              disabled={!canManage}
              onChange={handleToggle(activeKind, 'showParticles')}
            />
          </label>
          <label className="field">
            <span>Show shine</span>
            <input
              className="input"
              type="checkbox"
              checked={tunable.showShine === true}
              disabled={!canManage}
              onChange={handleToggle(activeKind, 'showShine')}
            />
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            <span>Modifier class</span>
            <select
              className="select"
              value={typeof tunable.modifierClass === 'string' ? tunable.modifierClass : ''}
              disabled={!canManage}
              onChange={handleModifierChange(activeKind)}
            >
              {EFFECT_CONFIG_MODIFIER_CLASSES.map((option) => (
                <option value={option} key={option || 'none'}>
                  {option || '(none)'}
                </option>
              ))}
            </select>
            {modifierIssues.map((issue, idx) => (
              <span className="field-error" role="alert" key={idx}>
                {issue.message}
              </span>
            ))}
          </label>
        </div>

        {canManage ? (
          <div className="actions" style={{ marginTop: 8 }}>
            <button
              className="btn good"
              type="button"
              disabled={!reviewable}
              onClick={() => handleMarkReviewed(activeKind)}
            >
              Mark reviewed
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
