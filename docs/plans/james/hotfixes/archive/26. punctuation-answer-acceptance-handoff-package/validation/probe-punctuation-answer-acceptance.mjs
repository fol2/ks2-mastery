import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PUNCTUATION_CONTENT_MANIFEST } = await import(pathToFileURL(resolve('shared/punctuation/content.js')).href);
const { PRODUCTION_DEPTH, createPunctuationRuntimeManifest } = await import(pathToFileURL(resolve('shared/punctuation/generators.js')).href);
const { markPunctuationAnswer } = await import(pathToFileURL(resolve('shared/punctuation/marking.js')).href);

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function duplicateTerminal(text) {
  const value = String(text || '');
  if (!/[.?!]["'”’]?$/.test(value)) return null;
  return value.replace(/([.?!])(["'”’]?)$/, '$1$1$2');
}

function removeTerminal(text) {
  const value = String(text || '');
  if (!/[.?!]["'”’]?$/.test(value)) return null;
  return value.replace(/([.?!])(["'”’]?)$/, '$2');
}

function lowerFirstCapital(text) {
  const value = String(text || '');
  const mutated = value.replace(/^(\s*["'“‘]?)([A-Z])/, (_, prefix, char) => `${prefix}${char.toLowerCase()}`);
  return mutated === value ? null : mutated;
}

function appendExtraBeforeTerminal(text) {
  const value = String(text || '');
  if (!/[.?!]["'”’]?$/.test(value)) return null;
  return value.replace(/([.?!])(["'”’]?)$/, ' extra$1$2');
}

const mutators = {
  duplicateTerminal,
  noTerminal: removeTerminal,
  lowercaseStart: lowerFirstCapital,
  appendExtra: appendExtraBeforeTerminal,
};

const runtime = createPunctuationRuntimeManifest({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  generatedPerFamily: PRODUCTION_DEPTH,
});

const items = runtime.items || [];
const results = {};
for (const [name, mutate] of Object.entries(mutators)) {
  const findings = [];
  for (const item of items) {
    if (!item || item.mode === 'choose' || item.inputKind === 'choice') continue;
    const model = String(item.model || '');
    if (!model) continue;
    const golden = markPunctuationAnswer({ item, answer: answerForItem(item) });
    if (!golden.correct) continue;
    const mutated = mutate(model, item);
    if (!mutated || mutated === model) continue;
    const result = markPunctuationAnswer({ item, answer: { typed: mutated } });
    if (result?.correct === true) {
      findings.push({
        id: item.id,
        source: item.source || 'fixed',
        familyId: item.generatorFamilyId || '',
        mode: item.mode || '',
        skillIds: item.skillIds || [],
        model,
        mutated,
        note: result.note || '',
        misconceptionTags: result.misconceptionTags || [],
      });
    }
  }
  const byFamilyMode = findings.reduce((acc, finding) => {
    const key = `${finding.source}:${finding.familyId || finding.id}:${finding.mode}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  results[name] = {
    acceptedIncorrectCount: findings.length,
    byFamilyMode,
    examples: findings.slice(0, 12),
  };
}

const output = {
  releaseId: PUNCTUATION_CONTENT_MANIFEST.releaseId,
  productionDepth: PRODUCTION_DEPTH,
  runtimeItems: items.length,
  generatedItems: items.filter((item) => item.source === 'generated').length,
  fixedItems: items.filter((item) => item.source !== 'generated').length,
  results,
};
console.log(JSON.stringify(output, null, 2));
