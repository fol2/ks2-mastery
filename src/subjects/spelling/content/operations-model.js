import { cloneSerialisable } from '../../../platform/core/repositories/helpers.js';
import { stableHash } from '../../../platform/core/utils.js';
import {
  normaliseSpellingContentBundle,
  validateSpellingContentBundle,
} from './model.js';

export const CONTENT_OPERATION_SUBJECT_ID = 'spelling';

export const CONTENT_OPERATION_PACKAGE_STATES = Object.freeze({
  DRAFT: 'draft',
  READY_FOR_APPROVAL: 'ready_for_approval',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  BLOCKED: 'blocked',
  REVERTED: 'reverted',
  SUPERSEDED: 'superseded',
});

export const CONTENT_OPERATION_ENTITY_TYPES = Object.freeze([
  'spelling.word',
  'spelling.wordVariant',
  'spelling.sentenceEntry',
  'spelling.wordList',
  'spelling.pool',
  'spelling.audioRequirementProfile',
  'spelling.rewardTrack',
  'spelling.monsterBinding',
  'spelling.monsterAsset',
  'spelling.heroExposure',
  'spelling.visibilityRule',
]);

export const CONTENT_OPERATION_ACTIONS = Object.freeze([
  'create',
  'upsert',
  'replace',
  'set',
  'remove',
  'retire',
]);

const ENTITY_TYPE_SET = new Set(CONTENT_OPERATION_ENTITY_TYPES);
const ACTION_SET = new Set(CONTENT_OPERATION_ACTIONS);
const STRUCTURAL_ACTIONS = new Set(['create', 'upsert', 'replace', 'remove', 'retire']);

const EDITABLE_COLLECTIONS = Object.freeze({
  'spelling.word': Object.freeze({ collectionPath: ['draft', 'words'], idField: 'slug' }),
  'spelling.sentenceEntry': Object.freeze({ collectionPath: ['draft', 'sentences'], idField: 'id' }),
  'spelling.wordList': Object.freeze({ collectionPath: ['draft', 'wordLists'], idField: 'id' }),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashPayload(value, prefix = 'co') {
  return `${prefix}-${stableHash(stableStringify(value)).toString(36)}`;
}

function splitFieldPath(fieldPath) {
  return normaliseString(fieldPath)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getAtPath(root, pathParts) {
  let cursor = root;
  for (const part of pathParts) {
    if (cursor == null) return undefined;
    const key = Array.isArray(cursor) && /^\d+$/.test(part) ? Number(part) : part;
    cursor = cursor[key];
  }
  return cursor;
}

function setAtPath(root, pathParts, value) {
  if (!pathParts.length) return value;
  let cursor = root;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const part = pathParts[index];
    const key = Array.isArray(cursor) && /^\d+$/.test(part) ? Number(part) : part;
    if (!isPlainObject(cursor[key]) && !Array.isArray(cursor[key])) {
      cursor[key] = /^\d+$/.test(pathParts[index + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  const last = pathParts[pathParts.length - 1];
  const key = Array.isArray(cursor) && /^\d+$/.test(last) ? Number(last) : last;
  cursor[key] = cloneSerialisable(value);
  return root;
}

function collectionFor(bundle, entityType) {
  const descriptor = EDITABLE_COLLECTIONS[entityType];
  if (!descriptor) return null;
  let collection = bundle;
  for (const part of descriptor.collectionPath) {
    collection = collection?.[part];
  }
  return Array.isArray(collection) ? { ...descriptor, collection } : null;
}

function findEntity(collection, idField, entityId) {
  const index = collection.findIndex((entry) => normaliseString(entry?.[idField]) === entityId);
  return { index, entity: index >= 0 ? collection[index] : null };
}

function applyCollectionOperation(bundle, operation) {
  const descriptor = collectionFor(bundle, operation.entityType);
  if (!descriptor) {
    throw new Error(`Unsupported content operation entity type "${operation.entityType}".`);
  }
  const { collection, idField } = descriptor;
  const { index, entity } = findEntity(collection, idField, operation.entityId);

  if (operation.action === 'create') {
    if (entity) throw new Error(`Cannot create existing ${operation.entityType} "${operation.entityId}".`);
    collection.push(cloneSerialisable(operation.payload));
    return;
  }

  if (operation.action === 'upsert') {
    if (entity) {
      collection[index] = cloneSerialisable(operation.payload);
    } else {
      collection.push(cloneSerialisable(operation.payload));
    }
    return;
  }

  if (!entity) {
    throw new Error(`Cannot ${operation.action} missing ${operation.entityType} "${operation.entityId}".`);
  }

  if (operation.action === 'replace') {
    collection[index] = cloneSerialisable(operation.payload);
    return;
  }

  if (operation.action === 'remove') {
    collection.splice(index, 1);
    return;
  }

  if (operation.action === 'retire') {
    collection[index] = {
      ...cloneSerialisable(entity),
      active: false,
      retired: true,
      retirement: cloneSerialisable(operation.payload) || {},
    };
    return;
  }

  if (operation.action === 'set') {
    const pathParts = splitFieldPath(operation.fieldPath);
    if (!pathParts.length) {
      throw new Error('Set operations require a fieldPath.');
    }
    const next = cloneSerialisable(entity);
    setAtPath(next, pathParts, operation.payload);
    collection[index] = next;
  }
}

function isStructuralOperation(operation) {
  return STRUCTURAL_ACTIONS.has(operation.action) || !operation.fieldPath || operation.fieldPath === '$';
}

function conflictCodeFor(left, right) {
  if (isStructuralOperation(left) || isStructuralOperation(right)) return 'structural_conflict';
  return 'same_field_conflict';
}

export function stableContentOperationStringify(value) {
  return stableStringify(value);
}

export function contentOperationHash(value, prefix = 'co') {
  return hashPayload(value, prefix);
}

export function normaliseContentOperation(rawValue = {}, {
  actorAccountId = '',
  now = null,
  operationId = '',
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const entityType = normaliseString(raw.entityType || raw.entity_type);
  const action = normaliseString(raw.action).toLowerCase();
  const entityId = normaliseString(raw.entityId || raw.entity_id);
  const fieldPath = normaliseString(raw.fieldPath || raw.field_path);
  const rawPayload = Object.prototype.hasOwnProperty.call(raw, 'payload') ? raw.payload : raw.payload_json;
  const payload = cloneSerialisable(rawPayload === undefined ? null : rawPayload);

  if (!ENTITY_TYPE_SET.has(entityType)) {
    throw new Error(`Unsupported content operation entity type "${entityType}".`);
  }
  if (!ACTION_SET.has(action)) {
    throw new Error(`Unsupported content operation action "${action}".`);
  }
  if (!entityId) {
    throw new Error('Content operations require an entityId.');
  }
  if (action === 'set' && !fieldPath) {
    throw new Error('Set operations require a fieldPath.');
  }

  const rawCreatedAt = raw.createdAt ?? raw.created_at;
  const createdAt = Number.isFinite(Number(rawCreatedAt))
    ? Number(rawCreatedAt)
    : (typeof now === 'function' ? Number(now()) : 0);
  const createdByAccountId = normaliseString(
    raw.createdByAccountId || raw.created_by_account_id,
    actorAccountId,
  );
  const beforeHash = normaliseString(raw.beforeHash || raw.before_hash);
  const afterHash = normaliseString(raw.afterHash || raw.after_hash, hashPayload(payload, 'after'));

  return {
    operationId: normaliseString(raw.operationId || raw.operation_id, operationId),
    entityType,
    entityId,
    fieldPath,
    action,
    beforeHash,
    afterHash,
    payload,
    createdByAccountId,
    createdAt,
  };
}

export function operationConflictKey(operation) {
  const normalised = normaliseContentOperation(operation, { now: () => 0 });
  return `${normalised.entityType}::${normalised.entityId}::${normalised.fieldPath || '$'}`;
}

export function detectContentOperationConflicts(leftOperations = [], rightOperations = []) {
  const normaliseForComparison = (operation) => normaliseContentOperation(operation, { now: () => 0 });
  const left = leftOperations.map(normaliseForComparison);
  const right = rightOperations.map(normaliseForComparison);
  const conflicts = [];

  for (const leftOperation of left) {
    for (const rightOperation of right) {
      if (
        leftOperation.entityType !== rightOperation.entityType
        || leftOperation.entityId !== rightOperation.entityId
      ) {
        continue;
      }
      const sameField = (leftOperation.fieldPath || '$') === (rightOperation.fieldPath || '$');
      const structural = isStructuralOperation(leftOperation) || isStructuralOperation(rightOperation);
      if (!sameField && !structural) continue;
      if (contentOperationHash(leftOperation) === contentOperationHash(rightOperation)) continue;
      conflicts.push({
        code: conflictCodeFor(leftOperation, rightOperation),
        entityType: leftOperation.entityType,
        entityId: leftOperation.entityId,
        fieldPath: sameField ? (leftOperation.fieldPath || rightOperation.fieldPath || '$') : '$',
        leftOperationId: leftOperation.operationId,
        rightOperationId: rightOperation.operationId,
      });
    }
  }

  return conflicts;
}

export function readContentOperationField(bundle, operation) {
  const normalised = normaliseContentOperation(operation, { now: () => 0 });
  const descriptor = collectionFor(normaliseSpellingContentBundle(bundle), normalised.entityType);
  if (!descriptor) return undefined;
  const { entity } = findEntity(descriptor.collection, descriptor.idField, normalised.entityId);
  if (!entity) return undefined;
  return getAtPath(entity, splitFieldPath(normalised.fieldPath));
}

export function applyContentOperationsToSpellingContent(baseBundle, operations = []) {
  const candidate = normaliseSpellingContentBundle(baseBundle);
  const normalisedOperations = operations.map((operation) => normaliseContentOperation(operation, { now: () => 0 }));
  for (const operation of normalisedOperations) {
    applyCollectionOperation(candidate, operation);
  }
  return normaliseSpellingContentBundle(candidate);
}

export function buildSpellingContentOperationCandidate(baseBundle, operations = []) {
  const normalisedOperations = operations.map((operation) => normaliseContentOperation(operation, { now: () => 0 }));
  const candidate = applyContentOperationsToSpellingContent(baseBundle, normalisedOperations);
  const validation = validateSpellingContentBundle(candidate);
  return {
    baseHash: hashPayload(normaliseSpellingContentBundle(baseBundle), 'base'),
    operationsHash: hashPayload(normalisedOperations, 'ops'),
    candidateHash: hashPayload(candidate, 'candidate'),
    candidate,
    validation,
    conflicts: [],
  };
}
