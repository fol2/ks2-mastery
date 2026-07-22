import { punctuationStableItemBucket } from './item-totals.js';

export const PUNCTUATION_STAR_EVIDENCE_VERSION = 1;
export const PUNCTUATION_STAR_EVIDENCE_ITEM_LIMIT = 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function itemId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : '';
}

function referencedItemIds(attempts) {
  if (!Array.isArray(attempts)) return null;
  return new Set(attempts.slice(-PUNCTUATION_STAR_EVIDENCE_ITEM_LIMIT)
    .map((attempt) => itemId(attempt?.itemId))
    .filter(Boolean));
}

export function hasPunctuationStarEvidence(value) {
  return isPlainObject(value)
    && Number(value.version) === PUNCTUATION_STAR_EVIDENCE_VERSION
    && Array.isArray(value.secureItemIds);
}

export function normalisePunctuationStarEvidence(value, {
  attempts,
  releaseId = '',
} = {}) {
  if (!hasPunctuationStarEvidence(value)) return null;
  const referenced = referencedItemIds(attempts);
  const secureItemIds = [];
  const seen = new Set();
  for (const rawId of value.secureItemIds) {
    const id = itemId(rawId);
    if (!id || seen.has(id) || (referenced && !referenced.has(id))) continue;
    seen.add(id);
    secureItemIds.push(id);
    if (secureItemIds.length >= PUNCTUATION_STAR_EVIDENCE_ITEM_LIMIT) break;
  }
  return {
    version: PUNCTUATION_STAR_EVIDENCE_VERSION,
    releaseId: typeof value.releaseId === 'string' && value.releaseId
      ? value.releaseId
      : (typeof releaseId === 'string' ? releaseId : ''),
    secureItemIds,
  };
}

export function buildPunctuationStarEvidence(items = {}, attempts = [], releaseId = '') {
  const secureItemIds = [];
  const referenced = referencedItemIds(attempts) || new Set();
  const itemMap = isPlainObject(items) ? items : {};
  for (const id of referenced) {
    if (punctuationStableItemBucket(itemMap[id]) !== 'secure') continue;
    secureItemIds.push(id);
    if (secureItemIds.length >= PUNCTUATION_STAR_EVIDENCE_ITEM_LIMIT) break;
  }
  return {
    version: PUNCTUATION_STAR_EVIDENCE_VERSION,
    releaseId: typeof releaseId === 'string' ? releaseId : '',
    secureItemIds,
  };
}

export function updatePunctuationStarEvidence(value, {
  itemId: rawItemId,
  secure,
  attempts = [],
  releaseId = '',
} = {}) {
  const current = normalisePunctuationStarEvidence(value, { attempts: null, releaseId })
    || buildPunctuationStarEvidence({}, [], releaseId);
  const ids = new Set(current.secureItemIds);
  const id = itemId(rawItemId);
  if (id) {
    if (secure) ids.add(id);
    else ids.delete(id);
  }
  return normalisePunctuationStarEvidence({
    ...current,
    releaseId: typeof releaseId === 'string' && releaseId ? releaseId : current.releaseId,
    secureItemIds: [...ids],
  }, { attempts, releaseId });
}
