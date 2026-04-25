import { PUNCTUATION_CONTENT_MANIFEST } from '../../../../shared/punctuation/content.js';
import {
  normalisePunctuationContextPack,
} from '../../../../shared/punctuation/context-packs.js';
import { createPunctuationGeneratedItems } from '../../../../shared/punctuation/generators.js';

function cleanText(value) {
  return String(value ?? '').trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function configuredContextPackSource(env = {}) {
  if (isPlainObject(env.PUNCTUATION_AI_CONTEXT_PACK)) return env.PUNCTUATION_AI_CONTEXT_PACK;
  if (cleanText(env.PUNCTUATION_AI_CONTEXT_PACK_JSON)) return env.PUNCTUATION_AI_CONTEXT_PACK_JSON;
  return null;
}

export function punctuationContextPackProviderConfigured(env = {}) {
  return configuredContextPackSource(env) != null;
}

function safeSummary({
  normalised,
  generatedItems,
  status = 'ready',
  code = null,
  message = '',
} = {}) {
  const summary = normalised?.summary || {};
  return {
    status,
    code,
    message,
    acceptedCount: Number(summary.acceptedCount) || 0,
    rejectedCount: Number(summary.rejectedCount) || 0,
    atomKinds: Array.isArray(summary.atomKinds) ? summary.atomKinds.filter((entry) => typeof entry === 'string') : [],
    affectedGeneratorFamilies: Array.isArray(summary.affectedGeneratorFamilies)
      ? summary.affectedGeneratorFamilies.filter((entry) => typeof entry === 'string')
      : [],
    generatedItemCount: Array.isArray(generatedItems) ? generatedItems.length : 0,
  };
}

export async function requestPunctuationContextPack({
  env = {},
  payload = {},
  manifest = PUNCTUATION_CONTENT_MANIFEST,
} = {}) {
  const source = configuredContextPackSource(env);
  if (source == null) {
    return safeSummary({
      status: 'unavailable',
      code: 'punctuation_context_provider_missing',
      message: 'Punctuation context-pack enrichment is not configured.',
    });
  }

  const rawContextPack = parseJson(source);
  const normalised = normalisePunctuationContextPack(rawContextPack);
  if (!normalised.ok) {
    return safeSummary({
      normalised,
      status: 'unavailable',
      code: 'punctuation_context_pack_invalid',
      message: 'Punctuation context-pack configuration is invalid.',
    });
  }

  const seed = cleanText(payload.seed) || manifest.releaseId || 'punctuation-context-pack';
  const generatedItems = normalised.summary.acceptedCount > 0
    ? createPunctuationGeneratedItems({
        manifest,
        seed,
        perFamily: 1,
        contextPack: normalised,
      })
    : [];

  return safeSummary({
    normalised,
    generatedItems,
    status: 'ready',
    code: null,
    message: 'Context pack compiled.',
  });
}
