import {
  ARITHMETIC_TEMPLATES,
  evaluateArithmeticQuestion,
  generateArithmeticQuestion,
} from './shared/arithmetic/content.js';

function answerFor(question) {
  return question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);
}

function spacedDigits(answer) {
  const text = String(answer);
  if (!/^[-+]?\d+$/.test(text) || text.length < 2) return null;
  return text.replace(/(?!^)/g, ' ');
}

function placeValueZeroTerms(stem) {
  if (!stem.includes(' = ')) return [];
  return stem.split(' = ')[1].split(' + ').filter((term) => term === '0');
}

const summary = {
  templates: ARITHMETIC_TEMPLATES.length,
  difficulties: 3,
  seedsPerDifficulty: 2000,
  generatedCases: 0,
  correctRejected: 0,
  digitSpacesAccepted: 0,
  zeroExpandedTerms: 0,
  examples: [],
};

function addExample(kind, payload) {
  if (summary.examples.filter((entry) => entry.kind === kind).length >= 5) return;
  summary.examples.push({ kind, ...payload });
}

for (const template of ARITHMETIC_TEMPLATES) {
  for (const difficulty of [0, 1, 2]) {
    for (let seed = 1; seed <= summary.seedsPerDifficulty; seed += 1) {
      summary.generatedCases += 1;
      const question = generateArithmeticQuestion({ templateId: template.id, difficulty, seed });
      const answer = answerFor(question);
      const correct = evaluateArithmeticQuestion(question, { answer });
      if (!correct.correct) {
        summary.correctRejected += 1;
        addExample('correct-rejected', { templateId: template.id, difficulty, seed, answer, feedback: correct.feedbackShort });
      }

      const spaced = spacedDigits(answer);
      if (spaced) {
        const spacedResult = evaluateArithmeticQuestion(question, { answer: spaced });
        if (spacedResult.correct) {
          summary.digitSpacesAccepted += 1;
          addExample('digit-spaces-accepted', { templateId: template.id, difficulty, seed, answer, spacedAnswer: spaced, stem: question.stem });
        }
      }

      if (template.id === 'place_value_partition') {
        const zeroTerms = placeValueZeroTerms(question.stem);
        if (zeroTerms.length) {
          summary.zeroExpandedTerms += 1;
          addExample('zero-expanded-term', { templateId: template.id, difficulty, seed, stem: question.stem });
        }
      }
    }
  }
}

console.log(JSON.stringify(summary, null, 2));
