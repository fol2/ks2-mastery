import { GRAMMAR_TEMPLATE_METADATA, createGrammarQuestion } from '../../../../../../worker/src/subjects/grammar/content.js';
import { collectVisibleChoices } from '../../../../../../tests/helpers/grammar-visible-choice-collector.js';

const GENERIC = new Set([
 'It only depends on the final punctuation mark.',
 'It is correct because it is the shortest option.',
 'It is correct because it sounds more exciting.',
 'It is correct because the sentence has a capital letter.',
 'It is correct because the sentence mentions a person or thing.',
]);
const byTemplate = {};
const samples = [];
let occurrenceCount = 0;
let itemCount = 0;
for (const template of GRAMMAR_TEMPLATE_METADATA) {
  for (let seed = 1; seed <= 30; seed += 1) {
    const q = createGrammarQuestion({ templateId: template.id, seed });
    const hits = collectVisibleChoices(q?.inputSpec)
      .map((choice) => choice.label)
      .filter((label) => GENERIC.has(label));
    if (hits.length) {
      occurrenceCount += hits.length;
      itemCount += 1;
      byTemplate[template.id] = (byTemplate[template.id] || 0) + hits.length;
      if (samples.length < 20) samples.push({ templateId: template.id, seed, conceptId: template.skillIds?.[0] || '', questionType: template.questionType, hits });
    }
  }
}
console.log(JSON.stringify({ occurrenceCount, itemCount, templateCount: Object.keys(byTemplate).length, byTemplate, samples }, null, 2));
