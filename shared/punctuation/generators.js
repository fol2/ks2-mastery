import {
  PUNCTUATION_CONTENT_MANIFEST,
} from './content.js';
import {
  contextPackTemplatesForFamily,
} from './context-packs.js';
import { expandDslTemplates } from './template-dsl.js';
import { sentenceEndingsInsertDsl } from './dsl-families/sentence-endings-insert.js';
import { apostropheContractionsDsl } from './dsl-families/apostrophe-contractions-fix.js';
import { commaClarityInsertDsl } from './dsl-families/comma-clarity-insert.js';
import { dashClauseFixDsl } from './dsl-families/dash-clause-fix.js';
import { dashClauseCombineDsl } from './dsl-families/dash-clause-combine.js';
import { hyphenInsertDsl } from './dsl-families/hyphen-insert.js';
import { semicolonListFixDsl } from './dsl-families/semicolon-list-fix.js';
import { apostrophePossessionInsertDsl } from './dsl-families/apostrophe-possession-insert.js';
import { apostropheMixParagraphDsl } from './dsl-families/apostrophe-mix-paragraph.js';
import { speechInsertDsl } from './dsl-families/speech-insert.js';
import { frontedSpeechParagraphDsl } from './dsl-families/fronted-speech-paragraph.js';
import { listCommasInsertDsl } from './dsl-families/list-commas-insert.js';
import { listCommasCombineDsl } from './dsl-families/list-commas-combine.js';
import { frontedAdverbialFixDsl } from './dsl-families/fronted-adverbial-fix.js';
import { frontedAdverbialCombineDsl } from './dsl-families/fronted-adverbial-combine.js';
import { parenthesisFixDsl } from './dsl-families/parenthesis-fix.js';
import { parenthesisCombineDsl } from './dsl-families/parenthesis-combine.js';
import { parenthesisSpeechParagraphDsl } from './dsl-families/parenthesis-speech-paragraph.js';
import { colonListInsertDsl } from './dsl-families/colon-list-insert.js';
import { colonListCombineDsl } from './dsl-families/colon-list-combine.js';
import { semicolonFixDsl } from './dsl-families/semicolon-fix.js';
import { semicolonCombineDsl } from './dsl-families/semicolon-combine.js';
import { colonSemicolonParagraphDsl } from './dsl-families/colon-semicolon-paragraph.js';
import { bulletPointsFixDsl } from './dsl-families/bullet-points-fix.js';
import { bulletPointsParagraphDsl } from './dsl-families/bullet-points-paragraph.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function normaliseSignatureText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
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

/**
 * Strip `explanation` keys from a validator structure before hashing.
 * Explanation is a P6 learner-feedback addition that must not alter template identity.
 */
function stripExplanationForHash(value) {
  if (Array.isArray(value)) return value.map(stripExplanationForHash);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'explanation')
      .map(([key, v]) => [key, stripExplanationForHash(v)]),
  );
}

function templateIdFor(familyId, template) {
  const explicit = typeof template?.templateId === 'string' ? template.templateId.trim() : '';
  if (explicit) return explicit;
  const payload = {
    prompt: normaliseSignatureText(template.prompt || ''),
    stem: normaliseSignatureText(template.stem || ''),
    model: normaliseSignatureText(template.model || ''),
    accepted: Array.isArray(template.accepted)
      ? template.accepted.map(normaliseSignatureText).sort()
      : [],
    skillIds: uniqueStrings(template.skillIds).sort(),
    clusterId: template.clusterId || '',
    validator: stableJson(stripExplanationForHash(template.validator || {})),
    rubric: stableJson(template.rubric || {}),
  };
  return `${familyId}_template_${shortHash(JSON.stringify(stableJson(payload)))}`;
}

function variantSignatureFor({ family, template, templateId, model }) {
  const signaturePayload = {
    familyId: family.id,
    mode: family.mode,
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

function pickTemplate(templates, seed, familyId, variantIndex, {
  legacyTemplateCount = 2,
  runtimeStableTemplateCount = legacyTemplateCount,
} = {}) {
  if (!templates.length) return null;
  const legacyCount = Math.max(0, Math.min(Number(legacyTemplateCount) || 0, templates.length));
  const stableCount = Math.max(
    legacyCount,
    Math.min(Number(runtimeStableTemplateCount) || legacyCount, templates.length),
  );
  const stableExpansionPool = templates.slice(legacyCount, stableCount);
  const capacityExpansionPool = templates.slice(stableCount);
  const pool = (() => {
    if (variantIndex < legacyCount) return templates.slice(0, legacyCount || templates.length);
    if (variantIndex < stableCount && stableExpansionPool.length) return stableExpansionPool;
    if (capacityExpansionPool.length) return capacityExpansionPool;
    if (stableExpansionPool.length) return stableExpansionPool;
    return templates.slice(0, legacyCount || templates.length);
  })();
  const offset = hashString(`${seed}:${familyId}`) % pool.length;
  const poolVariantIndex = (() => {
    if (variantIndex < legacyCount) return variantIndex;
    if (variantIndex < stableCount && stableExpansionPool.length) return variantIndex - legacyCount;
    if (capacityExpansionPool.length) return variantIndex - stableCount;
    if (stableExpansionPool.length) return variantIndex - legacyCount;
    return variantIndex;
  })();
  const poolIndex = (offset + poolVariantIndex) % pool.length;
  const template = pool[poolIndex];
  return {
    template,
    templateIndex: Math.max(0, templates.indexOf(template)),
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((entry) => typeof entry === 'string' && entry))];
}

export const GENERATED_TEMPLATE_BANK = Object.freeze({
  gen_sentence_endings_insert: expandDslTemplates(sentenceEndingsInsertDsl, { embedTemplateId: false }),
  gen_apostrophe_contractions_fix: expandDslTemplates(apostropheContractionsDsl, { embedTemplateId: false }),
  gen_apostrophe_possession_insert: expandDslTemplates(apostrophePossessionInsertDsl, { embedTemplateId: false }),
  gen_apostrophe_mix_paragraph: expandDslTemplates(apostropheMixParagraphDsl, { embedTemplateId: false }),
  gen_speech_insert: expandDslTemplates(speechInsertDsl, { embedTemplateId: false }),
  gen_list_commas_insert: expandDslTemplates(listCommasInsertDsl, { embedTemplateId: false }),
  gen_list_commas_combine: expandDslTemplates(listCommasCombineDsl, { embedTemplateId: false }),
  gen_fronted_adverbial_fix: expandDslTemplates(frontedAdverbialFixDsl, { embedTemplateId: false }),
  gen_fronted_adverbial_combine: expandDslTemplates(frontedAdverbialCombineDsl, { embedTemplateId: false }),
  gen_fronted_speech_paragraph: expandDslTemplates(frontedSpeechParagraphDsl, { embedTemplateId: false }),
  gen_comma_clarity_insert: expandDslTemplates(commaClarityInsertDsl, { embedTemplateId: false }),
  gen_semicolon_fix: expandDslTemplates(semicolonFixDsl, { embedTemplateId: false }),
  gen_semicolon_combine: expandDslTemplates(semicolonCombineDsl, { embedTemplateId: false }),
  gen_colon_semicolon_paragraph: expandDslTemplates(colonSemicolonParagraphDsl, { embedTemplateId: false }),
  gen_dash_clause_fix: expandDslTemplates(dashClauseFixDsl, { embedTemplateId: false }),
  gen_dash_clause_combine: expandDslTemplates(dashClauseCombineDsl, { embedTemplateId: false }),
  gen_hyphen_insert: expandDslTemplates(hyphenInsertDsl, { embedTemplateId: false }),
  gen_parenthesis_fix: expandDslTemplates(parenthesisFixDsl, { embedTemplateId: false }),
  gen_parenthesis_combine: expandDslTemplates(parenthesisCombineDsl, { embedTemplateId: false }),
  gen_parenthesis_speech_paragraph: expandDslTemplates(parenthesisSpeechParagraphDsl, { embedTemplateId: false }),
  gen_colon_list_insert: expandDslTemplates(colonListInsertDsl, { embedTemplateId: false }),
  gen_colon_list_combine: expandDslTemplates(colonListCombineDsl, { embedTemplateId: false }),
  gen_semicolon_list_fix: expandDslTemplates(semicolonListFixDsl, { embedTemplateId: false }),
  gen_bullet_points_fix: expandDslTemplates(bulletPointsFixDsl, { embedTemplateId: false }),
  gen_bullet_points_paragraph: expandDslTemplates(bulletPointsParagraphDsl, { embedTemplateId: false }),
});

function buildGeneratedItem({ family, skill, template, templateIndex, seed, variantIndex }) {
  const idSeed = `${seed}:${family.id}:${variantIndex}`;
  const model = typeof template.model === 'string' ? template.model : '';
  const templateSkillIds = uniqueStrings(template.skillIds);
  const skillIds = templateSkillIds.length ? templateSkillIds : [family.skillId];
  const templateId = templateIdFor(family.id, template, templateIndex);
  return {
    id: `${family.id}_${shortHash(idSeed)}_${variantIndex + 1}`,
    mode: family.mode,
    templateId,
    variantSignature: variantSignatureFor({ family, template, templateId, model }),
    skillIds,
    clusterId: template.clusterId || skill.clusterId,
    rewardUnitId: family.rewardUnitId,
    prompt: template.prompt || 'Practise this punctuation pattern.',
    stem: template.stem || '',
    accepted: uniqueStrings([model, ...(Array.isArray(template.accepted) ? template.accepted : [])]),
    explanation: template.explanation || 'This generated item practises the same published punctuation skill.',
    model,
    ...(isPlainObject(template.validator) ? { validator: template.validator } : {}),
    ...(isPlainObject(template.rubric) ? { rubric: template.rubric } : {}),
    misconceptionTags: uniqueStrings(template.misconceptionTags),
    readiness: uniqueStrings(template.readiness),
    source: 'generated',
    generatorFamilyId: family.id,
  };
}

/** Current production depth — raise after all P5 gates pass at depth 6. */
export const PRODUCTION_DEPTH = 4;

/** Maximum audited depth — used for capacity verification only. */
export const CAPACITY_DEPTH = 8;

export function createPunctuationGeneratedItems({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation',
  perFamily = 1,
  depth,
  contextPack = null,
} = {}) {
  const effectiveDepth = depth != null ? depth : perFamily;
  const limit = Math.max(0, Math.floor(Number(effectiveDepth) || 0));
  if (limit === 0) return [];
  const skills = new Map((Array.isArray(manifest.skills) ? manifest.skills : []).map((skill) => [skill.id, skill]));
  const items = [];
  for (const family of Array.isArray(manifest.generatorFamilies) ? manifest.generatorFamilies : []) {
    if (!family?.published) continue;
    const skill = skills.get(family.skillId);
    const contextTemplates = contextPack
      ? contextPackTemplatesForFamily(family.id, contextPack)
      : [];
    const templates = contextTemplates.length ? contextTemplates : (GENERATED_TEMPLATE_BANK[family.id] || []);
    if (!skill || !templates.length) continue;
    for (let index = 0; index < limit; index += 1) {
      const picked = pickTemplate(templates, seed, family.id, index, {
        legacyTemplateCount: contextTemplates.length ? 1 : 2,
        runtimeStableTemplateCount: contextTemplates.length ? templates.length : 4,
      });
      if (!picked?.template) continue;
      items.push(buildGeneratedItem({
        family,
        skill,
        template: picked.template,
        templateIndex: picked.templateIndex,
        seed,
        variantIndex: index,
      }));
    }
  }
  return items;
}

export function createPunctuationRuntimeManifest({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation',
  generatedPerFamily = 1,
  depth,
  contextPack = null,
  allowContextPacks = false,
} = {}) {
  if (contextPack && allowContextPacks !== true) {
    throw new Error(
      'Context packs are teacher/admin-only in P3. Pass allowContextPacks: true for preview/admin paths.',
    );
  }
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed,
    perFamily: generatedPerFamily,
    depth,
    contextPack,
  });
  if (!generatedItems.length) return manifest;
  return Object.freeze({
    ...manifest,
    items: Object.freeze([
      ...(Array.isArray(manifest.items) ? manifest.items : []),
      ...generatedItems,
    ]),
  });
}
