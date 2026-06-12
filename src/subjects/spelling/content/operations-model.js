import { cloneSerialisable } from '../../../platform/core/repositories/helpers.js';
import { stableHash } from '../../../platform/core/utils.js';
import {
  normaliseSpellingContentBundle,
  validateSpellingContentBundle,
} from './model.js';
import {
  normaliseHeroExposure,
} from '../../../platform/game/reward-track-config.js';

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

export const CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE = 'spelling.monsterAssetReference';

export const CONTENT_OPERATION_ENTITY_TYPES = Object.freeze([
  'spelling.audioRequirementProfile',
  'spelling.heroExposure',
  CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE,
  'spelling.pool',
  'spelling.rewardTrack',
  'spelling.word',
  'spelling.sentenceEntry',
  'spelling.wordList',
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
const AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE = 'spelling.audioRequirementProfile';
const AUDIO_REQUIREMENT_PROFILE_ENTITY_ID = 'default';
const HERO_EXPOSURE_ENTITY_TYPE = 'spelling.heroExposure';

const EDITABLE_COLLECTIONS = Object.freeze({
  'spelling.pool': Object.freeze({ collectionPath: ['draft', 'pools'], idField: 'id' }),
  'spelling.rewardTrack': Object.freeze({ collectionPath: ['draft', 'rewardTracks'], idField: 'id' }),
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

function operationValueHash(operation) {
  return normaliseString(operation?.afterHash || operation?.after_hash, contentOperationValueHash(operation?.payload));
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
  if (operation.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE) {
    if (operation.entityId !== AUDIO_REQUIREMENT_PROFILE_ENTITY_ID) {
      throw new Error(`Unsupported audio requirement profile "${operation.entityId}".`);
    }
    if (['create', 'upsert', 'replace'].includes(operation.action)) {
      bundle.draft.audioRequirementProfile = cloneSerialisable(operation.payload) || {};
      return;
    }
    if (operation.action === 'remove' || operation.action === 'retire') {
      delete bundle.draft.audioRequirementProfile;
      return;
    }
    if (operation.action === 'set') {
      const pathParts = splitFieldPath(operation.fieldPath);
      if (!pathParts.length) {
        throw new Error('Set operations require a fieldPath.');
      }
      const next = isPlainObject(bundle.draft.audioRequirementProfile)
        ? cloneSerialisable(bundle.draft.audioRequirementProfile)
        : {};
      setAtPath(next, pathParts, operation.payload);
      bundle.draft.audioRequirementProfile = next;
      return;
    }
  }

  if (operation.entityType === CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE) {
    return;
  }

  if (operation.entityType === HERO_EXPOSURE_ENTITY_TYPE) {
    const descriptor = collectionFor(bundle, 'spelling.rewardTrack');
    if (!descriptor) {
      throw new Error('Reward-track collection is unavailable.');
    }
    const { collection, idField } = descriptor;
    const { index, entity } = findEntity(collection, idField, operation.entityId);
    if (index < 0 || !entity) {
      throw new Error(`Hero / Codex exposure target "${operation.entityId}" does not exist.`);
    }

    if (operation.action === 'remove' || operation.action === 'retire') {
      collection[index] = {
        ...cloneSerialisable(entity),
        heroExposure: normaliseHeroExposure({ state: 'hidden' }),
      };
      return;
    }

    if (operation.action === 'set') {
      const pathParts = splitFieldPath(operation.fieldPath);
      if (!pathParts.length) {
        throw new Error('Set operations require a fieldPath.');
      }
      const nextExposure = isPlainObject(entity.heroExposure)
        ? cloneSerialisable(entity.heroExposure)
        : {};
      setAtPath(nextExposure, pathParts, operation.payload);
      collection[index] = { ...cloneSerialisable(entity), heroExposure: nextExposure };
      return;
    }

    collection[index] = {
      ...cloneSerialisable(entity),
      heroExposure: cloneSerialisable(operation.payload) || {},
    };
    return;
  }

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
  if (operation?.entityType === HERO_EXPOSURE_ENTITY_TYPE) return false;
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

export function contentOperationValueHash(value) {
  return hashPayload(value === undefined ? null : value, 'after');
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
  const afterHash = normaliseString(raw.afterHash || raw.after_hash, contentOperationValueHash(payload));

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
  const target = operationConflictTarget(normalised);
  return `${target.entityType}::${target.entityId}::${target.fieldPath || '$'}`;
}

function operationConflictTarget(operation) {
  if (operation?.entityType === HERO_EXPOSURE_ENTITY_TYPE) {
    const fieldPath = operation.action === 'set' && operation.fieldPath
      ? `heroExposure.${operation.fieldPath}`
      : 'heroExposure';
    return {
      entityType: 'spelling.rewardTrack',
      entityId: operation.entityId,
      fieldPath,
    };
  }
  return {
    entityType: operation.entityType,
    entityId: operation.entityId,
    fieldPath: operation.fieldPath || '$',
  };
}

export function effectiveContentOperations(operations = []) {
  const order = [];
  const byKey = new Map();
  for (const rawOperation of operations) {
    const operation = normaliseContentOperation(rawOperation, { now: () => 0 });
    const key = operationConflictKey(operation);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, operation);
  }
  return order.map((key) => byKey.get(key));
}

export function detectContentOperationConflicts(leftOperations = [], rightOperations = []) {
  const left = effectiveContentOperations(leftOperations);
  const right = effectiveContentOperations(rightOperations);
  const conflicts = [];

  for (const leftOperation of left) {
    for (const rightOperation of right) {
      const leftTarget = operationConflictTarget(leftOperation);
      const rightTarget = operationConflictTarget(rightOperation);
      if (
        leftTarget.entityType !== rightTarget.entityType
        || leftTarget.entityId !== rightTarget.entityId
      ) {
        continue;
      }
      const sameField = (leftTarget.fieldPath || '$') === (rightTarget.fieldPath || '$');
      const structural = isStructuralOperation(leftOperation) || isStructuralOperation(rightOperation);
      if (!sameField && !structural) continue;
      if (contentOperationHash(leftOperation) === contentOperationHash(rightOperation)) continue;
      const leftValueHash = operationValueHash(leftOperation);
      const rightValueHash = operationValueHash(rightOperation);
      if (!structural && leftValueHash && rightValueHash && leftValueHash === rightValueHash) continue;
      if (!structural && leftOperation.beforeHash && rightValueHash && leftOperation.beforeHash === rightValueHash) continue;
      conflicts.push({
        conflictId: contentOperationHash({
          code: conflictCodeFor(leftOperation, rightOperation),
          entityType: leftTarget.entityType,
          entityId: leftTarget.entityId,
          fieldPath: sameField ? (leftTarget.fieldPath || rightTarget.fieldPath || '$') : '$',
          leftOperationId: leftOperation.operationId,
          rightOperationId: rightOperation.operationId,
          leftValueHash,
          rightValueHash,
        }, 'conflict'),
        code: conflictCodeFor(leftOperation, rightOperation),
        entityType: leftTarget.entityType,
        entityId: leftTarget.entityId,
        fieldPath: sameField ? (leftTarget.fieldPath || rightTarget.fieldPath || '$') : '$',
        leftOperationId: leftOperation.operationId,
        rightOperationId: rightOperation.operationId,
      });
    }
  }

  return conflicts;
}

export function readContentOperationField(bundle, operation) {
  const normalised = normaliseContentOperation(operation, { now: () => 0 });
  if (normalised.entityType === CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE) {
    return undefined;
  }
  if (normalised.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE) {
    if (normalised.entityId !== AUDIO_REQUIREMENT_PROFILE_ENTITY_ID) return undefined;
    return getAtPath(
      normaliseSpellingContentBundle(bundle).draft.audioRequirementProfile || {},
      splitFieldPath(normalised.fieldPath),
    );
  }
  if (normalised.entityType === HERO_EXPOSURE_ENTITY_TYPE) {
    const descriptor = collectionFor(normaliseSpellingContentBundle(bundle), 'spelling.rewardTrack');
    if (!descriptor) return undefined;
    const { entity } = findEntity(descriptor.collection, descriptor.idField, normalised.entityId);
    if (!entity) return undefined;
    return getAtPath(entity, ['heroExposure', ...splitFieldPath(normalised.fieldPath)]);
  }
  const descriptor = collectionFor(normaliseSpellingContentBundle(bundle), normalised.entityType);
  if (!descriptor) return undefined;
  const { entity } = findEntity(descriptor.collection, descriptor.idField, normalised.entityId);
  if (!entity) return undefined;
  return getAtPath(entity, splitFieldPath(normalised.fieldPath));
}

export function readContentOperationEntity(bundle, operation) {
  const normalised = normaliseContentOperation(operation, { now: () => 0 });
  const normalisedBundle = normaliseSpellingContentBundle(bundle);
  if (normalised.entityType === CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE) {
    return undefined;
  }
  if (normalised.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE) {
    if (normalised.entityId !== AUDIO_REQUIREMENT_PROFILE_ENTITY_ID) return undefined;
    return Object.prototype.hasOwnProperty.call(normalisedBundle.draft, 'audioRequirementProfile')
      ? cloneSerialisable(normalisedBundle.draft.audioRequirementProfile)
      : undefined;
  }
  if (normalised.entityType === HERO_EXPOSURE_ENTITY_TYPE) {
    const descriptor = collectionFor(normalisedBundle, 'spelling.rewardTrack');
    if (!descriptor) return undefined;
    const { entity } = findEntity(descriptor.collection, descriptor.idField, normalised.entityId);
    if (!entity || !isPlainObject(entity.heroExposure)) return undefined;
    return cloneSerialisable(entity.heroExposure);
  }
  const descriptor = collectionFor(normalisedBundle, normalised.entityType);
  if (!descriptor) return undefined;
  const { entity } = findEntity(descriptor.collection, descriptor.idField, normalised.entityId);
  return entity ? cloneSerialisable(entity) : undefined;
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
  const operationsHash = hashPayload(normalisedOperations, 'ops');
  return {
    baseHash: hashPayload(normaliseSpellingContentBundle(baseBundle), 'base'),
    operationsHash,
    candidateHash: hashPayload({ snapshot: candidate, operationsHash }, 'candidate'),
    candidate,
    validation,
    conflicts: [],
  };
}

function valuesMatch(left, right) {
  return contentOperationValueHash(left) === contentOperationValueHash(right);
}

function buildRevertRetirementPayload({
  reason = '',
  now = () => Date.now(),
  sourcePackageId = '',
  sourceReleaseId = '',
  operation = null,
} = {}) {
  return {
    reason: normaliseString(reason, 'Reverted through Content Operations Centre.'),
    retiredAt: Number(now()),
    source: 'content-operations-package-revert',
    revertOfPackageId: normaliseString(sourcePackageId) || null,
    revertOfReleaseId: normaliseString(sourceReleaseId) || null,
    revertOfOperationId: normaliseString(operation?.operationId) || null,
  };
}

function buildRetiredEntityForHash(operation, afterEntity, retirementPayload) {
  if (operation.entityType === HERO_EXPOSURE_ENTITY_TYPE) {
    return normaliseHeroExposure({ state: 'hidden' });
  }
  const normalisedRetirement = {
    reason: normaliseString(retirementPayload?.reason),
    source: normaliseString(retirementPayload?.source),
    retiredAt: Number.isFinite(Number(retirementPayload?.retiredAt)) ? Number(retirementPayload.retiredAt) : 0,
  };
  return {
    ...cloneSerialisable(afterEntity),
    active: false,
    retired: true,
    retirement: normalisedRetirement,
  };
}

function inverseStructuralAction(operation, beforeEntity, afterEntity, options) {
  const beforeExists = beforeEntity !== undefined;
  const afterExists = afterEntity !== undefined;
  if (beforeExists && afterExists && valuesMatch(beforeEntity, afterEntity)) return null;

  if (operation.entityType === CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE) {
    return null;
  }

  if (operation.action === 'remove') {
    if (!beforeExists) return null;
    return {
      entityType: operation.entityType,
      entityId: operation.entityId,
      fieldPath: '',
      action: 'upsert',
      payload: beforeEntity,
      beforeHash: contentOperationValueHash(afterEntity),
      afterHash: contentOperationValueHash(beforeEntity),
    };
  }

  if (operation.action === 'retire') {
    if (!beforeExists) return null;
    return {
      entityType: operation.entityType,
      entityId: operation.entityId,
      fieldPath: '',
      action: operation.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE ? 'upsert' : 'replace',
      payload: beforeEntity,
      beforeHash: contentOperationValueHash(afterEntity),
      afterHash: contentOperationValueHash(beforeEntity),
    };
  }

  if (beforeExists) {
    return {
      entityType: operation.entityType,
      entityId: operation.entityId,
      fieldPath: '',
      action: operation.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE ? 'upsert' : 'replace',
      payload: beforeEntity,
      beforeHash: contentOperationValueHash(afterEntity),
      afterHash: contentOperationValueHash(beforeEntity),
    };
  }

  if (!afterExists) return null;

  if (operation.entityType === AUDIO_REQUIREMENT_PROFILE_ENTITY_TYPE) {
    return {
      entityType: operation.entityType,
      entityId: operation.entityId,
      fieldPath: '',
      action: 'remove',
      payload: null,
      beforeHash: contentOperationValueHash(afterEntity),
      afterHash: contentOperationValueHash(null),
    };
  }

  const retirementPayload = buildRevertRetirementPayload({ ...options, operation });
  const retiredEntity = buildRetiredEntityForHash(operation, afterEntity, retirementPayload);
  return {
    entityType: operation.entityType,
    entityId: operation.entityId,
    fieldPath: '',
    action: 'retire',
    payload: retirementPayload,
    beforeHash: contentOperationValueHash(afterEntity),
    afterHash: contentOperationValueHash(retiredEntity),
  };
}

function inverseSetAction(operation, beforeSnapshot, afterSnapshot, options) {
  const beforeValue = readContentOperationField(beforeSnapshot, operation);
  const afterValue = readContentOperationField(afterSnapshot, operation);
  if (valuesMatch(beforeValue, afterValue)) return null;

  if (beforeValue !== undefined) {
    return {
      entityType: operation.entityType,
      entityId: operation.entityId,
      fieldPath: operation.fieldPath,
      action: 'set',
      payload: beforeValue,
      beforeHash: contentOperationValueHash(afterValue),
      afterHash: contentOperationValueHash(beforeValue),
    };
  }

  const beforeEntity = readContentOperationEntity(beforeSnapshot, operation);
  const afterEntity = readContentOperationEntity(afterSnapshot, operation);
  return inverseStructuralAction(operation, beforeEntity, afterEntity, options);
}

export function buildContentOperationRevertOperations({
  sourceBaseSnapshot,
  operations = [],
  reason = '',
  now = () => Date.now(),
  sourcePackageId = '',
  sourceReleaseId = '',
} = {}) {
  const normalisedOperations = operations.map((operation) => normaliseContentOperation(operation, { now: () => 0 }));
  let cursor = normaliseSpellingContentBundle(sourceBaseSnapshot);
  const timeline = [];
  for (const operation of normalisedOperations) {
    const beforeSnapshot = cursor;
    const afterSnapshot = applyContentOperationsToSpellingContent(beforeSnapshot, [operation]);
    timeline.push({ operation, beforeSnapshot, afterSnapshot });
    cursor = afterSnapshot;
  }

  const inverseOperations = [];
  const skippedOperations = [];
  const options = { reason, now, sourcePackageId, sourceReleaseId };
  for (const entry of [...timeline].reverse()) {
    const beforeEntity = readContentOperationEntity(entry.beforeSnapshot, entry.operation);
    const afterEntity = readContentOperationEntity(entry.afterSnapshot, entry.operation);
    const inverse = entry.operation.action === 'set'
      ? inverseSetAction(entry.operation, entry.beforeSnapshot, entry.afterSnapshot, options)
      : inverseStructuralAction(entry.operation, beforeEntity, afterEntity, options);
    if (inverse) {
      inverseOperations.push(inverse);
    } else {
      skippedOperations.push({
        operationId: entry.operation.operationId,
        entityType: entry.operation.entityType,
        entityId: entry.operation.entityId,
        fieldPath: entry.operation.fieldPath,
        action: entry.operation.action,
      });
    }
  }

  return {
    operations: inverseOperations,
    skippedOperations,
    replayedSnapshot: cursor,
  };
}
