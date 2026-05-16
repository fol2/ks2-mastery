#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { READING_PASSAGES, readingContentSummary } from '../shared/reading/content.js';
import { checkMatches, createServerReadingEngine, evaluateReadingQuestion } from '../worker/src/subjects/reading/engine.js';
import { buildReadingReadModel } from '../worker/src/subjects/reading/read-models.js';

const failures = [];
const questionRows = [];
const typeCounts = {};
const SOURCE_AFFIRMED_NEGATION_CUES = new Set([
  'not',
  'never',
  'cannot',
  'cant',
  'wont',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'doesnt',
  'dont',
  'didnt',
  'hasnt',
  'havent',
  'hadnt',
  'wouldnt',
  'shouldnt',
  'couldnt',
]);

for (const passage of READING_PASSAGES) {
  for (const question of passage.questions || []) {
    const rowId = `${passage.id}:${question.id}`;
    questionRows.push({ passage, question, rowId });
    typeCounts[question.type] = (typeCounts[question.type] || 0) + 1;
  }
}

function validResponseFor(question) {
  if (question.type === 'mcq') return { answer: String(question.correct) };
  if (question.type === 'short') return { answer: question.modelAnswer || '' };
  if (question.type === 'evidenceShort') {
    return {
      answer: question.modelAnswer || '',
      evidence: question.evidenceCheck?.containsAny?.[0] || '',
    };
  }
  if (question.type === 'open') return { answer: question.modelAnswer || '' };
  if (question.type === 'multiSelect') return { answer: (question.correctSet || []).slice() };
  if (question.type === 'match') return { map: { ...(question.correctMap || {}) } };
  if (question.type === 'order') {
    return {
      order: Object.fromEntries((question.correctPositions || []).map((position, index) => [index, position])),
    };
  }
  return {};
}

function firstNormalisedToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/'/g, '')
    .trim()
    .split(/\s+/)[0] || '';
}

function keywordGroupPhrase(group) {
  return (group || [])
    .flatMap((stem) => String(stem || '').toLowerCase().trim().split(/\s+/))
    .filter(Boolean)
    .join(' ');
}

function sourceAffirmedNegationCandidates(check) {
  const candidates = [
    ...(check?.exactAny || []),
    ...(check?.containsAny || []),
    ...(check?.keywordAny || []).map(keywordGroupPhrase),
  ].filter(Boolean);
  return candidates.filter((candidate) => SOURCE_AFFIRMED_NEGATION_CUES.has(firstNormalisedToken(candidate)));
}

function safeEvaluate(question, response) {
  try {
    return { result: evaluateReadingQuestion(question, response), threw: false };
  } catch (error) {
    return {
      result: null,
      threw: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const canonicalAcceptance = {
  checked: 0,
  failures: [],
};

for (const { question, rowId } of questionRows) {
  const response = validResponseFor(question);
  const { result, threw, error } = safeEvaluate(question, response);
  canonicalAcceptance.checked += 1;
  if (threw || !result || result.score < Number(question.marks || 0)) {
    canonicalAcceptance.failures.push({
      rowId,
      qType: question.type,
      score: result?.score ?? null,
      maxScore: question.marks,
      error: error || '',
    });
  }
}
if (canonicalAcceptance.failures.length) {
  failures.push({
    type: 'canonical-answer-unmarkable',
    count: canonicalAcceptance.failures.length,
    samples: canonicalAcceptance.failures.slice(0, 20),
  });
}

const negatedModelAnswerProbe = {
  checked: 0,
  suspiciousFullMarks: 0,
  sampleRowIds: [],
};

for (const { question, rowId } of questionRows) {
  if (!['short', 'evidenceShort', 'open'].includes(question.type) || !question.modelAnswer) continue;
  const response = validResponseFor(question);
  response.answer = `not ${question.modelAnswer}`;
  const { result, threw, error } = safeEvaluate(question, response);
  negatedModelAnswerProbe.checked += 1;
  if (threw) {
    failures.push({ type: 'negated-model-answer-threw', rowId, error });
    continue;
  }
  if (result?.score >= Number(question.marks || 0)) {
    negatedModelAnswerProbe.suspiciousFullMarks += 1;
    if (negatedModelAnswerProbe.sampleRowIds.length < 20) negatedModelAnswerProbe.sampleRowIds.push(rowId);
  }
}
if (negatedModelAnswerProbe.suspiciousFullMarks) {
  failures.push({
    type: 'negated-model-answer-full-marks',
    count: negatedModelAnswerProbe.suspiciousFullMarks,
    samples: negatedModelAnswerProbe.sampleRowIds,
  });
}

const evidenceContradictionProbe = {
  checked: 0,
  suspiciousFullMarks: 0,
  sampleRowIds: [],
};

for (const { question, rowId } of questionRows) {
  if (question.type !== 'evidenceShort' || !question.evidenceCheck?.containsAny?.[0]) continue;
  const response = validResponseFor(question);
  response.evidence = `not ${question.evidenceCheck.containsAny[0]}`;
  const { result, threw, error } = safeEvaluate(question, response);
  evidenceContradictionProbe.checked += 1;
  if (threw) {
    failures.push({ type: 'negated-evidence-threw', rowId, error });
    continue;
  }
  if (result?.score >= Number(question.marks || 0)) {
    evidenceContradictionProbe.suspiciousFullMarks += 1;
    if (evidenceContradictionProbe.sampleRowIds.length < 20) evidenceContradictionProbe.sampleRowIds.push(rowId);
  }
}
if (evidenceContradictionProbe.suspiciousFullMarks) {
  failures.push({
    type: 'negated-evidence-full-marks',
    count: evidenceContradictionProbe.suspiciousFullMarks,
    samples: evidenceContradictionProbe.sampleRowIds,
  });
}

function malformedPayloadsFor(question) {
  const invalidScalar = { unexpected: 'shape' };
  if (question.type === 'mcq') return [{ answer: invalidScalar }, { answer: 'not-a-choice' }, { answer: null }];
  if (question.type === 'short') return [{ answer: invalidScalar }, { answer: [] }, { answer: null }];
  if (question.type === 'evidenceShort') return [{ answer: invalidScalar, evidence: invalidScalar }, { answer: [], evidence: [] }, { answer: null, evidence: null }];
  if (question.type === 'open') return [{ answer: invalidScalar }, { answer: [], evidence: invalidScalar }, { answer: null }];
  if (question.type === 'multiSelect') return [{ answer: '0' }, { answer: invalidScalar }, { answer: { 0: '0' } }];
  if (question.type === 'match') return [{ map: '0' }, { map: null }, { map: [] }];
  if (question.type === 'order') return [{ order: '1' }, { order: null }, { order: [] }];
  return [{ answer: invalidScalar }];
}

const malformedPayloadProbe = {
  checked: 0,
  throws: 0,
  acceptedFullMarks: 0,
  sampleRowIds: [],
};

const firstQuestionByType = new Map();
for (const row of questionRows) {
  if (!firstQuestionByType.has(row.question.type)) firstQuestionByType.set(row.question.type, row);
}

for (const { question, rowId } of firstQuestionByType.values()) {
  for (const payload of malformedPayloadsFor(question)) {
    const { result, threw, error } = safeEvaluate(question, payload);
    malformedPayloadProbe.checked += 1;
    if (threw) {
      malformedPayloadProbe.throws += 1;
      malformedPayloadProbe.sampleRowIds.push(`${rowId}: ${error}`);
      continue;
    }
    if (result?.score >= Number(question.marks || 0)) {
      malformedPayloadProbe.acceptedFullMarks += 1;
      malformedPayloadProbe.sampleRowIds.push(rowId);
    }
  }
}
if (malformedPayloadProbe.throws || malformedPayloadProbe.acceptedFullMarks) {
  failures.push({
    type: 'malformed-payload-not-rejected-cleanly',
    throws: malformedPayloadProbe.throws,
    acceptedFullMarks: malformedPayloadProbe.acceptedFullMarks,
    samples: malformedPayloadProbe.sampleRowIds.slice(0, 20),
  });
}

const sourceAffirmedNegationProbe = {
  checked: 0,
  passed: false,
  rowId: 'seed_vault_guardians:svg_q10',
  candidateFailures: [],
};
for (const { question, rowId } of questionRows) {
  for (const [field, check] of [['answerCheck', question.answerCheck], ['evidenceCheck', question.evidenceCheck]]) {
    for (const candidate of sourceAffirmedNegationCandidates(check)) {
      sourceAffirmedNegationProbe.checked += 1;
      if (!checkMatches(candidate, check)) {
        sourceAffirmedNegationProbe.candidateFailures.push({ rowId, field, candidate });
      }
    }
  }
}
const seedVault = READING_PASSAGES.find((passage) => passage.id === 'seed_vault_guardians');
const sourceNegativeQuestion = seedVault?.questions?.find((question) => question.id === 'svg_q10');
if (sourceNegativeQuestion) {
  sourceAffirmedNegationProbe.checked += 1;
  const { result, threw, error } = safeEvaluate(sourceNegativeQuestion, {
    answer: 'It is not dead; it is living and can grow for future harvests.',
    evidence: 'A seed bank is not a museum of dead things.',
  });
  if (threw || result?.score < Number(sourceNegativeQuestion.marks || 0)) {
    failures.push({
      type: 'source-affirmed-negation-rejected',
      rowId: sourceAffirmedNegationProbe.rowId,
      score: result?.score ?? null,
      maxScore: sourceNegativeQuestion.marks,
      error: error || '',
    });
  }
} else {
  failures.push({ type: 'source-affirmed-negation-fixture-missing', rowId: sourceAffirmedNegationProbe.rowId });
}
sourceAffirmedNegationProbe.passed = sourceAffirmedNegationProbe.candidateFailures.length === 0
  && !failures.some((failure) => failure.type === 'source-affirmed-negation-rejected' || failure.type === 'source-affirmed-negation-fixture-missing');
if (sourceAffirmedNegationProbe.candidateFailures.length) {
  failures.push({
    type: 'source-affirmed-negation-candidate-rejected',
    count: sourceAffirmedNegationProbe.candidateFailures.length,
    samples: sourceAffirmedNegationProbe.candidateFailures.slice(0, 20),
  });
}

function hasAnswerLeak(value, path = '') {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['modelAnswer', 'explanation', 'hint', 'reread', 'matched']) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null && value[key] !== '') {
      if (Array.isArray(value[key]) && value[key].length === 0) continue;
      return `${path}.${key}`;
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'content' || key === 'stats' || key === 'analytics' || key === 'prefs') continue;
    const leak = hasAnswerLeak(child, path ? `${path}.${key}` : key);
    if (leak) return leak;
  }
  return null;
}

const readModelLeakProbe = {
  checked: 0,
  leaks: [],
};
const leakScenarios = [
  { name: 'immediate-guided-one', payload: { mode: 'guided', viewMode: 'one' } },
  { name: 'list-guided', payload: { mode: 'guided', viewMode: 'list' } },
  { name: 'delayed-stretch', payload: { mode: 'stretch', viewMode: 'one' } },
  { name: 'delayed-test-one', payload: { mode: 'test', viewMode: 'one', paperId: 'paper_i' } },
  { name: 'delayed-test-list', payload: { mode: 'test', viewMode: 'list', paperId: 'paper_i' } },
];

for (const scenario of leakScenarios) {
  const engine = createServerReadingEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'audit-learner',
    command: 'start-session',
    payload: scenario.payload,
    requestId: `audit-${scenario.name}-start`,
  });
  const readModel = buildReadingReadModel({
    learnerId: 'audit-learner',
    state: started.state,
    data: started.data,
    stats: started.stats,
    analytics: started.analytics,
  });
  readModelLeakProbe.checked += 1;
  const leak = hasAnswerLeak(readModel.session);
  if (leak) readModelLeakProbe.leaks.push({ scenario: scenario.name, leak });
}
if (readModelLeakProbe.leaks.length) {
  failures.push({ type: 'pre-marking-answer-metadata-leak', leaks: readModelLeakProbe.leaks });
}

const summary = {
  generatedAt: new Date().toISOString(),
  content: readingContentSummary(),
  typeCounts,
  canonicalAcceptance: {
    checked: canonicalAcceptance.checked,
    failures: canonicalAcceptance.failures.length,
    sampleFailures: canonicalAcceptance.failures.slice(0, 20),
  },
  negatedModelAnswerProbe,
  evidenceContradictionProbe,
  malformedPayloadProbe,
  sourceAffirmedNegationProbe,
  readModelLeakProbe,
  failures,
};

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
if (outArg) {
  const outPath = outArg.slice('--out='.length);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
} else {
  console.log(JSON.stringify(summary, null, 2));
}

if (failures.length) process.exitCode = 1;
