import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_PASSAGES,
  readingContentSummary,
} from '../shared/reading/content.js';
import {
  READING_PHASE6_PASSAGES,
  READING_PHASE6_TEST_PAPERS,
} from '../shared/reading/phase6-expansion.js';

function questionMarks(questionIds, passage) {
  const questionMap = new Map(passage.questions.map((question) => [question.id, question]));
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
  return [
    question.stem,
    question.modelAnswer,
    question.explanation,
    question.hint,
    ...(question.options || []),
  ].join(' ');
}

test('Reading Phase 6 takes Reading beyond four thousand questions without changing answer-safe metadata boundaries', () => {
  const summary = readingContentSummary();
  assert.equal(summary.version, 6);
  assert.equal(summary.passageCount, 414);
  assert.equal(summary.questionCount, 4112);
  assert.equal(summary.paperCount, 143);
  assert.equal(summary.genres.fiction, 139);
  assert.equal(summary.genres['non-fiction'], 139);
  assert.equal(summary.genres.poetry, 136);
  assert.equal(summary.longPassageCount, 370);
  assert.ok(summary.questionCount >= 4000, 'Reading should be moving toward a 10K+ bank in staged waves');
});

test('Reading Phase 6 contributes 204 long passages, 2040 questions and 68 strict papers', () => {
  assert.equal(READING_PHASE6_PASSAGES.length, 204);
  assert.equal(READING_PHASE6_PASSAGES.reduce((sum, passage) => sum + passage.questions.length, 0), 2040);
  assert.equal(READING_PHASE6_TEST_PAPERS.length, 68);
  const genres = READING_PHASE6_PASSAGES.reduce((counts, passage) => {
    counts[passage.genre] = (counts[passage.genre] || 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(genres, { fiction: 68, 'non-fiction': 68, poetry: 68 });
  assert.equal(READING_PHASE6_PASSAGES.filter((passage) => passage.isLong).length, 204);
});

test('Reading Phase 6 papers are 50-mark three-text KS2-style papers', () => {
  const passageMap = new Map(READING_PASSAGES.map((passage) => [passage.id, passage]));
  for (const paper of READING_PHASE6_TEST_PAPERS) {
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

test('Reading Phase 6 passages keep balanced skill and question-type coverage', () => {
  for (const passage of READING_PHASE6_PASSAGES) {
    assert.equal(passage.questions.length, 10, `${passage.id} question count`);
    assert.ok(passage.difficulty >= 4, `${passage.id} difficulty`);
    const types = new Set(passage.questions.map((question) => question.type));
    assert.ok(types.has('mcq'), `${passage.id} missing mcq`);
    assert.ok(types.has('short'), `${passage.id} missing short`);
    assert.ok(types.has('evidenceShort'), `${passage.id} missing evidenceShort`);
    assert.ok(types.has('open'), `${passage.id} missing open`);
    assert.ok(types.has('match'), `${passage.id} missing match`);
    assert.ok(types.has('order'), `${passage.id} missing order`);
    assert.ok(types.has('multiSelect'), `${passage.id} missing multiSelect`);
    const skills = new Set(passage.questions.map((question) => question.skill));
    assert.ok(skills.has('2d'), `${passage.id} missing inference/evidence`);
    assert.ok(skills.has('2f'), `${passage.id} missing structure`);
    assert.ok(skills.has('2g'), `${passage.id} missing language effect`);
    assert.ok(skills.has('2h'), `${passage.id} missing comparison`);
    assert.ok([...skills].some((skill) => skill.startsWith('P')), `${passage.id} missing punctuation support`);
  }
});

test('Reading Phase 6 punctuation support labels match the punctuation feature being tested', () => {
  const featureBySkill = {
    P1: /\bcomma\b|\bopening (?:place|time) phrase\b/i,
    P2: /\bspeech marks\b|\bexact words\b|\bspoken\b|\bwhispered\b/i,
    P3: /\bdashes?\b|\bparentheses\b|\bbrackets\b/i,
    P4: /\bsemicolon\b|\bcolon\b|\blist\b/i,
  };
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const passage of READING_PHASE6_PASSAGES) {
    for (const question of passage.questions) {
      if (!question.skill.startsWith('P')) continue;
      counts[question.skill] += 1;
      const surface = questionSurface(question);
      assert.match(surface, featureBySkill[question.skill], `${question.id} does not test ${question.skill}'s punctuation feature`);
      if (question.skill !== 'P4') {
        assert.doesNotMatch(surface, /\b(?:colon|semicolon)\b/i, `${question.id} labels colon/semicolon content as ${question.skill}`);
      }
    }
  }
  assert.deepEqual(counts, { P1: 51, P2: 51, P3: 51, P4: 51 });
});

test('Reading Phase 6 generated learner-facing copy is resolved and passage-specific', () => {
  const stems = new Set();
  const modelAnswers = new Set();
  for (const passage of READING_PHASE6_PASSAGES) {
    for (const [index, block] of passage.blocks.entries()) {
      assert.equal(hasUnresolvedCopy(block), false, `${passage.id} block ${index} unresolved`);
    }
    for (const question of passage.questions) {
      for (const field of ['stem', 'modelAnswer', 'explanation', 'hint']) {
        assert.equal(hasUnresolvedCopy(question[field]), false, `${question.id} ${field} unresolved`);
      }
      assert.equal(stems.has(question.stem), false, `${question.id} repeated exact stem`);
      stems.add(question.stem);
      assert.equal(modelAnswers.has(question.modelAnswer), false, `${question.id} repeated exact model answer`);
      modelAnswers.add(question.modelAnswer);
    }
  }
});
