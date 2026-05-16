import { REASONING_TEMPLATES, generateReasoningQuestion } from '../../../../../../../shared/reasoning/content.js';
import { createServerReasoningEngine } from '../../../../../../../worker/src/subjects/reasoning/engine.js';

const extraTemplateIds = new Set(REASONING_TEMPLATES.filter((template) => template.extraCredit).map((template) => template.id));

function readyData() {
  return {
    events: Array.from({ length: 24 }, (_, index) => ({
      timestamp: new Date(60_000 + index).toISOString(),
      templateId: 'pv_rounding_context',
      itemId: `pv_rounding_context:${index + 1}`,
      skillIds: ['pv_rounding'],
      correct: true,
      supportLevel: 0,
      score: 1,
      maxScore: 1,
    })),
  };
}

function run(subjectRecordData = {}, randomValue = 0.999999) {
  const engine = createServerReasoningEngine({ now: () => 1234567890, random: () => randomValue });
  const result = engine.apply({
    learnerId: 'probe-learner',
    subjectRecord: { data: subjectRecordData },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 12 },
    requestId: `probe-${randomValue}`,
  });
  const refs = result.state.session.questionRefs;
  const questions = refs.map((ref) => generateReasoningQuestion(ref.templateId, ref.seed));
  const themeIds = questions.map((question) => question?.contextThemeId || '').filter(Boolean);
  const extraCreditIds = refs.filter((ref) => extraTemplateIds.has(ref.templateId)).map((ref) => ref.templateId);
  return {
    questionCount: refs.length,
    uniqueTemplates: new Set(refs.map((ref) => ref.templateId)).size,
    themedQuestions: themeIds.length,
    uniqueThemes: new Set(themeIds).size,
    themeIds,
    extraCreditIds,
    templateIds: refs.map((ref) => ref.templateId),
  };
}

console.log(JSON.stringify({ cold: run({}), ready: run(readyData()) }, null, 2));
