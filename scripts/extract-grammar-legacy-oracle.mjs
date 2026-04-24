#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const CONTENT_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';

const FUNCTION_NAMES = [
  'clamp',
  'randInt',
  'pick',
  'shuffle',
  'sampleMany',
  'mulberry32',
  'escapeHtml',
  'cleanSpaces',
  'lowerClean',
  'sentenceBare',
  'compareAnswerString',
  'setEq',
  'mkResult',
  'markStringAnswer',
  'makeBaseQuestion',
  'capFirst',
  'ensureSentenceEnd',
  'quoteVariants',
  'dedupePlain',
  'proceduralSubjectObject',
  'buildChoiceOptions',
  'buildWordOptions',
  'choiceResult',
  'generateStandardEnglishCase',
  'generateTenseCase',
  'generatePassiveCase',
  'seededBool',
  'generateRelativeClauseCase',
  'generatePronounCohesionCase',
  'generateSubjectObjectCase',
  'generateFormalityCase',
  'generateModalCase',
  'seededIndex',
  'isPunctuationSkill',
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultContentPath = path.join(repoRoot, 'worker/src/subjects/grammar/content.js');
const defaultFixtureDir = path.join(repoRoot, 'tests/fixtures/grammar-legacy-oracle');
const defaultFixturePath = path.join(defaultFixtureDir, 'legacy-baseline.json');

function usage() {
  console.error([
    'Usage: node scripts/extract-grammar-legacy-oracle.mjs --source <legacy-html> [--content-out <path>] [--fixture-out <path>]',
    '',
    'The source can also be supplied through GRAMMAR_LEGACY_HTML.',
  ].join('\n'));
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    out[token.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function extractScript(html) {
  const match = /<script>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error('Could not find legacy script block.');
  return match[1].replace(/\binitialise\(\);\s*$/, '');
}

function findBalancedBlock(source, startIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const prev = source[index - 1];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote && !(quote === '`' && prev === '$')) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error(`Unbalanced block starting at ${startIndex}.`);
}

function extractConstRange(source) {
  const start = source.indexOf('const MISCONCEPTIONS =');
  const end = source.indexOf('const TEMPLATE_MAP =');
  if (start < 0 || end < 0 || end <= start) throw new Error('Could not locate legacy content constant range.');
  return source.slice(start, end).trim();
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Could not locate function ${name}.`);
  const next = source.slice(start + 1).search(/\nfunction\s+[A-Za-z0-9_$]+\s*\(/);
  const end = next >= 0 ? start + 1 + next : findBalancedBlock(source, source.indexOf('{', start));
  return source.slice(start, end).trim();
}

function patchWorkerSafeSource(source) {
  return source
    .replace('const singular = Math.random() < 0.5;', 'const singular = rng() < 0.5;');
}

function contentFooter() {
  return `
const TEMPLATE_MAP = Object.fromEntries(TEMPLATES.map(template => [template.id, template]));

function stripLegacyHtml(value) {
  return cleanSpaces(String(value || '')
    .replace(/<br\\s*\\/?>/gi, ' ')
    .replace(/<\\/p>/gi, ' ')
    .replace(/<\\/li>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"'));
}

function cloneSerialisable(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function serialiseInputSpec(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object' || Array.isArray(inputSpec)) return null;
  return cloneSerialisable(inputSpec);
}

export const GRAMMAR_CONTENT_RELEASE_ID = '${CONTENT_RELEASE_ID}';
export const GRAMMAR_MISCONCEPTIONS = Object.freeze(MISCONCEPTIONS);
export const GRAMMAR_MINIMAL_HINTS = Object.freeze(MINIMAL_HINTS);
export const GRAMMAR_QUESTION_TYPES = Object.freeze(QUESTION_TYPES);
export const GRAMMAR_PUNCTUATION_CONCEPT_IDS = Object.freeze(PUNCTUATION_SKILL_IDS.slice());
export const GRAMMAR_CONCEPTS = Object.freeze(Object.entries(SKILLS).map(([id, skill]) => Object.freeze({
  id,
  domain: skill.domain,
  name: skill.name,
  summary: skill.summary,
  notices: Object.freeze((skill.notices || []).slice()),
  worked: Object.freeze({ ...(skill.worked || {}) }),
  contrast: Object.freeze({ ...(skill.contrast || {}) }),
  punctuationForGrammar: PUNCTUATION_SKILL_IDS.includes(id),
})));
export const GRAMMAR_TEMPLATES = Object.freeze(TEMPLATES);
export const GRAMMAR_TEMPLATE_MAP = Object.freeze(TEMPLATE_MAP);

export function grammarTemplateMetadata(template = {}) {
  return {
    id: template.id,
    label: template.label,
    domain: template.domain,
    questionType: template.questionType,
    difficulty: Number(template.difficulty) || 1,
    satsFriendly: Boolean(template.satsFriendly),
    isSelectedResponse: Boolean(template.isSelectedResponse),
    generative: Boolean(template.generative),
    tags: Object.freeze((template.tags || []).slice()),
    skillIds: Object.freeze((template.skillIds || []).slice()),
  };
}

export const GRAMMAR_TEMPLATE_METADATA = Object.freeze(GRAMMAR_TEMPLATES.map(grammarTemplateMetadata));

export function grammarConceptById(conceptId) {
  return GRAMMAR_CONCEPTS.find((concept) => concept.id === conceptId) || null;
}

export function grammarTemplateById(templateId) {
  return GRAMMAR_TEMPLATE_MAP[templateId] || null;
}

export function createGrammarQuestion({ templateId, seed } = {}) {
  const template = grammarTemplateById(templateId);
  if (!template || typeof template.generator !== 'function') return null;
  return template.generator(Number(seed) || 0);
}

export function evaluateGrammarQuestion(question, response = {}) {
  if (!question || typeof question.evaluate !== 'function') return null;
  return question.evaluate(response && typeof response === 'object' && !Array.isArray(response) ? response : {});
}

export function serialiseGrammarQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  return {
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    templateId: question.templateId,
    templateLabel: question.templateLabel,
    domain: question.domain,
    skillIds: (question.skillIds || []).slice(),
    questionType: question.questionType,
    seed: Number(question.seed) || 0,
    itemId: question.itemId,
    marks: Number(question.marks) || 1,
    promptText: stripLegacyHtml(question.stemHtml),
    inputSpec: serialiseInputSpec(question.inputSpec),
    solutionLines: (question.solutionLines || []).map(stripLegacyHtml),
    reflectionPrompt: stripLegacyHtml(question.reflectionPrompt || ''),
    checkLine: stripLegacyHtml(question.checkLine || ''),
    replay: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      templateId: question.templateId,
      seed: Number(question.seed) || 0,
      itemId: question.itemId,
      conceptIds: (question.skillIds || []).slice(),
      questionType: question.questionType,
    },
  };
}
`.trim();
}

function generatedContentSource(legacyScript) {
  const constants = extractConstRange(legacyScript);
  const functions = FUNCTION_NAMES.map((name) => extractFunction(legacyScript, name)).join('\n\n');
  return `${[
    '// Generated from the reviewed KS2 Grammar legacy engine.',
    '// Regenerate with: node scripts/extract-grammar-legacy-oracle.mjs --source <legacy-html>',
    '',
    patchWorkerSafeSource(constants),
    '',
    patchWorkerSafeSource(functions),
    '',
    contentFooter(),
    '',
  ].join('\n')}`;
}

function buildRuntime(legacyScript) {
  const source = `${patchWorkerSafeSource(legacyScript)}
globalThis.__grammar = {
  MISCONCEPTIONS,
  MINIMAL_HINTS,
  QUESTION_TYPES,
  SKILLS,
  PUNCTUATION_SKILL_IDS,
  TEMPLATES,
};
`;
  const context = {
    console,
    Date,
    Math: Object.create(Math),
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  context.Math.random = () => 0.42;
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 5_000 });
  return context.__grammar;
}

function combinations(values) {
  const out = [[]];
  for (const value of values) {
    const size = out.length;
    for (let index = 0; index < size; index += 1) {
      out.push([...out[index], value]);
    }
  }
  return out;
}

function bestResult(question, response) {
  try {
    return question.evaluate(response);
  } catch {
    return null;
  }
}

function findBestResponse(question) {
  const spec = question.inputSpec || {};
  let candidates = [{}];
  if (spec.type === 'single_choice') {
    candidates = (spec.options || []).map((option) => ({ answer: option.value }));
  } else if (spec.type === 'checkbox_list') {
    const values = (spec.options || []).map((option) => option.value).slice(0, 14);
    candidates = combinations(values).map((selected) => ({ selected }));
  } else if (spec.type === 'table_choice') {
    const rows = spec.rows || [];
    const columns = spec.columns || [];
    candidates = [{}];
    for (const row of rows) {
      candidates = candidates.flatMap((candidate) => columns.map((column) => ({ ...candidate, [row.key]: column })));
    }
  } else if (spec.type === 'multi') {
    candidates = [{}];
    for (const field of spec.fields || []) {
      const options = (field.options || []).map((option) => option[0]).filter(Boolean);
      candidates = candidates.flatMap((candidate) => options.map((option) => ({ ...candidate, [field.key]: option })));
    }
  } else if (spec.type === 'text' || spec.type === 'textarea') {
    const empty = bestResult(question, { answer: '' });
    candidates = [{ answer: empty?.answerText || '' }];
  }

  let best = { response: {}, result: bestResult(question, {}) || { score: 0, maxScore: Number(question.marks) || 1 } };
  for (const response of candidates) {
    const result = bestResult(question, response);
    if (!result) continue;
    if (result.correct) return { response, result };
    if (Number(result.score) > Number(best.result?.score || 0)) best = { response, result };
  }
  return best;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/li>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function serialiseQuestion(question) {
  return {
    templateId: question.templateId,
    templateLabel: question.templateLabel,
    domain: question.domain,
    skillIds: question.skillIds,
    questionType: question.questionType,
    seed: question.seed,
    itemId: question.itemId,
    marks: question.marks,
    promptText: stripHtml(question.stemHtml),
    inputSpec: question.inputSpec,
    solutionLines: question.solutionLines?.map(stripHtml) || [],
  };
}

function buildFixture(runtime) {
  const templates = runtime.TEMPLATES.map((template, index) => {
    const seed = 10_000 + index * 17;
    const question = template.generator(seed);
    const correct = findBestResponse(question);
    const emptyResult = bestResult(question, {}) || null;
    return {
      id: template.id,
      label: template.label,
      domain: template.domain,
      questionType: template.questionType,
      difficulty: Number(template.difficulty) || 1,
      satsFriendly: Boolean(template.satsFriendly),
      isSelectedResponse: Boolean(template.isSelectedResponse),
      generative: Boolean(template.generative),
      tags: template.tags || [],
      skillIds: template.skillIds || [],
      sample: serialiseQuestion(question),
      correctResponse: correct.response,
      correctResult: correct.result,
      emptyResult,
    };
  });

  return {
    contentReleaseId: CONTENT_RELEASE_ID,
    generatedAt: 'fixture-generated-by-script',
    conceptCount: Object.keys(runtime.SKILLS).length,
    templateCount: templates.length,
    selectedResponseCount: templates.filter((template) => template.isSelectedResponse).length,
    constructedResponseCount: templates.filter((template) => !template.isSelectedResponse).length,
    concepts: Object.entries(runtime.SKILLS).map(([id, skill]) => ({
      id,
      domain: skill.domain,
      name: skill.name,
      punctuationForGrammar: runtime.PUNCTUATION_SKILL_IDS.includes(id),
    })),
    misconceptions: runtime.MISCONCEPTIONS,
    questionTypes: runtime.QUESTION_TYPES,
    punctuationConceptIds: runtime.PUNCTUATION_SKILL_IDS,
    templates,
  };
}

const options = args(process.argv.slice(2));
const sourcePath = options.source || process.env.GRAMMAR_LEGACY_HTML;
if (!sourcePath) {
  usage();
  process.exit(1);
}

const contentOut = path.resolve(options['content-out'] || defaultContentPath);
const fixtureOut = path.resolve(options['fixture-out'] || defaultFixturePath);
const legacyHtml = fs.readFileSync(path.resolve(sourcePath), 'utf8');
const legacyScript = extractScript(legacyHtml);
const contentSource = generatedContentSource(legacyScript);
const runtime = buildRuntime(legacyScript);
const fixture = buildFixture(runtime);

fs.mkdirSync(path.dirname(contentOut), { recursive: true });
fs.mkdirSync(path.dirname(fixtureOut), { recursive: true });
fs.writeFileSync(contentOut, contentSource);
fs.writeFileSync(fixtureOut, `${JSON.stringify(fixture, null, 2)}\n`);

console.log(`Wrote ${path.relative(repoRoot, contentOut)}`);
console.log(`Wrote ${path.relative(repoRoot, fixtureOut)}`);
console.log(`Concepts: ${fixture.conceptCount}`);
console.log(`Templates: ${fixture.templateCount}`);
console.log(`Selected-response: ${fixture.selectedResponseCount}`);
console.log(`Constructed-response: ${fixture.constructedResponseCount}`);
