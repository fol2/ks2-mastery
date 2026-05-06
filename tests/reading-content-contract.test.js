import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  READING_PASSAGES,
  READING_TEST_PAPERS,
  READING_SKILLS,
  readingContentSummary,
} from '../shared/reading/content.js';
import { readingContentSummary as readingPublicContentSummary } from '../shared/reading/metadata.js';
import { publicEventRowToRecord } from '../worker/src/row-transforms.js';

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

test('reading content bank has varied original passages, papers and KS2 domains', () => {
  const summary = readingContentSummary();
  assert.equal(summary.passageCount, 21);
  assert.equal(summary.paperCount, 12);
  assert.ok(summary.questionCount >= 180);
  assert.ok(Object.keys(READING_SKILLS).includes('2d'));
  assert.ok(summary.genres.fiction >= 8);
  assert.ok(summary.genres['non-fiction'] >= 8);
  assert.ok(summary.genres.poetry >= 5);
  assert.ok(summary.longPassageCount >= 7);
});

test('reading ids are unique and evidence quotes exist in their source passage', () => {
  const passageIds = new Set();
  const questionIds = new Set();
  for (const passage of READING_PASSAGES) {
    assert.ok(!passageIds.has(passage.id), `duplicate passage ${passage.id}`);
    passageIds.add(passage.id);
    const passageText = norm((passage.blocks || []).join(' '));
    assert.ok(passageText.length > 100, `${passage.id} has too little text`);
    for (const question of passage.questions || []) {
      assert.ok(!questionIds.has(question.id), `duplicate question ${question.id}`);
      questionIds.add(question.id);
      assert.ok(READING_SKILLS[question.skill], `${question.id} has unknown skill`);
      if (question.evidenceCheck?.containsAny) {
        for (const snippet of question.evidenceCheck.containsAny) {
          assert.ok(passageText.includes(norm(snippet)), `${question.id} evidence quote is not in passage: ${snippet}`);
        }
      }
    }
  }
});

test('reading test papers only reference existing passages and questions and sum to 50 marks', () => {
  const passageMap = new Map(READING_PASSAGES.map((passage) => [passage.id, passage]));
  for (const paper of READING_TEST_PAPERS) {
    assert.equal(paper.timeLimitMin, 60);
    assert.equal(paper.totalMarks, 50);
    assert.equal(paper.sections.length, 3);
    let paperMarks = 0;
    for (const section of paper.sections) {
      const passage = passageMap.get(section.passageId);
      assert.ok(passage, `${paper.id} missing passage ${section.passageId}`);
      const questionMap = new Map((passage.questions || []).map((question) => [question.id, question]));
      for (const qid of section.questionIds) {
        const question = questionMap.get(qid);
        assert.ok(question, `${paper.id} missing question ${qid}`);
        paperMarks += Number(question.marks) || 0;
      }
    }
    assert.equal(paperMarks, paper.totalMarks, `${paper.id} mark total`);
  }
});

test('browser Reading metadata stays answer-safe and summary-compatible', async () => {
  assert.deepEqual(readingPublicContentSummary(), readingContentSummary());

  const browserMetadata = await readFile('src/subjects/reading/metadata.js', 'utf8');
  assert.match(browserMetadata, /shared\/reading\/metadata\.js/);
  assert.doesNotMatch(browserMetadata, /shared\/reading\/content\.js/);

  const publicMetadata = await readFile('shared/reading/metadata.js', 'utf8');
  assert.doesNotMatch(publicMetadata, /\b(modelAnswer|correct|explanation|rubric|answerCheck|evidenceCheck)\s*:/);
});

test('public Reading events preserve subject identity after redaction', () => {
  const event = publicEventRowToRecord({
    id: 'evt-reading',
    learner_id: 'learner-reading',
    subject_id: 'reading',
    event_type: 'reading.session-completed',
    event_json: JSON.stringify({
      type: 'reading.session-completed',
      learnerId: 'learner-reading',
      subjectId: 'reading',
      createdAt: 1234,
      modelAnswer: 'must not survive',
    }),
    created_at: '2026-05-05T12:00:00.000Z',
  });

  assert.equal(event.subjectId, 'reading');
  assert.equal(event.type, 'reading.session-completed');
  assert.equal(event.learnerId, 'learner-reading');
  assert.equal(Object.hasOwn(event, 'modelAnswer'), false);
});
