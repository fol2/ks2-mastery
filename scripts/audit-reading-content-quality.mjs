#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  READING_PASSAGES,
  READING_TEST_PAPERS,
  READING_SKILLS,
  readingContentSummary,
} from '../shared/reading/content.js';
import { checkMatches, evaluateReadingQuestion } from '../worker/src/subjects/reading/engine.js';

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

function replaceGeneratedFromSource(value, sourceKey, pattern, replacement) {
  const phrase = sourceKey.match(pattern)?.[1] || '';
  return replaceNormalisedPhrase(value, phrase, replacement);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nonFictionTopicFromTitle(title) {
  const raw = String(title || '');
  return raw.match(/^How (.+) Works$/)?.[1]
    || raw.match(/^(.+) in Practice$/)?.[1]
    || '';
}

function replaceGeneratedCaseLabels(value) {
  return value.replace(/\b[a-z]+ field note [0-9]+\b/g, 'CASE');
}

function stripPhase7PromptScaffold(value) {
  const scaffoldPrefix = /^(?:using the (?:opening|careful|route|evidence|setting|contrast|sequence|language|ending|whole text) (?:detail|clue|signal|trace|pattern|link|shift|moment|thread|focus)|after checking the first relevant clue|with the opening evidence in mind|from the sentence that gives the clearest proof|when following the evidence trail|by using the paragraph that introduces the idea|while tracking the change in the text|looking at the detail that controls the meaning|from the moment where the evidence is tested|after comparing the clue with the outcome|using the wording that narrows the answer|in the paragraph that sets up the idea|at the point where the text explains the effect|where the source gives a reason|where the structure moves the reader on|where a judgement needs direct support|where the text shows rather than hints|where the evidence changes the decision|where the wording makes the answer precise|where the passage links detail and effect|where the source clue needs explanation|before choosing an answer|after reading the proof sentence closely|when the order of ideas is followed|if the reader starts with the stated evidence|when the context of the detail is checked|after the clue has been linked to its effect|if the answer is kept inside the passage evidence|when the text s exact wording is used|after the reader identifies the controlling detail|when the source evidence is stronger than a guess)\s+/;
  const scaffoldSuffix = /\s+(?:if the answer is anchored in the opening evidence|when the source paragraph is checked first|after the strongest text detail is identified|with the relevant line used as proof|once the pattern of events is followed|if the reader keeps the whole passage in view|after the writer s choice has been considered|with both action and result checked|once the contrast in the passage is used|when the final detail is weighed|taking the opening detail as the starting point|using the described moment rather than a guess|keeping the answer tied to the text structure|after the relevant comparison is made|drawing on the phrase that shapes the response|with the evidence trail checked in order|once the line carrying the main point is found|using the detail nearest to the question focus|after the source reason has been matched to the answer|with the judgement proved by a text detail)$/;
  return value.replace(scaffoldPrefix, '').replace(scaffoldSuffix, '');
}

function replacePhase7GeneratedPhrases(value, passage) {
  if (!String(passage.id || '').includes('phase7_')) return value;
  let key = stripPhase7PromptScaffold(value).replace(/\bpoem [0-9]+\b/g, 'TEXT');
  const title = String(passage.title || '');
  const fictionPlace = title.match(/^The (.+)$/)?.[1] || '';
  const poetrySetting = title.match(/^Poem [0-9]+: (.+)$/)?.[1] || '';
  key = replaceNormalisedPhrase(key, fictionPlace, 'PLACE');
  key = replaceNormalisedPhrase(key, poetrySetting, 'PLACE');
  const sourceKey = norm([title, ...(passage.blocks || [])].join(' '));
  key = replaceGeneratedFromSource(key, sourceKey, /because ([a-z0-9 ]+?) the place was not suddenly/, 'THEME');
  key = replaceGeneratedFromSource(key, sourceKey, /([a-z]+ [a-z]+) arrived with a clipboard/, 'PERSON');
  key = replaceGeneratedFromSource(key, sourceKey, /carrying a ([a-z0-9 ]+?) in a jacket pocket/, 'OBJECT');
  key = replaceGeneratedFromSource(key, sourceKey, /noticed ([a-z0-9 ]+?) near the place where the sign should have been/, 'CLUE');
  key = replaceGeneratedFromSource(key, sourceKey, /in a jacket pocket ([a-z0-9 ]+?) and the ordinary corner/, 'IMAGE');
  key = replaceGeneratedFromSource(key, sourceKey, /checked each part of the sequence and ([a-z0-9 ]+?) the place was not suddenly/, 'OUTCOME');
  key = replaceGeneratedFromSource(key, sourceKey, /depends on a ([a-z]+) routine/, 'TERM');
  key = replaceGeneratedFromSource(key, sourceKey, /main purpose of [a-z0-9 -]+ is to ([a-z0-9 ]+?) especially when/, 'BENEFIT');
  key = replaceGeneratedFromSource(key, sourceKey, /same system can ([a-z0-9 ]+?) so the records/, 'RISK');
  const poetrySettingKey = norm(poetrySetting);
  if (poetrySettingKey) {
    const poetryOpening = sourceKey.match(new RegExp(`at ${escapeRegExp(poetrySettingKey)} ([a-z0-9 ]+?) a ([a-z]+ [a-z]+) slips`));
    key = replaceNormalisedPhrase(key, poetryOpening?.[1] || '', 'IMAGE');
    key = replaceNormalisedPhrase(key, poetryOpening?.[2] || '', 'SOUND');
  }
  key = replaceGeneratedFromSource(key, sourceKey, /and the ([a-z]+) (?:listens|waits|leans|trembles|remembers|balances|whispers|shivers|turns|glimmers) in place/, 'OBJECT');
  key = replaceGeneratedFromSource(key, sourceKey, /by evening the place feels ([a-z0-9 ]+?) all this quiet work/, 'EFFECT');
  const labels = sourceKey.match(/\b(?:amber|blue|copper|green|silver|quiet|winter|daily|public|wildlife) (?:ledger|route card|evidence board|survey slate|record window|pattern map|signal sheet|measure strip|notice frame|count grid) [0-9]{3}\b/g) || [];
  for (const label of labels) key = replaceNormalisedPhrase(key, label, 'CASE');
  return key;
}

function stemShapeKey(stem, passage) {
  let key = norm(stem)
    .replace(/paragraph [0-9]+/g, 'paragraph #')
    .replace(/section [0-9]+/g, 'section #');
  key = replaceNormalisedPhrase(key, passage.title, 'TEXT');
  const fictionName = String(passage.blocks?.[0] || '').match(/^([A-Z][a-z]+) reached\b/)?.[1] || '';
  key = replaceNormalisedPhrase(key, fictionName, 'PERSON');
  const nonFictionTopic = nonFictionTopicFromTitle(passage.title);
  key = replaceNormalisedPhrase(key, `How ${nonFictionTopic} Works`, 'TEXT');
  key = replaceNormalisedPhrase(key, `${nonFictionTopic} in Practice`, 'TEXT');
  key = replaceNormalisedPhrase(key, nonFictionTopic, 'TOPIC');
  key = replaceGeneratedCaseLabels(key);
  key = replacePhase7GeneratedPhrases(key, passage);
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

function isRecentExpansionRow(row) {
  return row.includes('phase5_') || row.includes('phase6_') || row.includes('phase7_');
}

const PHASE6_PUNCTUATION_FEATURES = Object.freeze({
  P1: /\bcomma\b|\bopening (?:place|time) phrase\b/i,
  P2: /\bspeech marks\b|\bexact words\b|\bspoken\b|\bwhispered\b/i,
  P3: /\bdashes?\b|\bparentheses\b|\bbrackets\b/i,
  P4: /\bsemicolon\b|\bcolon\b|\blist\b/i,
});

function questionSurface(question) {
  return [
    question.stem,
    question.modelAnswer,
    question.explanation,
    question.hint,
    ...(question.options || []),
  ].join(' ');
}

function phase6PunctuationFeatureMismatch(rowId, question) {
  if (!rowId.includes('phase6_') || !String(question.skill || '').startsWith('P')) return null;
  const surface = questionSurface(question);
  const expectedFeature = PHASE6_PUNCTUATION_FEATURES[question.skill];
  if (!expectedFeature?.test(surface)) {
    return { type: 'phase6-punctuation-skill-feature-mismatch', rowId, skill: question.skill };
  }
  if (question.skill !== 'P4' && /\b(?:colon|semicolon)\b/i.test(surface)) {
    return { type: 'phase6-punctuation-skill-feature-mismatch', rowId, skill: question.skill, detail: 'colon-or-semicolon-content-labelled-as-non-p4' };
  }
  return null;
}

function sentenceContaining(source, snippet) {
  const snippetKey = norm(snippet);
  return String(source || '')
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => norm(sentence).includes(snippetKey)) || snippet;
}

const failures = [];
const advisories = [];
const UNRESOLVED_TEMPLATE_RE = /\b(undefined|null|NaN)\b/;
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
  (passage.blocks || []).forEach((block, index) => {
    if (UNRESOLVED_TEMPLATE_RE.test(String(block || ''))) failures.push({ type: 'unresolved-template-copy', id: passage.id, field: `blocks.${index}` });
  });
  for (const question of passage.questions || []) {
    const rowId = `${passage.id}:${question.id}`;
    questionRows.push({ passage, question, rowId });
    if (questionIds.has(question.id)) failures.push({ type: 'duplicate-question-id', id: question.id });
    questionIds.add(question.id);
    if (!READING_SKILLS[question.skill]) failures.push({ type: 'unknown-skill', rowId, skill: question.skill });
    skillCounts[question.skill] = (skillCounts[question.skill] || 0) + 1;
    typeCounts[question.type] = (typeCounts[question.type] || 0) + 1;
    const punctuationMismatch = phase6PunctuationFeatureMismatch(rowId, question);
    if (punctuationMismatch) failures.push(punctuationMismatch);
    const stemKey = norm(question.stem).replace(/paragraph [0-9]+/g, 'paragraph #').replace(/section [0-9]+/g, 'section #');
    addGroup(duplicateStemGroups, stemKey, rowId);
    if (question.modelAnswer) addGroup(duplicateModelAnswerGroups, norm(question.modelAnswer), rowId);
    const stemShape = stemShapeKey(question.stem, passage);
    addGroup(duplicateStemShapeGroups, stemShape, rowId);
    for (const field of ['stem', 'modelAnswer', 'explanation', 'hint']) {
      if (UNRESOLVED_TEMPLATE_RE.test(String(question[field] || ''))) failures.push({ type: 'unresolved-template-copy', rowId, field });
    }
    if (question.type === 'short' && question.modelAnswer && question.check && !checkMatches(question.modelAnswer, question.check)) {
      failures.push({ type: 'model-answer-unmarkable', rowId, qType: question.type });
    }
    if (question.type === 'evidenceShort' && question.modelAnswer && question.evidenceCheck?.containsAny?.[0]) {
      const result = evaluateReadingQuestion(question, { answer: question.modelAnswer, evidence: question.evidenceCheck.containsAny[0] });
      if (result.score < question.marks) failures.push({ type: 'model-answer-unmarkable', rowId, qType: question.type, score: result.score, maxScore: question.marks });
    }
    if (question.type === 'open' && question.modelAnswer) {
      const result = evaluateReadingQuestion(question, { answer: question.modelAnswer });
      if (result.score < question.marks) failures.push({ type: 'model-answer-under-rubric', rowId, score: result.score, maxScore: question.marks });
    }
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
  const recentExpansionRows = rows.filter(isRecentExpansionRow);
  if (recentExpansionRows.length > 2) advisories.push({ type: 'repeated-stem-shape', shape, rows: recentExpansionRows });
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
