/**
 * Punctuation Template DSL — declarative authoring for generated question templates.
 *
 * Manifest-leaf module: zero imports from sibling punctuation modules.
 * Exports:
 *   definePunctuationTemplate(spec) → frozen validated DSL definition
 *   expandDslTemplates(dslDefinitions) → flat template array compatible with GENERATED_TEMPLATE_BANK
 */

// ─── Hash utilities (same FNV-1a logic as generators.js) ───────────────────────

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shortHash(value) {
  return hashString(value).toString(36).padStart(6, '0').slice(0, 8);
}

// ─── Deterministic expansion helpers ───────────────────────────────────────────

/**
 * Cartesian product of slot value arrays, with keys sorted alphabetically.
 * Returns an array of objects mapping slotName → value.
 */
function cartesianProduct(slots) {
  const keys = Object.keys(slots).sort();
  if (keys.length === 0) return [{}];

  let combos = [{}];
  for (const key of keys) {
    const values = slots[key];
    const next = [];
    for (const combo of combos) {
      for (const value of values) {
        next.push({ ...combo, [key]: value });
      }
    }
    combos = next;
  }
  return combos;
}

/**
 * Produce a short hash for a given slot combination (deterministic).
 */
function slotCombinationHash(slotValues) {
  const keys = Object.keys(slotValues).sort();
  const payload = keys.map((k) => `${k}=${slotValues[k]}`).join('|');
  return shortHash(payload);
}

// ─── Signature logic (mirrors generators.js variantSignatureFor) ───────────────

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseSignatureText(value) {
  return String(value ?? '')
    .replace(/ /g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value)
    .sort()
    .map((key) => [key, stableJson(value[key])]));
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((entry) => typeof entry === 'string' && entry))];
}

function variantSignatureFor({ familyId, mode, templateId, template, model }) {
  const signaturePayload = {
    familyId,
    mode,
    templateId,
    prompt: normaliseSignatureText(template.prompt || ''),
    stem: normaliseSignatureText(template.stem || ''),
    model: normaliseSignatureText(model || ''),
    skillIds: uniqueStrings(template.skillIds).sort(),
    clusterId: template.clusterId || '',
    validatorType: isPlainObject(template.validator) ? template.validator.type || '' : '',
    rubricType: isPlainObject(template.rubric) ? template.rubric.type || '' : '',
  };
  return `puncsig_${shortHash(JSON.stringify(stableJson(signaturePayload)))}`;
}

// ─── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'id', 'familyId', 'mode', 'skillIds', 'clusterId',
  'rewardUnitId', 'misconceptionTags', 'readiness',
  'slots', 'build', 'tests',
];

function validateSpec(spec) {
  if (!isPlainObject(spec)) {
    throw new Error('definePunctuationTemplate: spec must be a plain object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (spec[field] === undefined || spec[field] === null) {
      throw new Error(
        `definePunctuationTemplate: missing required field "${field}" in template "${spec.id || '(no id)'}"`,
      );
    }
  }

  if (typeof spec.id !== 'string' || !spec.id.trim()) {
    throw new Error('definePunctuationTemplate: "id" must be a non-empty string');
  }
  if (typeof spec.familyId !== 'string' || !spec.familyId.trim()) {
    throw new Error(`definePunctuationTemplate: "familyId" must be a non-empty string in template "${spec.id}"`);
  }
  if (typeof spec.mode !== 'string' || !spec.mode.trim()) {
    throw new Error(`definePunctuationTemplate: "mode" must be a non-empty string in template "${spec.id}"`);
  }
  if (!Array.isArray(spec.skillIds) || spec.skillIds.length === 0) {
    throw new Error(`definePunctuationTemplate: "skillIds" must be a non-empty array in template "${spec.id}"`);
  }
  if (typeof spec.clusterId !== 'string' || !spec.clusterId.trim()) {
    throw new Error(`definePunctuationTemplate: "clusterId" must be a non-empty string in template "${spec.id}"`);
  }
  if (typeof spec.rewardUnitId !== 'string' || !spec.rewardUnitId.trim()) {
    throw new Error(`definePunctuationTemplate: "rewardUnitId" must be a non-empty string in template "${spec.id}"`);
  }
  if (!Array.isArray(spec.misconceptionTags)) {
    throw new Error(`definePunctuationTemplate: "misconceptionTags" must be an array in template "${spec.id}"`);
  }
  if (!Array.isArray(spec.readiness)) {
    throw new Error(`definePunctuationTemplate: "readiness" must be an array in template "${spec.id}"`);
  }
  if (!isPlainObject(spec.slots)) {
    throw new Error(`definePunctuationTemplate: "slots" must be a plain object in template "${spec.id}"`);
  }
  const slotKeys = Object.keys(spec.slots);
  if (slotKeys.length === 0) {
    throw new Error(`definePunctuationTemplate: "slots" must have at least one key in template "${spec.id}"`);
  }
  for (const key of slotKeys) {
    if (!Array.isArray(spec.slots[key]) || spec.slots[key].length === 0) {
      throw new Error(
        `definePunctuationTemplate: slot "${key}" must be a non-empty array in template "${spec.id}"`,
      );
    }
  }
  if (typeof spec.build !== 'function') {
    throw new Error(`definePunctuationTemplate: "build" must be a function in template "${spec.id}"`);
  }
  if (!isPlainObject(spec.tests)) {
    throw new Error(`definePunctuationTemplate: "tests" must be an object in template "${spec.id}"`);
  }
}

// ─── Preservation token derivation ────────────────────────────────────────────

/**
 * Derive preservation tokens from a stem by stripping punctuation and splitting
 * into a normalised word array. Called at build time so generated items carry
 * preservation metadata for the marking oracle.
 */
export function derivePreserveTokens(stem) {
  return String(stem ?? '')
    .replace(/["""''']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate and freeze a DSL template spec.
 */
export function definePunctuationTemplate(spec) {
  validateSpec(spec);
  return Object.freeze({ ...spec });
}

/**
 * Expand an array of validated DSL definitions into a flat array of
 * template objects compatible with GENERATED_TEMPLATE_BANK.
 *
 * Options:
 *   embedTemplateId (default true) — if false, omits the DSL-generated
 *     templateId from each output template so that generators.js computes
 *     a content-hash-based templateId instead (backward-compatible mode).
 */
export function expandDslTemplates(dslDefinitions, { embedTemplateId = true } = {}) {
  if (!Array.isArray(dslDefinitions)) {
    throw new Error('expandDslTemplates: argument must be an array');
  }

  const allTemplates = [];
  const allSignatures = new Set();

  for (const spec of dslDefinitions) {
    const combos = cartesianProduct(spec.slots);

    for (const slotValues of combos) {
      const slotHash = slotCombinationHash(slotValues);
      const templateId = `${spec.id}_${slotHash}`;

      const buildResult = spec.build(slotValues);

      if (!isPlainObject(buildResult)) {
        throw new Error(
          `expandDslTemplates: build() must return a plain object in template "${spec.id}" (slots: ${JSON.stringify(slotValues)})`,
        );
      }
      if (typeof buildResult.model !== 'string' || !buildResult.model) {
        throw new Error(
          `expandDslTemplates: build() must return a "model" string in template "${spec.id}" (slots: ${JSON.stringify(slotValues)})`,
        );
      }

      // In backward-compat mode (embedTemplateId: false), only include skillIds/clusterId
      // on the template when the build result explicitly provides them — this preserves
      // content-hash parity with the hand-authored templates that lacked these fields.
      const skillIdsEntry = embedTemplateId
        ? { skillIds: buildResult.skillIds || spec.skillIds }
        : (Array.isArray(buildResult.skillIds) ? { skillIds: buildResult.skillIds } : {});
      const clusterIdEntry = embedTemplateId
        ? { clusterId: buildResult.clusterId || spec.clusterId }
        : (typeof buildResult.clusterId === 'string' ? { clusterId: buildResult.clusterId } : {});

      const template = {
        prompt: buildResult.prompt || 'Practise this punctuation pattern.',
        stem: buildResult.stem || '',
        model: buildResult.model,
        ...(isPlainObject(buildResult.validator) ? { validator: buildResult.validator } : {}),
        ...(isPlainObject(buildResult.rubric) ? { rubric: buildResult.rubric } : {}),
        ...(Array.isArray(buildResult.accepted) ? { accepted: buildResult.accepted } : {}),
        explanation: buildResult.explanation || 'This generated item practises the same published punctuation skill.',
        ...(typeof buildResult.explanationRuleId === 'string' ? { explanationRuleId: buildResult.explanationRuleId } : {}),
        ...skillIdsEntry,
        ...clusterIdEntry,
        misconceptionTags: buildResult.misconceptionTags || spec.misconceptionTags,
        readiness: buildResult.readiness || spec.readiness,
        ...(embedTemplateId ? { templateId } : {}),
        tests: spec.tests,
      };

      // Compute variant signature for duplicate detection (always uses DSL templateId internally)
      const sigTemplate = {
        ...template,
        templateId,
        skillIds: template.skillIds || spec.skillIds,
        clusterId: template.clusterId || spec.clusterId,
      };
      const signature = variantSignatureFor({
        familyId: spec.familyId,
        mode: spec.mode,
        templateId,
        template: sigTemplate,
        model: template.model,
      });

      if (allSignatures.has(signature)) {
        throw new Error(
          `expandDslTemplates: duplicate variant signature "${signature}" in template "${spec.id}" (slots: ${JSON.stringify(slotValues)})`,
        );
      }
      allSignatures.add(signature);

      allTemplates.push(Object.freeze(template));
    }
  }

  return Object.freeze(allTemplates);
}
