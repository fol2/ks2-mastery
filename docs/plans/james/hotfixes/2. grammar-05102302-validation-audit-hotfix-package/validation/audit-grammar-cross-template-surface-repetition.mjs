import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.argv[2] || process.cwd();
const seedCount = Number(process.argv[3] || 30);
const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);
const contentUrl = pathToFileURL(path.join(repoRoot, 'worker/src/subjects/grammar/content.js')).href;
const {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} = await import(contentUrl);

function normalise(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function surfaceKey(serialised) {
  return `${serialised?.inputSpec?.type || ''}\t${normalise(serialised?.promptText || serialised?.stemHtml || '')}`;
}

const seen = new Map();
const crossTemplateDuplicates = [];
for (const template of GRAMMAR_TEMPLATE_METADATA) {
  for (const seed of seeds) {
    const question = createGrammarQuestion({ templateId: template.id, seed });
    if (!question) continue;
    const serialised = serialiseGrammarQuestion(question);
    const key = surfaceKey(serialised);
    const entry = {
      templateId: template.id,
      seed,
      promptText: serialised.promptText,
      inputType: serialised?.inputSpec?.type || '',
    };
    const previousEntries = seen.get(key) || [];
    const previousTemplateIds = new Set(previousEntries.map((item) => item.templateId));
    if (previousEntries.length > 0 && !previousTemplateIds.has(template.id)) {
      crossTemplateDuplicates.push({ key, previous: previousEntries, current: entry });
    }
    previousEntries.push(entry);
    seen.set(key, previousEntries);
  }
}

console.log(JSON.stringify({
  repoRoot,
  summary: {
    templateCount: GRAMMAR_TEMPLATE_METADATA.length,
    seedCount,
    totalCases: GRAMMAR_TEMPLATE_METADATA.length * seedCount,
    crossTemplateDuplicateSurfaceCount: crossTemplateDuplicates.length,
  },
  crossTemplateDuplicates,
}, null, 2));
