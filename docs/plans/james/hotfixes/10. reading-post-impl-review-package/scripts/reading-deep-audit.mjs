import { READING_PASSAGES, READING_TEST_PAPERS, readingContentSummary } from '../../../../../../shared/reading/content.js';
import { checkMatches, evaluateReadingQuestion } from '../../../../../../worker/src/subjects/reading/engine.js';

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const failures=[];
const warnings=[];
const unresolvedPattern=/\b(undefined|null|NaN)\b/;
const questions=[];
for (const passage of READING_PASSAGES) {
  for (const [i, block] of (passage.blocks||[]).entries()) {
    if (unresolvedPattern.test(String(block||''))) failures.push({type:'unresolved-copy', passageId:passage.id, field:`block.${i}`, text:String(block).slice(0,140)});
  }
  for (const question of passage.questions||[]) {
    questions.push({passage, question});
    for (const field of ['stem','modelAnswer','explanation','hint']) {
      if (unresolvedPattern.test(String(question[field]||''))) failures.push({type:'unresolved-copy', passageId:passage.id, questionId:question.id, field, text:String(question[field]).slice(0,180)});
    }
    if (question.type === 'short' && question.modelAnswer && question.check) {
      if (!checkMatches(question.modelAnswer, question.check)) warnings.push({type:'model-answer-not-accepted-by-short-check', passageId:passage.id, questionId:question.id, modelAnswer:question.modelAnswer});
    }
    if (question.type === 'open' && question.modelAnswer) {
      const result = evaluateReadingQuestion(question, { answer: question.modelAnswer });
      if (result.score < question.marks) warnings.push({type:'open-model-under-rubric', passageId:passage.id, questionId:question.id, score:result.score, maxScore:question.marks, modelAnswer:question.modelAnswer, matched:result.matched});
    }
    if (question.type === 'evidenceShort' && question.modelAnswer && question.evidenceCheck?.containsAny?.[0]) {
      const evidence = question.evidenceCheck.containsAny[0];
      const result = evaluateReadingQuestion(question, { answer: question.modelAnswer, evidence });
      if (result.score < question.marks) warnings.push({type:'model-plus-first-evidence-not-full-score', passageId:passage.id, questionId:question.id, score:result.score, maxScore:question.marks, modelAnswer:question.modelAnswer, evidence});
    }
  }
}
const paperQuestionIds = new Set(READING_TEST_PAPERS.flatMap((paper) => (paper.sections||[]).flatMap((section) => section.questionIds||[])));
const orphanPhase5 = questions.filter(({question}) => question.id.startsWith('phase5_') && !paperQuestionIds.has(question.id)).length;
if (orphanPhase5 > questions.filter(({question}) => question.id.startsWith('phase5_')).length) failures.push({type:'phase5-paper-map-impossible'});
console.log(JSON.stringify({summary: readingContentSummary(), failures, warnings, counts:{failureCount:failures.length, warningCount:warnings.length, questionCount:questions.length, paperQuestionRefs:paperQuestionIds.size}}, null, 2));
