import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_PASSAGES,
  READING_TEST_PAPERS,
  readingContentSummary,
} from '../shared/reading/content.js';
import {
  READING_PHASE5_PASSAGES,
  READING_PHASE5_TEST_PAPERS,
} from '../shared/reading/phase5-expansion.js';

function sumMarks(passage) {
  return (passage.questions || []).reduce((sum, question) => sum + Number(question.marks || 0), 0);
}

function openingStructureKind(passage) {
  const opening = String(passage.blocks?.[0] || '');
  if (passage.genre === 'fiction') {
    if (/^[A-Z][a-z]+ reached\b/.test(opening)) return 'arrival-before-problem';
    if (/^Everyone at\b/.test(opening)) return 'problem-before-character';
    if (/\. That was the first thing [A-Z][a-z]+ noticed\b/.test(opening)) return 'image-before-problem';
    if (/^[^.]+ should have made\b/.test(opening)) return 'challenge-before-image';
    if (/^At [^,]+, [A-Z][a-z]+ carried\b/.test(opening)) return 'object-before-problem';
    if (/^[A-Z][a-z]+ began the day feeling\b/.test(opening)) return 'character-state-before-place';
  }
  if (passage.genre === 'non-fiction') {
    if (/ may look simple at first, but it depends on\b/.test(opening)) return 'overview-dependency';
    if (/ begins with a practical idea:/.test(opening)) return 'main-idea-first';
    if (/^To understand /.test(opening)) return 'evidence-first';
    if (/ is not only a list of facts\./.test(opening)) return 'facts-contrast';
    if (/^The first thing to know about /.test(opening)) return 'first-principle';
    if (/^A careful explanation of /.test(opening)) return 'evidence-pattern';
  }
  if (passage.genre === 'poetry') {
    if (/^At [^,]+,\n/.test(opening)) return 'place-first';
    if (/^[^\n]+\nat [^.]+\./.test(opening)) return 'image-first';
    if (/^[^\n]+\nwhile /.test(opening)) return 'contrast-first';
    if (/^At [^,]+, the first sign is this:/.test(opening)) return 'signpost-first';
    if (/^[^\n]+\.\nAt /.test(opening)) return 'image-sentence-first';
    if (/^The poem begins at /.test(opening)) return 'poem-frame-first';
  }
  return 'unknown';
}

test('Reading Phase 5 adds the second 1000-question wave after Phase 4', () => {
  const summary = readingContentSummary();
  assert.equal(summary.version, 7);
  assert.equal(READING_PHASE5_PASSAGES.length, 102);
  assert.equal(READING_PHASE5_PASSAGES.reduce((sum, passage) => sum + passage.questions.length, 0), 1020);
  assert.equal(READING_PHASE5_TEST_PAPERS.length, 34);
  assert.equal(summary.passageCount, 714);
  assert.equal(summary.questionCount, 7112);
  assert.equal(summary.paperCount, 243);
  assert.equal(summary.genres.fiction, 239);
  assert.equal(summary.genres['non-fiction'], 239);
  assert.equal(summary.genres.poetry, 236);
  assert.equal(summary.longPassageCount, 670);
});

test('Reading Phase 5 papers are strict 50-mark three-text papers', () => {
  const passageMap = new Map(READING_PASSAGES.map((passage) => [passage.id, passage]));
  for (const paper of READING_PHASE5_TEST_PAPERS) {
    assert.equal(paper.timeLimitMin, 60, `${paper.id} time limit`);
    assert.equal(paper.totalMarks, 50, `${paper.id} declared total`);
    assert.equal(paper.sections.length, 3, `${paper.id} section count`);
    const marks = paper.sections.reduce((paperSum, section) => {
      const passage = passageMap.get(section.passageId);
      assert.ok(passage, `${paper.id} missing passage ${section.passageId}`);
      const questionMap = new Map(passage.questions.map((question) => [question.id, question]));
      return paperSum + section.questionIds.reduce((sectionSum, questionId) => {
        const question = questionMap.get(questionId);
        assert.ok(question, `${paper.id} missing question ${questionId}`);
        return sectionSum + Number(question.marks || 0);
      }, 0);
    }, 0);
    assert.equal(marks, 50, `${paper.id} actual marks`);
  }
});

test('Reading Phase 5 passages retain broad question-shape and skill variety', () => {
  for (const passage of READING_PHASE5_PASSAGES) {
    assert.equal(passage.isLong, true, `${passage.id} should support stamina mode`);
    assert.equal(passage.questions.length, 10, `${passage.id} question count`);
    assert.ok(sumMarks(passage) >= 15, `${passage.id} has too few marks`);
    const types = new Set(passage.questions.map((question) => question.type));
    assert.ok(types.has('mcq'), `${passage.id} missing mcq`);
    assert.ok(types.has('evidenceShort'), `${passage.id} missing evidenceShort`);
    assert.ok(types.has('open'), `${passage.id} missing open`);
    assert.ok(types.has('match'), `${passage.id} missing match`);
    const skills = new Set(passage.questions.map((question) => question.skill));
    assert.ok(skills.has('2d'), `${passage.id} missing inference/evidence`);
    assert.ok([...skills].some((skill) => skill.startsWith('P')), `${passage.id} missing punctuation support`);
  }
});

test('Reading Phase 5 passages avoid a single repeated structural scaffold per genre', () => {
  for (const genre of ['fiction', 'non-fiction', 'poetry']) {
    const structures = new Set(
      READING_PHASE5_PASSAGES
        .filter((passage) => passage.genre === genre)
        .map(openingStructureKind),
    );
    assert.ok(!structures.has('unknown'), `${genre} has an unrecognised Phase 5 opening structure`);
    assert.ok(structures.size >= 6, `${genre} should use at least six opening structures`);
  }
});


test('Reading Phase 5 fiction retrieval stems are natural and avoid unresolved state placeholders', () => {
  const unresolved = [];
  for (const passage of READING_PHASE5_PASSAGES.filter((item) => item.genre === 'fiction')) {
    (passage.blocks || []).forEach((block, index) => {
      if (/\b(undefined|null|NaN)\b/.test(String(block || ''))) unresolved.push(`${passage.id}:block:${index}`);
    });
    const firstQuestion = passage.questions[0];
    assert.match(firstQuestion.stem, /^Which pocket object does /, `${passage.id} q1 natural stem`);
    assert.doesNotMatch(firstQuestion.stem, /^Before .* which pocket object/i, `${passage.id} q1 avoids clipped scaffold`);
    for (const question of passage.questions || []) {
      for (const field of ['stem', 'modelAnswer', 'explanation', 'hint']) {
        if (/\b(undefined|null|NaN)\b/.test(String(question[field] || ''))) unresolved.push(`${passage.id}:${question.id}:${field}`);
      }
    }
  }
  assert.deepEqual(unresolved, []);
});
