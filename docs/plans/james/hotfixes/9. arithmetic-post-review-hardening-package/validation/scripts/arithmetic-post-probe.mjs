import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = process.env.ARITHMETIC_REPO_ROOT || process.cwd();
const contentModule = await import(pathToFileURL(path.join(repoRoot, 'shared/arithmetic/content.js')).href);
const engineModule = await import(pathToFileURL(path.join(repoRoot, 'worker/src/subjects/arithmetic/engine.js')).href);
const { ARITHMETIC_TEMPLATES, evaluateArithmeticQuestion, generateArithmeticQuestion, parseFractionInput, arithmeticPublicQuestionId } = contentModule;
const { createServerArithmeticEngine } = engineModule;

const glyph = parseFractionInput('2½');
const glyphResult = evaluateArithmeticQuestion({ expected: { kind: 'fraction', n: 5, d: 2, preferMixed: true }, marks: 1 }, {answer:'2½'});
let nonIntegerOrder = 0;
for (let seed=1; seed<=1000; seed++) {
  const q=generateArithmeticQuestion({templateId:'order_of_operations', difficulty:2, seed});
  if (!Number.isInteger(q.expected.value)) nonIntegerOrder++;
}
const pv = generateArithmeticQuestion({templateId:'place_value_partition', difficulty:2, seed:96433});
function publicQuestionId(session, index=session?.currentIndex||0){ const question=session?.mode==='test'?session?.paper?.[index]?.question:session?.currentQuestion; return arithmeticPublicQuestionId({sessionId:session?.id||'', question, index}); }
const engine = createServerArithmeticEngine({now:()=>1700000000000});
const start=engine.apply({learnerId:'blank', subjectRecord:{ui:{},data:{}}, command:'start-session', payload:{mode:'smart', goal:'10q'}, requestId:'blank-start'});
const blank=engine.apply({learnerId:'blank', subjectRecord:{ui:start.state,data:start.data}, command:'submit-answer', payload:{expectedSessionId:start.state.session.id, expectedQuestionId:publicQuestionId(start.state.session), response:{answer:'   '}}, requestId:'blank-submit'});
const workingOnly=engine.apply({learnerId:'blank', subjectRecord:{ui:blank.state,data:blank.data}, command:'submit-answer', payload:{expectedSessionId:blank.state.session.id, expectedQuestionId:publicQuestionId(blank.state.session), response:{answer:'', working:'rough notes only'}}, requestId:'blank-working-only'});
const tstart=engine.apply({learnerId:'testblank', subjectRecord:{ui:{},data:{}}, command:'start-session', payload:{mode:'test', testForm:'short'}, requestId:'tb-start'});
const finish=engine.apply({learnerId:'testblank', subjectRecord:{ui:tstart.state,data:tstart.data}, command:'finish-test', payload:{expectedSessionId:tstart.state.session.id, expectedQuestionId:publicQuestionId(tstart.state.session), index:tstart.state.session.currentIndex, response:{answer:'', working:'rough notes only'}, working:'rough notes only'}, requestId:'tb-finish'});
console.log(JSON.stringify({
  templateCount: ARITHMETIC_TEMPLATES.length,
  glyphValue: glyph.value,
  glyphCorrect: glyphResult.correct,
  nonIntegerOrder,
  placeValueStem: pv.stem,
  placeValueExpected: pv.expected.value,
  practiceBlank: { changed: blank.changed, answered: blank.state.session.answered, attempts: blank.data.recentAttempts.length, events: blank.events.length, error: blank.state.error },
  practiceWorkingOnly: { changed: workingOnly.changed, answered: workingOnly.state.session.answered, attempts: workingOnly.data.recentAttempts.length, events: workingOnly.events.length, error: workingOnly.state.error },
  testBlank: { answered: finish.state.summary.answered, attempts: finish.data.recentAttempts.length, retries: finish.data.retryQueue.length, wrongs: Object.values(finish.data.skills).reduce((s,n)=>s+(n.wrong||0),0), eventTypes: finish.events.map(e=>e.type) }
}, null, 2));
