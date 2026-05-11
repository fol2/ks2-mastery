#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  READING_PASSAGES,
  READING_TEST_PAPERS,
  READING_SKILLS,
  readingContentSummary,
} from '../shared/reading/content.js';
import { checkMatches } from '../worker/src/subjects/reading/engine.js';

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceNormalisedPhrase(value, phrase, replacement) {
  const key = norm(phrase);
  if (!key) return value;
  return value.split(key).join(replacement);
}

function stemShapeKey(stem, passage) {
  let key = norm(stem)
    .replace(/paragraph [0-9]+/g, 'paragraph #')
    .replace(/section [0-9]+/g, 'section #');
  key = replaceNormalisedPhrase(key, passage.title, 'TEXT');
  const fictionName = String(passage.blocks?.[0] || '').match(/^([A-Z][a-z]+) reached\b/)?.[1] || '';
  key = replaceNormalisedPhrase(key, fictionName, 'PERSON');
  const nonFictionTopic = String(passage.title || '').match(/^How (.+) Works$/)?.[1] || '';
  key = replaceNormalisedPhrase(key, `How ${nonFictionTopic} Works`, 'TEXT');
  key = replaceNormalisedPhrase(key, nonFictionTopic, 'TOPIC');
  return key
    .replace(/\b(red tin box|lantern map|seed bank|seed vault|rooftop rain|poem|passage|story|text)\b/g, 'TEXT')
    .replace(/\b(nia|mara|aunt lio|grandad)\b/g, 'PERSON');
}

function addGroup(map, key, value) {
  if (!key) return;
  const rows = map.get(key) || [];
  rows.push(value);
  map.set(key, rows);
}

function sentenceContaining(source, snippet) {
  const snippetKey = norm(snippet);
  return String(source || '')
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => norm(sentence).includes(snippetKey)) || snippet;
}

const failures = [];
const advisories = [];
const questionRows = [];
const passageIds = new Set();
const questionIds = new Set();
const duplicateStemGroups = new Map();
const duplicateModelAnswerGroups = new Map();
const duplicateStemShapeGroups = new Map();
const skillCounts = Object.fromEntries(Object.keys(READING_SKILLS).map((skill) => [skill, 0]));
const typeCounts = {};
const genreCounts = {};

for (const passage of READING_PASSAGES) {
  if (passageIds.has(passage.id)) failures.push({ type: 'duplicate-passage-id', id: passage.id });
  passageIds.add(passage.id);
  genreCounts[passage.genre] = (genreCounts[passage.genre] || 0) + 1;
  const sourceText = (passage.blocks || []).join(' ');
  const passageText = norm(sourceText);
  if (passageText.length < 100) failures.push({ type: 'short-passage', id: passage.id });
  for (const question of passage.questions || []) {
    const rowId = `${passage.id}:${question.id}`;
    questionRows.push({ passage, question, rowId });
    if (questionIds.has(question.id)) failures.push({ type: 'duplicate-question-id', id: question.id });
    questionIds.add(question.id);
    if (!READING_SKILLS[question.skill]) failures.push({ type: 'unknown-skill', rowId, skill: question.skill });
    skillCounts[question.skill] = (skillCounts[question.skill] || 0) + 1;
    typeCounts[question.type] = (typeCounts[question.type] || 0) + 1;
    const stemKey = norm(question.stem).replace(/paragraph [0-9]+/g, 'paragraph #').replace(/section [0-9]+/g, 'section #');
    addGroup(duplicateStemGroups, stemKey, rowId);
    if (question.modelAnswer) addGroup(duplicateModelAnswerGroups, norm(question.modelAnswer), rowId);
    const stemShape = stemShapeKey(question.stem, passage);
    addGroup(duplicateStemShapeGroups, stemShape, rowId);
    if (question.evidenceCheck?.containsAny) {
      for (const snippet of question.evidenceCheck.containsAny) {
        if (!passageText.includes(norm(snippet))) failures.push({ type: 'missing-evidence-snippet', rowId, snippet });
        const sourceSentence = sentenceContaining(sourceText, snippet);
        if (!checkMatches(sourceSentence, { containsAny: [snippet] })) {
          failures.push({ type: 'unmarkable-evidence-snippet', rowId, snippet, sourceSentence });
        }
      }
    }
  }
}

for (const [stem, rows] of duplicateStemGroups.entries()) {
  if (rows.length > 1) failures.push({ type: 'duplicate-normalised-stem', stem, rows });
}
for (const [answer, rows] of duplicateModelAnswerGroups.entries()) {
  if (rows.length > 1) failures.push({ type: 'duplicate-model-answer', answer, rows });
}
for (const [shape, rows] of duplicateStemShapeGroups.entries()) {
  const phase5Rows = rows.filter((row) => row.includes('phase5_'));
  if (phase5Rows.length > 2) advisories.push({ type: 'repeated-stem-shape', shape, rows: phase5Rows });
}

const questionMap = new Map(questionRows.map(({ question }) => [question.id, question]));
for (const paper of READING_TEST_PAPERS) {
  if (paper.timeLimitMin !== 60) failures.push({ type: 'paper-time-limit', paperId: paper.id, timeLimitMin: paper.timeLimitMin });
  if (paper.totalMarks !== 50) failures.push({ type: 'paper-total-contract', paperId: paper.id, totalMarks: paper.totalMarks });
  let marks = 0;
  for (const section of paper.sections || []) {
    const passage = READING_PASSAGES.find((item) => item.id === section.passageId);
    if (!passage) failures.push({ type: 'paper-missing-passage', paperId: paper.id, passageId: section.passageId });
    const passageQuestionIds = new Set((passage?.questions || []).map((question) => question.id));
    for (const qid of section.questionIds || []) {
      const question = questionMap.get(qid);
      if (!question) failures.push({ type: 'paper-missing-question', paperId: paper.id, qid });
      if (passage && !passageQuestionIds.has(qid)) failures.push({ type: 'paper-question-wrong-passage', paperId: paper.id, passageId: section.passageId, qid });
      marks += Number(question?.marks) || 0;
    }
  }
  if (marks !== 50) failures.push({ type: 'paper-mark-total', paperId: paper.id, marks });
}

for (const skill of Object.keys(READING_SKILLS)) {
  if (!skillCounts[skill]) failures.push({ type: 'skill-without-questions', skill });
}

const summary = {
  generatedAt: new Date().toISOString(),
  content: readingContentSummary(),
  skillCounts,
  typeCounts,
  genreCounts,
  duplicateNormalisedStemGroups: [...duplicateStemGroups.values()].filter((rows) => rows.length > 1).length,
  duplicateModelAnswerGroups: [...duplicateModelAnswerGroups.values()].filter((rows) => rows.length > 1).length,
  repeatedStemShapeAdvisories: advisories.filter((entry) => entry.type === 'repeated-stem-shape').length,
  failures,
  advisories,
};

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
if (outArg) {
  const outPath = outArg.slice('--out='.length);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
}
else console.log(JSON.stringify(summary, null, 2));

if (failures.length || advisories.length) process.exitCode = 1;
