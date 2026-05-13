import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_PASSAGES,
  READING_TEST_PAPERS,
  readingContentSummary,
} from '../shared/reading/content.js';
import {
  READING_PHASE7_PASSAGES,
  READING_PHASE7_TEST_PAPERS,
} from '../shared/reading/phase7-expansion.js';

function questionMarks(questionIds, passage) {
  const questionMap = new Map((passage.questions || []).map((question) => [question.id, question]));
  return questionIds.reduce((sum, questionId) => {
    const question = questionMap.get(questionId);
    assert.ok(question, `${passage.id} missing ${questionId}`);
    return sum + Number(question.marks || 0);
  }, 0);
}

function hasUnresolvedCopy(value) {
  return /\b(undefined|null|NaN)\b/.test(String(value || ''));
}

function questionSurface(question) {
  return [question.stem, question.modelAnswer, question.explanation, question.hint, ...(question.options || [])].join(' ');
}

test('Reading Phase 7 moves the staged bank beyond seven thousand questions', () => {
  const summary = readingContentSummary();
  assert.equal(summary.version, 7);
  assert.equal(summary.passageCount, 714);
  assert.equal(summary.questionCount, 7112);
  assert.equal(summary.paperCount, 243);
  assert.equal(summary.genres.fiction, 239);
  assert.equal(summary.genres['non-fiction'], 239);
  assert.equal(summary.genres.poetry, 236);
  assert.equal(summary.longPassageCount, 670);
  assert.ok(summary.questionCount >= 7000, 'Reading should keep moving toward a 10K+ bank in staged, audited waves');
});

test('Reading Phase 7 contributes 300 long passages, 3000 questions and 100 strict papers', () => {
  assert.equal(READING_PHASE7_PASSAGES.length, 300);
  assert.equal(READING_PHASE7_PASSAGES.reduce((sum, passage) => sum + passage.questions.length, 0), 3000);
  assert.equal(READING_PHASE7_TEST_PAPERS.length, 100);
  const genres = READING_PHASE7_PASSAGES.reduce((counts, passage) => {
    counts[passage.genre] = (counts[passage.genre] || 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(genres, { fiction: 100, 'non-fiction': 100, poetry: 100 });
  assert.equal(READING_PHASE7_PASSAGES.filter((passage) => passage.isLong).length, 300);
});

test('Reading Phase 7 answer-bearing content is deeply frozen', () => {
  assert.equal(Object.isFrozen(READING_PHASE7_PASSAGES), true);
  assert.equal(Object.isFrozen(READING_PHASE7_PASSAGES[0]), true);
  assert.equal(Object.isFrozen(READING_PHASE7_PASSAGES[0].questions), true);
  assert.equal(Object.isFrozen(READING_PHASE7_PASSAGES[0].questions[0]), true);
  assert.equal(Object.isFrozen(READING_PHASE7_TEST_PAPERS), true);
  assert.equal(Object.isFrozen(READING_PHASE7_TEST_PAPERS[0].sections), true);
  assert.equal(Object.isFrozen(READING_PHASE7_TEST_PAPERS[0].sections[0]), true);
});

test('Reading Phase 7 papers are 50-mark three-text papers with fiction, non-fiction and poetry', () => {
  const passageMap = new Map(READING_PASSAGES.map((passage) => [passage.id, passage]));
  for (const paper of READING_PHASE7_TEST_PAPERS) {
    assert.equal(paper.timeLimitMin, 60, `${paper.id} time limit`);
    assert.equal(paper.totalMarks, 50, `${paper.id} declared total`);
    assert.equal(paper.sections.length, 3, `${paper.id} section count`);
    const sectionGenres = paper.sections.map((section) => {
      const passage = passageMap.get(section.passageId);
      assert.ok(passage, `${paper.id} missing passage ${section.passageId}`);
      return passage.genre;
    });
    assert.deepEqual(sectionGenres, ['fiction', 'non-fiction', 'poetry'], `${paper.id} genre mix`);
    const marks = paper.sections.reduce((sum, section) => sum + questionMarks(section.questionIds, passageMap.get(section.passageId)), 0);
    assert.equal(marks, 50, `${paper.id} actual marks`);
  }
});

test('Reading Phase 7 passages keep KS2-plus question-type and skill coverage', () => {
  for (const passage of READING_PHASE7_PASSAGES) {
    assert.equal(passage.questions.length, 10, `${passage.id} question count`);
    assert.ok(passage.difficulty >= 4, `${passage.id} difficulty`);
    const types = new Set(passage.questions.map((question) => question.type));
    for (const type of ['mcq', 'short', 'evidenceShort', 'open', 'match', 'order', 'multiSelect']) {
      assert.ok(types.has(type), `${passage.id} missing ${type}`);
    }
    const skills = new Set(passage.questions.map((question) => question.skill));
    for (const skill of ['2b', '2c', '2d', '2e', '2f']) {
      assert.ok(skills.has(skill), `${passage.id} missing ${skill}`);
    }
    assert.ok(skills.has('2g') || skills.has('2h'), `${passage.id} missing language-effect or comparison stretch skill`);
    assert.ok([...skills].some((skill) => skill.startsWith('P')), `${passage.id} missing punctuation-support skill`);
  }
});

test('Reading Phase 7 generated copy is resolved and avoids exact repeated stems or model answers', () => {
  const stems = new Set();
  const answers = new Set();
  for (const passage of READING_PHASE7_PASSAGES) {
    for (const [index, block] of passage.blocks.entries()) {
      assert.equal(hasUnresolvedCopy(block), false, `${passage.id} block ${index} unresolved`);
    }
    for (const question of passage.questions) {
      for (const field of ['stem', 'modelAnswer', 'explanation', 'hint']) {
        assert.equal(hasUnresolvedCopy(question[field]), false, `${question.id} ${field} unresolved`);
      }
      assert.equal(stems.has(question.stem), false, `${question.id} repeated exact stem`);
      stems.add(question.stem);
      assert.equal(answers.has(question.modelAnswer), false, `${question.id} repeated exact model answer`);
      answers.add(question.modelAnswer);
    }
  }
});

test('Reading Phase 7 punctuation labels match the punctuation feature being tested', () => {
  const counts = { P3: 0, P4: 0 };
  for (const passage of READING_PHASE7_PASSAGES) {
    for (const question of passage.questions) {
      if (!question.skill.startsWith('P')) continue;
      counts[question.skill] = (counts[question.skill] || 0) + 1;
      const surface = questionSurface(question);
      if (question.skill === 'P4') assert.match(surface, /colon|semicolon|list punctuation|instruction list/i, `${question.id} P4 feature`);
      if (question.skill === 'P3') assert.match(surface, /dash|dashes|extra phrase|interruption/i, `${question.id} P3 feature`);
    }
  }
  assert.deepEqual(counts, { P3: 100, P4: 200 });
});
