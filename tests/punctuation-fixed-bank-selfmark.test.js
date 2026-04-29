/**
 * Fixed-bank self-marking gate
 *
 * Runs every fixed item's model and accepted answers through the production
 * marking function. CI rejects on any marking failure — zero tolerance.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PUNCTUATION_ITEMS } from '../shared/punctuation/content.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const fixedItems = PUNCTUATION_ITEMS.filter((item) => item.source === 'fixed');

// Group items by their first skillId for readable output
const bySkill = new Map();
for (const item of fixedItems) {
  const skill = item.skillIds?.[0] ?? 'unknown';
  if (!bySkill.has(skill)) bySkill.set(skill, []);
  bySkill.get(skill).push(item);
}

function buildAnswer(item, text) {
  if (item.mode === 'choose') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: text };
}

function failureDetail(item, answer, result) {
  return [
    `  id: ${item.id}`,
    `  prompt: ${item.prompt}`,
    `  mode: ${item.mode}`,
    `  model: ${JSON.stringify(item.model)}`,
    `  validator: ${item.validator?.type ?? 'exact'}`,
    `  answer tested: ${JSON.stringify(answer)}`,
    `  result: ${JSON.stringify(result, null, 2)}`,
  ].join('\n');
}

// Sanity: we expect exactly 92 fixed items
test('fixed bank contains 92 items', () => {
  assert.equal(fixedItems.length, 92, `Expected 92 fixed items, got ${fixedItems.length}`);
});

for (const [skill, items] of bySkill) {
  describe(`skill: ${skill}`, () => {
    for (const item of items) {
      test(`${item.id} — model answer marks correct`, () => {
        const answer = buildAnswer(item, item.model);
        const result = markPunctuationAnswer({ item, answer });
        assert.equal(
          result.correct,
          true,
          `Model answer rejected:\n${failureDetail(item, answer, result)}`,
        );
      });

      if (item.mode !== 'choose' && Array.isArray(item.accepted)) {
        for (const alt of item.accepted) {
          test(`${item.id} — accepted "${alt}" marks correct`, () => {
            const answer = buildAnswer(item, alt);
            const result = markPunctuationAnswer({ item, answer });
            assert.equal(
              result.correct,
              true,
              `Accepted answer rejected:\n${failureDetail(item, answer, result)}`,
            );
          });
        }
      }

      if (item.mode === 'choose') {
        test(`${item.id} — exactly one correct option`, () => {
          const correctCount = item.options.reduce((count, _, index) => {
            const result = markPunctuationAnswer({
              item,
              answer: { choiceIndex: index },
            });
            return count + (result.correct ? 1 : 0);
          }, 0);
          assert.equal(
            correctCount,
            1,
            `Expected exactly 1 correct option for ${item.id}, got ${correctCount}`,
          );
        });
      }
    }
  });
}
