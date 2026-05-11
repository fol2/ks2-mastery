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

function replaceNormalisedPhrase(value, phrase, replacement) {
  const key = norm(phrase);
  if (!key) return value;
  return value.split(key).join(replacement);
}

function stemShapeKey(stem, passage) {
  let key = norm(stem)
    .replace(/\b(paragraph|section) [0-9]+\b/g, '$1 #')
    .replace(/\b(red tin box|lantern map|seed bank|seed vault|rooftop rain|poem|passage|story|text)\b/g, 'TEXT')
    .replace(/\b(nia|mara|aunt lio|grandad)\b/g, 'PERSON');
  key = replaceNormalisedPhrase(key, passage.title, 'TEXT');
  const fictionName = String(passage.blocks?.[0] || '').match(/^([A-Z][a-z]+) reached\b/)?.[1] || '';
  key = replaceNormalisedPhrase(key, fictionName, 'PERSON');
  const nonFictionTopic = String(passage.title || '').match(/^How (.+) Works$/)?.[1] || '';
  key = replaceNormalisedPhrase(key, `How ${nonFictionTopic} Works`, 'TEXT');
  key = replaceNormalisedPhrase(key, nonFictionTopic, 'TOPIC');
  return key;
}

test('reading content bank has varied original passages, papers and KS2 domains', () => {
  const summary = readingContentSummary();
  assert.equal(summary.releaseId, 'reading-poc-promoted-2026-05-05');
  assert.equal(summary.version, 5);
  assert.equal(summary.passageCount, 210);
  assert.equal(summary.paperCount, 75);
  assert.equal(summary.questionCount, 2072);
  assert.ok(Object.keys(READING_SKILLS).includes('2d'));
  assert.equal(summary.genres.fiction, 71);
  assert.equal(summary.genres['non-fiction'], 71);
  assert.equal(summary.genres.poetry, 68);
  assert.equal(summary.longPassageCount, 166);
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



test('reading question stems avoid noticeable repetition after normalisation', () => {
  const seen = new Map();
  for (const passage of READING_PASSAGES) {
    for (const question of passage.questions || []) {
      const key = norm(question.stem).replace(/paragraph [0-9]+/g, 'paragraph #').replace(/section [0-9]+/g, 'section #');
      const rows = seen.get(key) || [];
      rows.push(`${passage.id}:${question.id}`);
      seen.set(key, rows);
    }
  }
  const duplicates = [...seen.entries()].filter(([, rows]) => rows.length > 1);
  assert.deepEqual(duplicates, []);
});

test('reading model answers and stem shapes avoid repeated-question feel', () => {
  const answerGroups = new Map();
  const stemShapeGroups = new Map();
  for (const passage of READING_PASSAGES) {
    for (const question of passage.questions || []) {
      if (question.modelAnswer) {
        const answerKey = norm(question.modelAnswer);
        const answers = answerGroups.get(answerKey) || [];
        answers.push(`${passage.id}:${question.id}`);
        answerGroups.set(answerKey, answers);
      }
      const stemShape = stemShapeKey(question.stem, passage);
      const stems = stemShapeGroups.get(stemShape) || [];
      stems.push(`${passage.id}:${question.id}`);
      stemShapeGroups.set(stemShape, stems);
    }
  }
  const duplicateAnswers = [...answerGroups.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateStemShapes = [...stemShapeGroups.entries()]
    .map(([shape, rows]) => [shape, rows.filter((row) => row.includes('phase5_'))])
    .filter(([, rows]) => rows.length > 2);
  assert.deepEqual(duplicateAnswers, []);
  assert.deepEqual(duplicateStemShapes, []);
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
