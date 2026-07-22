import {
  buildPunctuationItemTotals,
  normalisePunctuationItemTotals,
} from '../../../../shared/punctuation/item-totals.js';
import { hasPunctuationStarEvidence } from '../../../../shared/punctuation/star-evidence.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return clone(value);
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function progressFromData(data) {
  return isPlainObject(data?.progress) ? data.progress : {};
}

function itemTotalsFromProgress(progress) {
  return normalisePunctuationItemTotals(progress?.itemTotals)
    || buildPunctuationItemTotals(isPlainObject(progress?.items) ? progress.items : {});
}

/** Keep lifetime item memory out of the compact gameplay document. */
export function punctuationStateWithoutItemMastery(value = {}) {
  const data = isPlainObject(value) ? clone(value) : {};
  const progress = progressFromData(data);
  const nextProgress = {
    ...progress,
    itemTotals: itemTotalsFromProgress(progress),
  };
  delete nextProgress.items;
  return { ...data, progress: nextProgress };
}

/** Compose only the item rows explicitly selected for this command. */
export function composePunctuationGameplaySubjectRecord(subjectRecord = {}, itemRows = []) {
  const record = isPlainObject(subjectRecord) ? clone(subjectRecord) : {};
  const data = isPlainObject(record.data) ? record.data : {};
  const progress = progressFromData(data);
  // The caller supplies the complete bounded working set. Never inherit an
  // embedded lifetime map from a partially cleaned 0023 row: readiness can be
  // visible before an idempotent cleanup replay, and gameplay must remain
  // profile-size independent throughout that recovery state.
  const items = {};
  for (const row of Array.isArray(itemRows) ? itemRows : []) {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : '';
    const state = parseJsonObject(row?.state_json);
    if (!itemId || !state) continue;
    items[itemId] = state;
  }
  record.data = {
    ...data,
    progress: {
      ...progress,
      items,
      itemTotals: itemTotalsFromProgress(progress),
    },
  };
  return record;
}

/** Diff only the hydrated command working set, never lifetime history. */
export function changedPunctuationGameplayItems(previousData = {}, nextData = {}) {
  const previous = isPlainObject(previousData?.progress?.items) ? previousData.progress.items : {};
  const next = isPlainObject(nextData?.progress?.items) ? nextData.progress.items : {};
  const changed = [];
  // A retired item can enter the bounded working set through recent or
  // session evidence and then be omitted by current-catalogue normalisation.
  // That is not an instruction to discard history; explicit reset owns it.
  for (const itemId of Object.keys(next)) {
    if (!itemId || stableJson(previous[itemId]) === stableJson(next[itemId])) continue;
    changed.push({
      itemId,
      state: isPlainObject(next[itemId]) ? clone(next[itemId]) : null,
    });
  }
  return changed.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export function punctuationStarItemIds(data = {}) {
  const ids = new Set();
  const progress = progressFromData(data);
  if (hasPunctuationStarEvidence(progress.starEvidence)) return [];
  for (const attempt of Array.isArray(progress.attempts) ? progress.attempts.slice(-1000) : []) {
    if (typeof attempt?.itemId === 'string' && attempt.itemId) ids.add(attempt.itemId);
  }
  return [...ids];
}

export function punctuationHasStarEvidence(data = {}) {
  return hasPunctuationStarEvidence(progressFromData(data).starEvidence);
}
