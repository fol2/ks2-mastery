import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return cloneSerialisable(value) || {};
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function itemMasteryMap(value = {}) {
  return isPlainObject(value?.mastery?.items) ? value.mastery.items : {};
}

/**
 * Generated Grammar item ids contain a seed and therefore form lifetime
 * history, not bounded live state. Keep the slot for engine compatibility but
 * persist its rows separately in grammar_item_state.
 */
export function grammarStateWithoutItemMastery(value = {}) {
  const output = isPlainObject(value) ? cloneSerialisable(value) || {} : {};
  const mastery = isPlainObject(output.mastery) ? output.mastery : {};
  output.mastery = { ...mastery, items: {} };
  return output;
}

function addItemId(ids, value) {
  if (typeof value === 'string' && value) ids.add(value);
}

/**
 * Return only generated items reachable from the current bounded session.
 * A normal command never needs the learner's complete generated-item map.
 */
export function grammarGameplayItemIds(subjectRecord = {}) {
  const ids = new Set();
  const session = subjectRecord?.ui?.session;
  addItemId(ids, session?.currentItem?.itemId);
  for (const entry of Array.isArray(session?.miniTest?.questions)
    ? session.miniTest.questions
    : []) {
    addItemId(ids, entry?.item?.itemId);
  }
  return [...ids];
}

/** Compose the bounded command record from live state and point-read items. */
export function composeGrammarGameplaySubjectRecord(subjectRecord = {}, itemRows = []) {
  const items = {};
  for (const row of Array.isArray(itemRows) ? itemRows : []) {
    const itemId = typeof row?.item_id === 'string' ? row.item_id : '';
    if (!itemId) continue;
    const mastery = parseJsonObject(row.mastery_json ?? row.mastery);
    if (mastery) items[itemId] = mastery;
  }

  const data = grammarStateWithoutItemMastery(subjectRecord?.data);
  const ui = grammarStateWithoutItemMastery(subjectRecord?.ui);
  data.mastery.items = cloneSerialisable(items) || {};
  ui.mastery.items = cloneSerialisable(items) || {};
  return {
    ...subjectRecord,
    data,
    ui,
  };
}

function sameJson(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Diff only the bounded session working set, never lifetime item history. */
export function changedGrammarGameplayItems(previousData = {}, nextData = {}) {
  const previous = itemMasteryMap(previousData);
  const next = itemMasteryMap(nextData);
  const changed = [];
  // Missing from the post-command working set means "not materialised", not
  // "erase lifetime history". Reset uses an explicit learner-wide delete.
  for (const itemId of Object.keys(next)) {
    const before = isPlainObject(previous[itemId]) ? previous[itemId] : null;
    const after = isPlainObject(next[itemId]) ? next[itemId] : null;
    if (sameJson(before, after)) continue;
    changed.push({
      itemId,
      mastery: after ? cloneSerialisable(after) : null,
    });
  }
  return changed;
}
