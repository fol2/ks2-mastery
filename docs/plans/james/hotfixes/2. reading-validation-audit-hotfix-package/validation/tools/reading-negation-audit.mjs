import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const engine = await import(pathToFileURL(path.join(root, 'worker/src/subjects/reading/engine.js')));
const content = await import(pathToFileURL(path.join(root, 'shared/reading/content.js')));
const { checkMatches, evaluateReadingQuestion } = engine;
const { READING_PASSAGES, READING_TEST_PAPERS, READING_SKILLS } = content;

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

const intrinsicContradictionTokens = new Set([
  'not', 'never', 'no', 'none', 'neither', 'cannot', 'cant', 'wont', 'isnt', 'arent', 'wasnt', 'werent',
  'doesnt', 'dont', 'didnt', 'hasnt', 'havent', 'hadnt', 'wouldnt', 'shouldnt', 'couldnt',
  'opposite', 'false', 'wrong', 'incorrect',
]);

function hasIntrinsicContradictionCue(text) {
  return normalise(text).split(' ').some((token) => intrinsicContradictionTokens.has(token));
}

function questions() {
  return READING_PASSAGES.flatMap((passage) => (passage.questions || []).map((question) => ({ passage, question })));
}

function probeTextsFromCheck(check) {
  if (!check) return [];
  const values = [];
  for (const key of ['exactAny', 'containsAny']) {
    for (const value of check[key] || []) {
      const text = normalise(value);
      if (text) values.push(text);
    }
  }
  for (const group of check.keywordAny || []) {
    const text = normalise((group || []).join(' '));
    if (text) values.push(text);
  }
  return uniq(values).filter((value) => value.length >= 2 && !hasIntrinsicContradictionCue(value));
}

function checksForQuestion(question) {
  const rows = [];
  if (question.check) rows.push({ role: 'check', check: question.check });
  if (question.answerCheck) rows.push({ role: 'answerCheck', check: question.answerCheck });
  if (question.evidenceCheck) rows.push({ role: 'evidenceCheck', check: question.evidenceCheck });
  for (const [index, point] of (question.rubric || []).entries()) {
    if (point?.check) rows.push({ role: `rubric:${index}:${point.label || 'Point'}`, check: point.check });
  }
  return rows;
}

const cues = ['not', 'never', 'no', 'opposite of'];

function negated(text, cue) {
  return `${cue} ${text}`;
}

function baselineResponse(question, check) {
  const text = probeTextsFromCheck(check)[0] || '';
  return text;
}

function auditNegation() {
  const matcherExamples = [];
  let negatedMatcherAcceptances = 0;
  const evaluationExamples = [];
  let negatedEvaluationRisks = 0;

  for (const { passage, question } of questions()) {
    for (const item of checksForQuestion(question)) {
      for (const text of probeTextsFromCheck(item.check)) {
        for (const cue of cues) {
          const probe = negated(text, cue);
          if (checkMatches(probe, item.check)) {
            negatedMatcherAcceptances += 1;
            if (matcherExamples.length < 20) {
              matcherExamples.push({ passageId: passage.id, questionId: question.id, type: question.type, role: item.role, probe });
            }
          }
        }
      }
    }

    if (question.type === 'short' && question.check) {
      const text = baselineResponse(question, question.check);
      for (const cue of cues) {
        const response = { answer: negated(text, cue) };
        const result = evaluateReadingQuestion(question, response);
        if (result.score > 0) {
          negatedEvaluationRisks += 1;
          if (evaluationExamples.length < 20) evaluationExamples.push({ passageId: passage.id, questionId: question.id, type: question.type, role: 'answer', probe: response.answer, score: result.score, maxScore: result.maxScore });
        }
      }
    }

    if (question.type === 'evidenceShort') {
      const answerText = baselineResponse(question, question.answerCheck);
      const evidenceText = baselineResponse(question, question.evidenceCheck);
      const answerMarks = Number(question.answerMarks || 1);
      const evidenceMarks = Number(question.evidenceMarks || 1);
      for (const cue of cues) {
        if (answerText) {
          const response = { answer: negated(answerText, cue), evidence: evidenceText };
          const result = evaluateReadingQuestion(question, response);
          if (result.score > evidenceMarks) {
            negatedEvaluationRisks += 1;
            if (evaluationExamples.length < 20) evaluationExamples.push({ passageId: passage.id, questionId: question.id, type: question.type, role: 'answer', probe: response.answer, score: result.score, maxScore: result.maxScore });
          }
        }
        if (evidenceText) {
          const response = { answer: answerText, evidence: negated(evidenceText, cue) };
          const result = evaluateReadingQuestion(question, response);
          if (result.score > answerMarks) {
            negatedEvaluationRisks += 1;
            if (evaluationExamples.length < 20) evaluationExamples.push({ passageId: passage.id, questionId: question.id, type: question.type, role: 'evidence', probe: response.evidence, score: result.score, maxScore: result.maxScore });
          }
        }
      }
    }

    if (question.type === 'open') {
      for (const item of checksForQuestion(question).filter((row) => row.role.startsWith('rubric:'))) {
        const text = baselineResponse(question, item.check);
        for (const cue of cues) {
          const response = { answer: negated(text, cue) };
          const result = evaluateReadingQuestion(question, response);
          if (result.score > 0) {
            negatedEvaluationRisks += 1;
            if (evaluationExamples.length < 20) evaluationExamples.push({ passageId: passage.id, questionId: question.id, type: question.type, role: item.role, probe: response.answer, score: result.score, maxScore: result.maxScore });
          }
        }
      }
    }
  }

  return { negatedMatcherAcceptances, negatedEvaluationRisks, matcherExamples, evaluationExamples };
}

function contentAudit() {
  const allQuestions = questions();
  const genres = {};
  for (const passage of READING_PASSAGES) genres[passage.genre] = (genres[passage.genre] || 0) + 1;
  const stemGroups = new Map();
  const answerGroups = new Map();
  for (const { passage, question } of allQuestions) {
    const stem = normalise(question.stem);
    if (stem) stemGroups.set(stem, [...(stemGroups.get(stem) || []), `${passage.id}:${question.id}`]);
    const answer = normalise(question.modelAnswer);
    if (answer) answerGroups.set(answer, [...(answerGroups.get(answer) || []), `${passage.id}:${question.id}`]);
  }
  const duplicateStemGroups = [...stemGroups.values()].filter((rows) => rows.length > 1);
  const duplicateAnswerGroups = [...answerGroups.values()].filter((rows) => rows.length > 1);
  return {
    passageCount: READING_PASSAGES.length,
    questionCount: allQuestions.length,
    paperCount: READING_TEST_PAPERS.length,
    skillCount: Object.keys(READING_SKILLS).length,
    genres,
    longPassageCount: READING_PASSAGES.filter((passage) => passage.isLong).length,
    duplicateNormalisedStemGroups: duplicateStemGroups.length,
    duplicateModelAnswerGroups: duplicateAnswerGroups.length,
    duplicateStemExamples: duplicateStemGroups.slice(0, 10),
    duplicateModelAnswerExamples: duplicateAnswerGroups.slice(0, 10),
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  root,
  content: contentAudit(),
  negationAudit: auditNegation(),
};

console.log(JSON.stringify(output, null, 2));
