import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONSTER_ASSET_MANIFEST } from '../../platform/game/monster-asset-manifest.js';
import {
  MONSTER_VISUAL_CONTEXTS,
  validateMonsterVisualConfigForPublish,
} from '../../platform/game/monster-visual-config.js';
import { EFFECT_CONFIG_CELEBRATION_KINDS } from '../../platform/game/render/effect-config-schema.js';
import { MonsterVisualFieldControls } from './MonsterVisualFieldControls.jsx';
import { MonsterVisualPreviewGrid } from './MonsterVisualPreviewGrid.jsx';
import { formatTimestamp } from './hub-utils.js';

const AUTOSAVE_PREFIX = 'ks2.monster-visual-config-draft';
// `effect` schema version. Bump invalidates stale local autosave buffers
// the next time the admin opens the panel (the autosave key embeds it).
const EFFECT_AUTOSAVE_SCHEMA_TAG = 'v1-effect';
const STRING_CONTEXT_FIELDS = new Set(['path', 'motionProfile', 'filter']);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function autosaveKey({ accountId, manifestHash, draftRevision }) {
  return `${AUTOSAVE_PREFIX}:${accountId || 'account'}:${manifestHash || 'manifest'}:${Number(draftRevision) || 0}:${EFFECT_AUTOSAVE_SCHEMA_TAG}`;
}

function readAutosave(key) {
  const store = storage();
  if (!store || !key) return null;
  try {
    const parsed = JSON.parse(store.getItem(key) || 'null');
    return isPlainObject(parsed?.draft) ? parsed : null;
  } catch {
    return null;
  }
}

function writeAutosave(key, payload) {
  const store = storage();
  if (!store || !key) return;
  try {
    store.setItem(key, JSON.stringify(payload));
  } catch {
    /* Local autosave is a recovery affordance only. */
  }
}

function removeAutosave(key) {
  const store = storage();
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    /* Ignore unavailable storage. */
  }
}

function findStaleAutosave(activeKey) {
  const store = storage();
  if (!store) return null;
  try {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (!key || key === activeKey || !key.startsWith(`${AUTOSAVE_PREFIX}:`)) continue;
      const parsed = readAutosave(key);
      if (parsed?.draft) return { key, ...parsed };
    }
  } catch {
    return null;
  }
  return null;
}

function jsonStable(value) {
  return JSON.stringify(value || null);
}

function assetLabel(asset) {
  if (!asset) return 'Unknown asset';
  return `${asset.monsterId} ${asset.branch} stage ${asset.stage}`;
}

function assetNeedsReview(entry) {
  return MONSTER_VISUAL_CONTEXTS.some((context) => entry?.review?.contexts?.[context]?.reviewed !== true);
}

function assetIssueCount(validation, assetKey) {
  return (validation.errors || []).filter((issue) => issue.assetKey === assetKey).length;
}

function assetDiffersFromPublished(draft, published, assetKey) {
  if (!draft?.assets || !published?.assets) return false;
  return jsonStable(draft?.assets?.[assetKey]) !== jsonStable(published?.assets?.[assetKey]);
}

// `effect-incomplete`: an asset whose effect binding row OR celebration
// tunables row has any entry that is not yet reviewed. Returns false when
// the effect sub-document is absent — the visual `review` filter still
// covers that case.
function assetEffectIncomplete(draft, assetKey) {
  const bindings = draft?.effect?.bindings?.[assetKey];
  const tunables = draft?.effect?.celebrationTunables?.[assetKey];
  if (bindings && typeof bindings === 'object') {
    for (const slot of ['persistent', 'continuous']) {
      const list = Array.isArray(bindings[slot]) ? bindings[slot] : [];
      for (const entry of list) {
        if (entry && entry.reviewed !== true) return true;
      }
    }
  }
  if (tunables && typeof tunables === 'object') {
    for (const kind of EFFECT_CONFIG_CELEBRATION_KINDS) {
      if (tunables[kind] && tunables[kind].reviewed !== true) return true;
    }
  }
  return false;
}

// `effect-changed`: this asset's effect binding row OR celebration tunables
// row has been edited locally vs the cloud draft (the existing visual
// `changed` filter compares against `published`; we keep the same
// semantics for effect rows).
function assetEffectChanged(draft, published, assetKey) {
  const draftBindings = draft?.effect?.bindings?.[assetKey];
  const publishedBindings = published?.effect?.bindings?.[assetKey];
  const draftTunables = draft?.effect?.celebrationTunables?.[assetKey];
  const publishedTunables = published?.effect?.celebrationTunables?.[assetKey];
  return jsonStable(draftBindings) !== jsonStable(publishedBindings)
    || jsonStable(draftTunables) !== jsonStable(publishedTunables);
}

// `effect-published-mismatch`: a stronger filter used by ops to spot
// assets whose effect rows differ from the live published config — sister
// of `assetEffectChanged` but only true when the asset HAS a published
// row to compare against (so freshly added assets do not count).
function assetEffectPublishedMismatch(draft, published, assetKey) {
  const publishedBindings = published?.effect?.bindings?.[assetKey];
  const publishedTunables = published?.effect?.celebrationTunables?.[assetKey];
  if (publishedBindings == null && publishedTunables == null) return false;
  return assetEffectChanged(draft, published, assetKey);
}

function firstIssueLabel(validation) {
  const issue = validation.errors?.[0];
  if (!issue) return '';
  return [issue.assetKey, issue.context, issue.field].filter(Boolean).join(' / ') || issue.code;
}

function reviewBlockingIssues(validation, assetKey, context) {
  return (validation.errors || []).filter((issue) => (
    issue.assetKey === assetKey
    && issue.code !== 'monster_visual_review_required'
    && (!issue.context || issue.context === context)
  ));
}

function normaliseFieldValue(field, value) {
  if (STRING_CONTEXT_FIELDS.has(field) || field === 'facing') return String(value || '');
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function MonsterVisualConfigPanel({ model, accountId = '', actions }) {
  const visual = model?.monsterVisualConfig || null;
  const cloudDraft = visual?.draft || null;
  const published = visual?.published || null;
  const canManage = visual?.permissions?.canManageMonsterVisualConfig === true;
  const status = visual?.status || {};
  const activeKey = autosaveKey({
    accountId,
    manifestHash: status.manifestHash || cloudDraft?.manifestHash,
    draftRevision: status.draftRevision,
  });
  const assetOrder = useMemo(() => MONSTER_ASSET_MANIFEST.assets.map((asset) => asset.key), []);
  const initialAssetKey = assetOrder.includes('vellhorn-b1-3') ? 'vellhorn-b1-3' : assetOrder[0];
  const [draft, setDraft] = useState(() => clone(cloudDraft));
  const [selectedAssetKey, setSelectedAssetKey] = useState(initialAssetKey);
  const [selectedContext, setSelectedContext] = useState('meadow');
  const [queueFilter, setQueueFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [staleAutosave, setStaleAutosave] = useState(null);
  const loadedAutosaveKey = useRef('');

  useEffect(() => {
    if (!cloudDraft) return;
    const saved = readAutosave(activeKey);
    setDraft(clone(saved?.draft || cloudDraft));
    setNotice(saved?.draft ? 'Local autosave restored for this draft.' : '');
    setStaleAutosave(findStaleAutosave(activeKey));
    loadedAutosaveKey.current = activeKey;
  }, [activeKey, cloudDraft]);

  const dirty = useMemo(() => jsonStable(draft) !== jsonStable(cloudDraft), [draft, cloudDraft]);

  useEffect(() => {
    if (!draft || !activeKey || loadedAutosaveKey.current !== activeKey) return;
    if (!dirty) {
      removeAutosave(activeKey);
      return;
    }
    writeAutosave(activeKey, {
      draft,
      manifestHash: status.manifestHash || draft.manifestHash || '',
      draftRevision: Number(status.draftRevision) || 0,
      savedAt: Date.now(),
    });
  }, [activeKey, dirty, draft, status.draftRevision, status.manifestHash]);

  const validation = useMemo(() => validateMonsterVisualConfigForPublish(draft), [draft]);
  const selectedManifestAsset = useMemo(
    () => MONSTER_ASSET_MANIFEST.assets.find((asset) => asset.key === selectedAssetKey) || MONSTER_ASSET_MANIFEST.assets[0],
    [selectedAssetKey],
  );
  const selectedEntry = draft?.assets?.[selectedManifestAsset?.key] || null;
  const contextEntry = selectedEntry?.contexts?.[selectedContext] || null;
  const selectedReviewBlockingIssues = useMemo(() => (
    reviewBlockingIssues(validation, selectedManifestAsset?.key, selectedContext)
  ), [selectedContext, selectedManifestAsset?.key, validation]);

  const filteredAssets = useMemo(() => {
    const text = query.trim().toLowerCase();
    return MONSTER_ASSET_MANIFEST.assets.filter((asset) => {
      const entry = draft?.assets?.[asset.key];
      if (queueFilter === 'review' && !assetNeedsReview(entry)) return false;
      if (queueFilter === 'issues' && assetIssueCount(validation, asset.key) === 0) return false;
      if (queueFilter === 'changed' && !assetDiffersFromPublished(draft, published, asset.key)) return false;
      if (queueFilter === 'effect-incomplete' && !assetEffectIncomplete(draft, asset.key)) return false;
      if (queueFilter === 'effect-changed' && !assetEffectChanged(draft, published, asset.key)) return false;
      if (queueFilter === 'effect-published-mismatch' && !assetEffectPublishedMismatch(draft, published, asset.key)) return false;
      if (!text) return true;
      return `${asset.key} ${asset.monsterId} ${asset.branch} ${asset.stage}`.toLowerCase().includes(text);
    });
  }, [draft, published, query, queueFilter, validation]);

  const changedCount = useMemo(() => (
    MONSTER_ASSET_MANIFEST.assets.filter((asset) => assetDiffersFromPublished(draft, published, asset.key)).length
  ), [draft, published]);

  const updateSelectedEntry = useCallback((updater) => {
    if (!canManage) return;
    setDraft((current) => {
      const next = clone(current);
      const entry = next?.assets?.[selectedManifestAsset?.key];
      if (!entry) return current;
      updater(entry);
      return next;
    });
  }, [canManage, selectedManifestAsset?.key]);

  const updateBaseline = useCallback((field, value) => {
    updateSelectedEntry((entry) => {
      entry.baseline = { ...(entry.baseline || {}), [field]: normaliseFieldValue(field, value) };
      entry.review = entry.review || { contexts: {} };
      entry.review.contexts = entry.review.contexts || {};
      for (const context of MONSTER_VISUAL_CONTEXTS) {
        entry.review.contexts[context] = {
          ...(entry.review.contexts[context] || {}),
          reviewed: false,
        };
      }
    });
  }, [updateSelectedEntry]);

  const updateContext = useCallback((field, value) => {
    updateSelectedEntry((entry) => {
      entry.contexts = entry.contexts || {};
      entry.contexts[selectedContext] = {
        ...(entry.contexts[selectedContext] || {}),
        [field]: normaliseFieldValue(field, value),
      };
      entry.review = entry.review || { contexts: {} };
      entry.review.contexts = entry.review.contexts || {};
      entry.review.contexts[selectedContext] = {
        ...(entry.review.contexts[selectedContext] || {}),
        reviewed: false,
      };
    });
  }, [selectedContext, updateSelectedEntry]);

  const markReviewed = useCallback((context) => {
    updateSelectedEntry((entry) => {
      entry.review = entry.review || { contexts: {} };
      entry.review.contexts = entry.review.contexts || {};
      entry.review.contexts[context] = {
        reviewed: true,
        reviewedAt: Date.now(),
        reviewedBy: accountId || 'admin',
      };
    });
  }, [accountId, updateSelectedEntry]);

  const resetContext = useCallback((context) => {
    updateSelectedEntry((entry) => {
      const cloudEntry = cloudDraft?.assets?.[entry.assetKey || selectedManifestAsset?.key];
      if (!cloudEntry?.contexts?.[context]) return;
      entry.contexts = entry.contexts || {};
      entry.contexts[context] = clone(cloudEntry.contexts[context]);
      entry.review = entry.review || { contexts: {} };
      entry.review.contexts = entry.review.contexts || {};
      entry.review.contexts[context] = clone(cloudEntry.review?.contexts?.[context] || { reviewed: false });
    });
  }, [cloudDraft, selectedManifestAsset?.key, updateSelectedEntry]);

  const moveAsset = useCallback((direction) => {
    const assets = filteredAssets.length ? filteredAssets : MONSTER_ASSET_MANIFEST.assets;
    const index = Math.max(0, assets.findIndex((asset) => asset.key === selectedManifestAsset?.key));
    const nextIndex = (index + direction + assets.length) % assets.length;
    setSelectedAssetKey(assets[nextIndex]?.key || initialAssetKey);
  }, [filteredAssets, initialAssetKey, selectedManifestAsset?.key]);

  const moveContext = useCallback((direction) => {
    const index = Math.max(0, MONSTER_VISUAL_CONTEXTS.indexOf(selectedContext));
    const nextIndex = (index + direction + MONSTER_VISUAL_CONTEXTS.length) % MONSTER_VISUAL_CONTEXTS.length;
    setSelectedContext(MONSTER_VISUAL_CONTEXTS[nextIndex]);
  }, [selectedContext]);

  const handleKeyDown = useCallback((event) => {
    const tag = event.target?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
    if (event.key === 'j' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveAsset(1);
    } else if (event.key === 'k' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveAsset(-1);
    } else if (event.key === 'l' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveContext(1);
    } else if (event.key === 'h' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveContext(-1);
    }
  }, [moveAsset, moveContext]);

  if (!visual || !draft || !selectedManifestAsset || !selectedEntry) return null;

  return (
    <section className="card monster-visual-panel" style={{ marginBottom: 20 }} onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="card-header">
        <div>
          <div className="eyebrow">Monster visuals</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Global visual config</h3>
          <div className="chip-row" style={{ marginTop: 12 }}>
            <span className="chip good">Published {String(status.publishedVersion || 0)}</span>
            <span className="chip">Draft {String(status.draftRevision || 0)}</span>
            <span className={`chip ${changedCount ? 'warn' : 'good'}`}>{changedCount ? `${changedCount} changed` : 'No changes'}</span>
            <span className={`chip ${validation.ok ? 'good' : 'bad'}`}>{validation.ok ? 'Publishable' : `${validation.errors.length} blockers`}</span>
            <span className={`chip ${canManage ? 'good' : 'warn'}`}>{canManage ? 'Admin edit' : 'Read-only'}</span>
          </div>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn primary"
            type="button"
            disabled={!canManage || !dirty}
            onClick={() => actions.dispatch('monster-visual-config-save', {
              draft,
              expectedDraftRevision: status.draftRevision,
              autosaveKey: activeKey,
            })}
          >
            Save draft
          </button>
          <button
            className="btn good"
            type="button"
            disabled={!canManage || !validation.ok || dirty}
            onClick={() => actions.dispatch('monster-visual-config-publish', {
              expectedDraftRevision: status.draftRevision,
            })}
          >
            Publish
          </button>
          <select
            className="select monster-visual-version-select"
            disabled={!canManage || !visual.versions?.length}
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
            {(visual.versions || []).map((version) => (
              <option value={version.version} key={version.version}>
                Version {version.version} - {formatTimestamp(version.publishedAt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && <div className="feedback good" style={{ marginBottom: 12 }}>{notice}</div>}
      {staleAutosave?.draft && (
        <div className="feedback warn" style={{ marginBottom: 12 }}>
          <strong>Older local draft available</strong>
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              className="btn secondary"
              type="button"
              disabled={!canManage}
              onClick={() => {
                setDraft(clone(staleAutosave.draft));
                setNotice('Older local draft recovered into preview. Save manually to update the cloud draft.');
              }}
            >
              Recover into preview
            </button>
            <button className="btn ghost" type="button" onClick={() => {
              removeAutosave(staleAutosave.key);
              setStaleAutosave(null);
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {!validation.ok && (
        <div className="feedback bad" style={{ marginBottom: 12 }}>
          First blocker: {firstIssueLabel(validation)}
        </div>
      )}

      <div className="monster-visual-layout">
        <aside className="monster-visual-queue">
          <div className="field-row">
            <label className="field">
              <span>Queue</span>
              <select className="select" value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)}>
                <option value="all">All assets</option>
                <option value="review">Needs review</option>
                <option value="changed">Changed</option>
                <option value="issues">Blockers</option>
                <option value="effect-incomplete">Effect incomplete</option>
                <option value="effect-changed">Effect changed</option>
                <option value="effect-published-mismatch">Effect published mismatch</option>
              </select>
            </label>
            <label className="field">
              <span>Search</span>
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>
          <div className="monster-visual-asset-list">
            {filteredAssets.map((asset) => {
              const entry = draft.assets?.[asset.key];
              const issueCount = assetIssueCount(validation, asset.key);
              const needsReview = assetNeedsReview(entry);
              const changed = assetDiffersFromPublished(draft, published, asset.key);
              const active = selectedManifestAsset.key === asset.key;
              return (
                <button
                  className={`monster-visual-asset-row ${active ? 'active' : ''}`}
                  type="button"
                  onClick={() => setSelectedAssetKey(asset.key)}
                  key={asset.key}
                >
                  <span>
                    <strong>{asset.key}</strong>
                    <span className="small muted">{asset.monsterId} / {asset.branch} / {asset.stage}</span>
                  </span>
                  <span className={`chip ${issueCount ? 'bad' : needsReview || changed ? 'warn' : 'good'}`}>
                    {issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'}` : needsReview ? 'Review' : changed ? 'Changed' : 'Clean'}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="monster-visual-workspace">
          <div className="inline-row spread" style={{ marginBottom: 12 }}>
            <div>
              <h4 className="section-title" style={{ fontSize: '1.1rem' }}>{selectedManifestAsset.key}</h4>
              <div className="small muted">{assetLabel(selectedManifestAsset)}</div>
            </div>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => moveAsset(-1)}>Previous</button>
              <button className="btn ghost" type="button" onClick={() => moveAsset(1)}>Next</button>
            </div>
          </div>
          <MonsterVisualPreviewGrid
            asset={selectedManifestAsset}
            draft={draft}
            selectedContext={selectedContext}
            onSelectContext={setSelectedContext}
          />
          <MonsterVisualFieldControls
            assetEntry={selectedEntry}
            contextEntry={contextEntry}
            selectedContext={selectedContext}
            disabled={!canManage}
            onBaselineChange={updateBaseline}
            onContextChange={updateContext}
            onMarkReviewed={markReviewed}
            onResetContext={resetContext}
            reviewBlockingIssues={selectedReviewBlockingIssues}
          />
        </div>
      </div>
    </section>
  );
}
