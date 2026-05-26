import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARITHMETIC_TEMPLATES,
  arithmeticPublicQuestionId,
  evaluateArithmeticQuestion,
  generateArithmeticQuestion,
  parseFractionInput,
} from '../shared/arithmetic/content.js';
import {
  ARITHMETIC_EVENT_TYPES,
  createServerArithmeticEngine,
} from '../worker/src/subjects/arithmetic/engine.js';
import { buildArithmeticReadModel } from '../worker/src/subjects/arithmetic/read-models.js';
import { applyArithmeticCommandResponse } from '../src/subjects/arithmetic/command-actions.js';
import { projectArithmeticRewards } from '../worker/src/projections/rewards.js';
import { MONSTERS, MONSTERS_BY_SUBJECT } from '../src/platform/game/monsters.js';
import { ARITHMETIC_MONSTER_IDS } from '../src/platform/game/mastery/shared.js';
import { arithmeticProvider } from '../worker/src/hero/providers/arithmetic.js';
import { mapToSubjectPayload as mapArithmeticHeroPayload } from '../worker/src/hero/launch-adapters/arithmetic.js';

function publicQuestionId(session, index = session?.currentIndex || 0) {
  const question = session?.mode === 'test' ? session?.paper?.[index]?.question : session?.currentQuestion;
  return arithmeticPublicQuestionId({ sessionId: session?.id || '', question, index });
}

function answerFor(question) {
  return question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);
}

test('arithmetic content generates and marks every template across difficulty bands', () => {
  for (const template of ARITHMETIC_TEMPLATES) {
    for (const difficulty of [0, 1, 2]) {
      const question = generateArithmeticQuestion({ templateId: template.id, difficulty, seed: 1000 + difficulty });
      assert.equal(question.templateId, template.id);
      assert.equal(question.difficulty, difficulty);
      assert.ok(question.stem, `${template.id} has a stem`);
      assert.ok(question.expected, `${template.id} has expected answer data`);
      const correctAnswer = question.expected.kind === 'fraction'
        ? `${question.expected.n}/${question.expected.d}`
        : String(question.expected.value);
      const result = evaluateArithmeticQuestion(question, { answer: correctAnswer });
      assert.equal(result.correct, true, `${template.id} d${difficulty} accepts its generated answer`);
    }
  }
});

test('arithmetic marking keeps the v6 mixed-fraction and Unicode fraction answer forms', () => {
  const parsed = parseFractionInput('2½');
  assert.equal(parsed.value, 2.5);
  assert.equal(parsed.normalN, 5);
  assert.equal(parsed.normalD, 2);

  const question = { marks: 1, expected: { kind: 'fraction', n: 5, d: 2, preferMixed: true } };
  assert.equal(evaluateArithmeticQuestion(question, { answer: '2½' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(question, { answer: '2 1 / 2' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(question, { answer: '2 and 1/2' }).correct, true);
});

test('arithmetic marking rejects stray units except where the question asks for a percentage', () => {
  const numberBond = generateArithmeticQuestion({ templateId: 'bonds_missing', difficulty: 0, seed: 1 });
  const numberAnswer = String(numberBond.expected.value);
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: numberAnswer }).correct, true);
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: `${numberAnswer}%` }).correct, false, 'plain number answers must not accept percent units');
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: `£${numberAnswer}` }).correct, false, 'plain number answers must not accept currency units');
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: `${numberAnswer} r 0` }).correct, false, 'plain number answers must not accept remainder notation');
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: `${numberAnswer} rem 0` }).correct, false, 'plain number answers must not accept rem-zero text');
  assert.equal(evaluateArithmeticQuestion(numberBond, { answer: `${numberAnswer} remainder 0` }).correct, false, 'plain number answers must not accept remainder text');

  const amountQuestion = generateArithmeticQuestion({ templateId: 'percentage_of_amount', difficulty: 1, seed: 3 });
  const amountAnswer = String(amountQuestion.expected.value);
  assert.equal(evaluateArithmeticQuestion(amountQuestion, { answer: amountAnswer }).correct, true);
  assert.equal(evaluateArithmeticQuestion(amountQuestion, { answer: `${amountAnswer}%` }).correct, false, 'percentage-of-amount answers are amounts, not percentages');

  for (const templateId of ['short_division', 'long_division']) {
    const exactDivision = generateArithmeticQuestion({ templateId, difficulty: 1, seed: 42 });
    const quotient = String(exactDivision.expected.value);
    for (const suffix of ['r 0', 'rem 0', 'remainder 0']) {
      assert.equal(evaluateArithmeticQuestion(exactDivision, { answer: `${quotient} ${suffix}` }).correct, true, `${templateId} accepts harmless ${suffix} notation`);
    }
  }

  let percentageOutput = null;
  for (let seed = 1; seed <= 100; seed += 1) {
    const candidate = generateArithmeticQuestion({ templateId: 'fdp_equivalent', difficulty: 1, seed });
    if (candidate.stem.includes('as a percentage')) {
      percentageOutput = candidate;
      break;
    }
  }
  assert.ok(percentageOutput, 'found an FDP percentage-output question');
  const percentAnswer = String(percentageOutput.expected.value);
  assert.equal(evaluateArithmeticQuestion(percentageOutput, { answer: percentAnswer }).correct, true);
  assert.equal(evaluateArithmeticQuestion(percentageOutput, { answer: `${percentAnswer}%` }).correct, true, 'percentage-output questions accept an explicit percent sign');
  assert.equal(evaluateArithmeticQuestion(percentageOutput, { answer: `%${percentAnswer}` }).correct, false, 'percentage-output questions only accept percent as a trailing unit');
  assert.equal(evaluateArithmeticQuestion(percentageOutput, { answer: `${percentAnswer}%%` }).correct, false, 'percentage-output questions reject duplicate percent units');
  if (percentAnswer.length > 1) {
    const malformedPercentAnswer = `${percentAnswer.slice(0, 1)}%${percentAnswer.slice(1)}`;
    assert.equal(evaluateArithmeticQuestion(percentageOutput, { answer: malformedPercentAnswer }).correct, false, 'percentage-output questions reject embedded percent units');
  }
});

test('arithmetic marking rejects malformed mixed numbers and multi-character digit answers', () => {
  const mixedQuestion = { marks: 1, expected: { kind: 'fraction', n: 5, d: 2, preferMixed: true } };
  assert.equal(evaluateArithmeticQuestion(mixedQuestion, { answer: '2 1/2' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(mixedQuestion, { answer: '1 3/2' }).correct, false, 'numeric-equivalent improper mixed notation is not fully correct');

  const zeroWholeMixedQuestion = { marks: 1, expected: { kind: 'fraction', n: 3, d: 2, preferMixed: true } };
  assert.equal(evaluateArithmeticQuestion(zeroWholeMixedQuestion, { answer: '0 3/2' }).correct, false, 'zero-whole improper mixed notation is not a valid mixed number');

  const digitQuestion = generateArithmeticQuestion({ templateId: 'formal_missing_digit', difficulty: 1, seed: 12 });
  const digit = String(digitQuestion.expected.value);
  assert.equal(evaluateArithmeticQuestion(digitQuestion, { answer: digit }).correct, true);
  assert.equal(evaluateArithmeticQuestion(digitQuestion, { answer: `0${digit}` }).correct, false, 'missing digit answers must be exactly one digit');
  assert.equal(evaluateArithmeticQuestion(digitQuestion, { answer: `${digit}.0` }).correct, false, 'missing digit answers must not accept decimal notation');
  assert.equal(evaluateArithmeticQuestion(digitQuestion, { answer: `+${digit}` }).correct, false, 'missing digit answers must not accept signed notation');
});

test('arithmetic marking enforces disciplined comma grouping and fraction sign forms', () => {
  const numberQuestion = { marks: 1, expected: { kind: 'number', value: 1234 } };
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '1234' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '1,234' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '1 234' }).correct, true, 'well-formed space grouping is allowed');
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '12,34' }).correct, false, 'malformed thousands comma grouping must not be accepted');
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '1,23,4' }).correct, false, 'multiple malformed comma groups must not be accepted');
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '12 34' }).correct, false, 'malformed thousands space grouping must not be accepted');
  assert.equal(evaluateArithmeticQuestion(numberQuestion, { answer: '1 2 3 4' }).correct, false, 'digit-spaced answers must not be accepted as a number');

  const divisionQuestion = { marks: 1, expected: { kind: 'number', value: 1234, allowZeroRemainderText: true } };
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '1,234 r 0' }).correct, true, 'well-formed comma grouping can still be used with zero-remainder notation where allowed');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '1,234 rem 0' }).correct, true, 'well-formed comma grouping can be used with zero-remainder rem notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '1,234 remainder 0' }).correct, true, 'well-formed comma grouping can be used with zero-remainder word notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '1 234 r 0' }).correct, true, 'well-formed space grouping can be used with zero-remainder notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '12,34 r 0' }).correct, false, 'malformed comma grouping is rejected even in division zero-remainder notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '12,34 rem 0' }).correct, false, 'malformed comma grouping is rejected in rem notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '12,34 remainder 0' }).correct, false, 'malformed comma grouping is rejected in remainder-word notation');
  assert.equal(evaluateArithmeticQuestion(divisionQuestion, { answer: '12 34 r 0' }).correct, false, 'malformed space grouping is rejected in division zero-remainder notation');

  const fractionQuestion = { marks: 1, expected: { kind: 'fraction', n: 1, d: 2, preferMixed: false } };
  assert.equal(evaluateArithmeticQuestion(fractionQuestion, { answer: '1/2' }).correct, true);
  assert.equal(evaluateArithmeticQuestion(fractionQuestion, { answer: '1/-2' }).correct, false, 'negative denominator notation is not a valid KS2 positive fraction answer');
  assert.equal(evaluateArithmeticQuestion(fractionQuestion, { answer: '-1/-2' }).correct, false, 'double-negative fraction notation is not a valid KS2 positive fraction answer');
  assert.equal(evaluateArithmeticQuestion(fractionQuestion, { answer: '+1/+2' }).correct, false, 'signed denominators are rejected');

  const negativeFractionQuestion = { marks: 1, expected: { kind: 'fraction', n: -1, d: 2, preferMixed: false } };
  assert.equal(evaluateArithmeticQuestion(negativeFractionQuestion, { answer: '-1/2' }).correct, true, 'ordinary signed numerators remain valid for negative fraction answers');
});

test('arithmetic formal written-method visuals keep algorithm rows free from thousands commas', () => {
  const formalTemplates = ['column_addition', 'column_subtraction', 'short_multiplication', 'short_division', 'long_multiplication', 'long_division'];
  for (const templateId of formalTemplates) {
    for (const difficulty of [0, 1, 2]) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const question = generateArithmeticQuestion({ templateId, difficulty, seed });
        assert.equal(/\d,\d/.test(question.visual || ''), false, `${templateId} d${difficulty} seed ${seed} should not put thousands commas inside formal working layout`);
      }
    }
  }
});


test('arithmetic due goal targets due skills and falls back to a bounded smart session when no work is due', () => {
  const now = 1700000000000;
  const makeDueData = () => ({
    prefs: { mode: 'smart', goal: 'due', focusSkillId: '', testForm: 'short' },
    skills: {
      number_bonds: {
        attempts: 1,
        correct: 1,
        wrong: 0,
        strength: 0.62,
        intervalDays: 1,
        dueAt: now - 1000,
        lastSeenAt: new Date(now - 86400000).toISOString(),
        lastWrongAt: null,
        correctStreak: 1,
      },
    },
    templates: {},
    rewardUnits: {},
    misconceptions: {},
    retryQueue: [],
    recentAttempts: [],
    sessions: [],
    streak: { lastPracticeDay: null, days: 0 },
  });

  const engine = createServerArithmeticEngine({ now: () => now });
  const dueStarted = engine.apply({
    learnerId: 'learner-due',
    subjectRecord: { ui: {}, data: makeDueData() },
    command: 'start-session',
    payload: { mode: 'smart', goal: 'due' },
    requestId: 'due-start-targeted',
  });
  assert.equal(dueStarted.state.session.dueStart, 1);
  assert.equal(dueStarted.state.session.currentQuestion.skillIds.includes('number_bonds'), true, 'due goal should open on a currently due skill');

  const wrongDue = engine.apply({
    learnerId: 'learner-due',
    subjectRecord: { ui: dueStarted.state, data: dueStarted.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: dueStarted.state.session.id,
      expectedQuestionId: publicQuestionId(dueStarted.state.session),
      response: { answer: '999999999' },
    },
    requestId: 'due-submit-wrong',
  });
  assert.equal(wrongDue.state.summary, null, 'a wrong due-review answer must not mark due review complete');
  assert.equal(wrongDue.state.session.status, 'active');

  const dueStartedAgain = engine.apply({
    learnerId: 'learner-due-correct',
    subjectRecord: { ui: {}, data: makeDueData() },
    command: 'start-session',
    payload: { mode: 'smart', goal: 'due' },
    requestId: 'due-start-correct',
  });
  const dueCorrect = engine.apply({
    learnerId: 'learner-due-correct',
    subjectRecord: { ui: dueStartedAgain.state, data: dueStartedAgain.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: dueStartedAgain.state.session.id,
      expectedQuestionId: publicQuestionId(dueStartedAgain.state.session),
      response: { answer: answerFor(dueStartedAgain.state.session.currentQuestion) },
    },
    requestId: 'due-submit-correct',
  });
  assert.equal(dueCorrect.state.phase, 'summary', 'a correct answer that clears the only due skill may complete the due review');
  assert.equal(dueCorrect.state.summary.answered, 1);

  let step = engine.apply({
    learnerId: 'learner-empty-due',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: 'due' },
    requestId: 'empty-due-start',
  });
  assert.equal(step.state.session.dueStart, 0);
  for (let index = 0; index < 10 && step.state.phase !== 'summary'; index += 1) {
    const submit = engine.apply({
      learnerId: 'learner-empty-due',
      subjectRecord: { ui: step.state, data: step.data },
      command: 'submit-answer',
      payload: {
        expectedSessionId: step.state.session.id,
        expectedQuestionId: publicQuestionId(step.state.session),
        response: { answer: answerFor(step.state.session.currentQuestion) },
      },
      requestId: `empty-due-submit-${index}`,
    });
    step = submit;
    if (step.state.phase !== 'summary') {
      step = engine.apply({
        learnerId: 'learner-empty-due',
        subjectRecord: { ui: step.state, data: step.data },
        command: 'continue-session',
        payload: {
          expectedSessionId: step.state.session.id,
          expectedQuestionId: publicQuestionId(step.state.session),
        },
        requestId: `empty-due-continue-${index}`,
      });
    }
  }
  assert.equal(step.state.phase, 'summary', 'due goal should not create an endless session when no work is due');
  assert.equal(step.state.summary.answered, 10);
});

test('arithmetic generators avoid malformed place-value items and repeating-decimal order answers', () => {
  const placeValue = generateArithmeticQuestion({ templateId: 'place_value_partition', difficulty: 2, seed: 96433 });
  assert.ok(placeValue.stem.includes('□'), 'place-value item contains a missing-value box');
  assert.ok(Number.isFinite(placeValue.expected.value), 'place-value expected value is finite');

  for (let seed = 1; seed <= 500; seed += 1) {
    for (const difficulty of [0, 1, 2]) {
      const item = generateArithmeticQuestion({ templateId: 'place_value_partition', difficulty, seed });
      const expandedTerms = item.stem.split(' = ')[1].split(' + ');
      assert.equal(expandedTerms.includes('0'), false, `place-value partitioning seed ${seed} d${difficulty} should not display zero-value expanded terms`);
    }
  }

  const orderShapeFamilies = [new Set(), new Set(), new Set()];
  for (let seed = 1; seed <= 500; seed += 1) {
    for (const difficulty of [0, 1, 2]) {
      const item = generateArithmeticQuestion({ templateId: 'order_of_operations', difficulty, seed });
      orderShapeFamilies[difficulty].add(item.stem.replace(/\d+/g, '#'));
    }

    const order = generateArithmeticQuestion({ templateId: 'order_of_operations', difficulty: 2, seed });
    assert.equal(Number.isInteger(order.expected.value), true, `seed ${seed} should produce a whole-number result`);
    assert.ok(order.expected.value >= 0, `seed ${seed} should not produce a negative stretch order-of-operations answer`);
    const testOrder = generateArithmeticQuestion({ templateId: 'order_of_operations', difficulty: 1, seed });
    assert.equal(Number.isInteger(testOrder.expected.value), true, `seed ${seed} should produce a whole-number KS2 test-mode order-of-operations answer`);
    assert.ok(testOrder.expected.value >= 0, `seed ${seed} should not produce a negative KS2 test-mode order-of-operations answer`);
    const power = generateArithmeticQuestion({ templateId: 'powers_of_ten_shift', difficulty: 1, seed });
    assert.equal(String(power.expected.value).includes('000000000'), false, `seed ${seed} should not leak binary floating-point artefacts`);

    for (const templateId of ['fraction_add_sub', 'mixed_number_add_sub', 'fraction_decimal_hybrid']) {
      const fractionQuestion = generateArithmeticQuestion({ templateId, difficulty: seed % 3, seed });
      if (fractionQuestion.stem.includes('−')) {
        assert.notEqual(fractionQuestion.expected.n, 0, `${templateId} seed ${seed} should avoid zero-result subtraction drills`);
      }
    }

    const decimalMissing = generateArithmeticQuestion({ templateId: 'formal_decimal_missing_digit', difficulty: seed % 3, seed });
    const decimalRows = decimalMissing.visual.split('\n').filter((line) => /[0-9□]/.test(line) && !/^─+$/.test(line.trim()));
    assert.equal(decimalRows.every((line) => line.includes('.')), true, `decimal missing-digit seed ${seed} should keep decimal points visible in every row`);
    const decimalColumns = decimalRows.map((line) => line.indexOf('.'));
    assert.equal(new Set(decimalColumns).size, 1, `decimal missing-digit seed ${seed} should align decimal points`);
    const decimalPlaces = decimalRows.map((line) => line.slice(line.indexOf('.') + 1).trimEnd().length);
    assert.equal(new Set(decimalPlaces).size, 1, `decimal missing-digit seed ${seed} should preserve fixed decimal places`);
  }
  assert.ok(orderShapeFamilies.every((shapes) => shapes.size >= 2), 'order-of-operations should expose multiple expression structures in every difficulty band');
});

test('order-of-operations feedback explains same-priority addition and subtraction', () => {
  const question = generateArithmeticQuestion({ templateId: 'order_of_operations', difficulty: 1, seed: 225073 });
  const result = evaluateArithmeticQuestion(question, { answer: '54' });
  const worked = question.solutionLines.join('\n');

  assert.equal(question.stem, '84 − 8 × 2 + 14 =');
  assert.equal(question.expected.value, 82);
  assert.equal(result.correct, false);
  assert.equal(result.answerText, '82');
  assert.match(result.minimalHint, /work left to right/i);
  assert.match(worked, /8 × 2 = 16/);
  assert.match(worked, /84 − 16 \+ 14/);
  assert.match(worked, /84 − 16 = 68/);
  assert.match(worked, /68 \+ 14 = 82/);
});

test('arithmetic practice session keeps question isolated and emits reward unit evidence on clean win', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
    requestId: 'req-start',
  });
  assert.equal(started.state.subjectId, 'arithmetic');
  assert.equal(started.state.session.mode, 'smart');
  assert.equal(started.events[0].type, ARITHMETIC_EVENT_TYPES.SESSION_STARTED);

  const question = started.state.session.currentQuestion;
  const answer = question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);
  const submitted = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session),
      response: { answer },
    },
    requestId: 'req-submit',
  });
  assert.equal(submitted.state.feedback.result.correct, true);
  assert.equal(submitted.state.session.currentQuestion.id, question.id, 'current question stays visible while feedback is displayed');
  assert.ok(submitted.events.some((event) => event.type === ARITHMETIC_EVENT_TYPES.REWARD_UNIT_SECURED));

  const continued = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: submitted.state, data: submitted.data },
    command: 'continue-session',
    payload: {
      expectedSessionId: submitted.state.session.id,
      expectedQuestionId: publicQuestionId(submitted.state.session),
    },
    requestId: 'req-continue',
  });
  assert.notEqual(continued.state.session.currentQuestion.id, question.id, 'continue creates a fresh item');
  assert.equal(continued.state.feedback, null);
});

test('arithmetic test mode delays marking until finish-test', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-test',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'test', testForm: 'short' },
    requestId: 'test-start',
  });
  assert.equal(started.state.phase, 'test');
  assert.equal(started.state.session.paper.length, 12);
  const q = started.state.session.currentQuestion;
  const answer = q.expected.kind === 'fraction' ? `${q.expected.n}/${q.expected.d}` : String(q.expected.value);
  const saved = engine.apply({
    learnerId: 'learner-test',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session, started.state.session.currentIndex),
      index: started.state.session.currentIndex,
      response: { answer },
      advance: true,
    },
    requestId: 'test-save',
  });
  assert.equal(saved.state.feedback, null);
  assert.equal(saved.state.session.paper[0].result, null);

  const finished = engine.apply({
    learnerId: 'learner-test',
    subjectRecord: { ui: saved.state, data: saved.data },
    command: 'finish-test',
    payload: {
      expectedSessionId: saved.state.session.id,
      expectedQuestionId: publicQuestionId(saved.state.session, saved.state.session.currentIndex),
      index: saved.state.session.currentIndex,
      response: {},
    },
    requestId: 'test-finish',
  });
  assert.equal(finished.state.phase, 'summary');
  assert.ok(finished.state.session.paper[0].result);
  assert.ok(finished.events.some((event) => event.type === ARITHMETIC_EVENT_TYPES.SESSION_COMPLETED));
});

test('arithmetic practice blank submissions do not count as attempts or adaptive failures', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-blank-practice',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
    requestId: 'blank-practice-start',
  });

  const blank = engine.apply({
    learnerId: 'learner-blank-practice',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session),
      response: { answer: '   ' },
    },
    requestId: 'blank-practice-submit',
  });

  assert.equal(blank.changed, true, 'UI error state is written so the learner gets a visible prompt');
  assert.match(blank.state.error, /enter an answer/i);
  assert.equal(blank.state.feedback, null);
  assert.equal(blank.state.session.answered, 0);
  assert.equal(blank.data.recentAttempts.length, 0);
  assert.equal(blank.data.retryQueue.length, 0);
  assert.equal(blank.events.length, 0);

  const workingOnly = engine.apply({
    learnerId: 'learner-blank-practice',
    subjectRecord: { ui: blank.state, data: blank.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: blank.state.session.id,
      expectedQuestionId: publicQuestionId(blank.state.session),
      response: { answer: '', working: 'I tried a column method here.' },
    },
    requestId: 'blank-practice-working-only',
  });

  assert.match(workingOnly.state.error, /enter an answer/i);
  assert.equal(workingOnly.state.feedback, null);
  assert.equal(workingOnly.state.session.answered, 0);
  assert.equal(workingOnly.data.recentAttempts.length, 0);
  assert.equal(workingOnly.data.retryQueue.length, 0);
  assert.equal(workingOnly.events.length, 0);
});

test('arithmetic blank True Test questions are scored as blank but do not poison adaptive mastery', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-blank-test',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'test', testForm: 'short' },
    requestId: 'blank-test-start',
  });

  const finished = engine.apply({
    learnerId: 'learner-blank-test',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'finish-test',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session, started.state.session.currentIndex),
      index: started.state.session.currentIndex,
      response: { answer: '', working: 'rough notes only' },
      working: 'rough notes only',
    },
    requestId: 'blank-test-finish',
  });

  assert.equal(finished.state.summary.answered, 0);
  assert.equal(finished.state.summary.questionCount, 12);
  assert.equal(finished.state.summary.score, 0);
  assert.equal(finished.state.summary.maxScore, 14);
  assert.equal(finished.state.session.paper.every((entry) => entry.status === 'blank' && entry.result), true);
  assert.equal(finished.data.recentAttempts.length, 0);
  assert.equal(finished.data.retryQueue.length, 0);
  assert.equal(Object.values(finished.data.skills).reduce((sum, node) => sum + (node.wrong || 0), 0), 0);
  assert.deepEqual(finished.events.map((event) => event.type), [ARITHMETIC_EVENT_TYPES.SESSION_COMPLETED]);
});

test('arithmetic rejects stale session and question submissions without mutating state', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-stale',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
    requestId: 'stale-start',
  });
  const sessionId = started.state.session.id;
  const questionId = publicQuestionId(started.state.session);

  const staleSession = engine.apply({
    learnerId: 'learner-stale',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: 'wrong-session',
      expectedQuestionId: questionId,
      response: { answer: '999' },
    },
    requestId: 'stale-session',
  });
  assert.equal(staleSession.changed, false);
  assert.equal(staleSession.events.length, 0);
  assert.equal(staleSession.state.session.answered, 0);

  const staleQuestion = engine.apply({
    learnerId: 'learner-stale',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: sessionId,
      expectedQuestionId: 'wrong-question',
      response: { answer: '999' },
    },
    requestId: 'stale-question',
  });
  assert.equal(staleQuestion.changed, false);
  assert.equal(staleQuestion.events.length, 0);
  assert.equal(staleQuestion.state.session.answered, 0);
});

test('arithmetic requires fresh session and question ids for active write commands', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
    requestId: 'required-start',
  });
  const question = started.state.session.currentQuestion;
  const answer = question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);

  const missingIds = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: { response: { answer } },
    requestId: 'required-missing-submit',
  });
  assert.equal(missingIds.changed, false);
  assert.equal(missingIds.state.session.answered, 0);

  const submitted = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session),
      response: { answer },
    },
    requestId: 'required-submit',
  });
  assert.equal(submitted.changed, true);

  const staleContinue = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: submitted.state, data: submitted.data },
    command: 'continue-session',
    payload: {
      expectedSessionId: submitted.state.session.id,
      expectedQuestionId: 'wrong-question',
    },
    requestId: 'required-stale-continue',
  });
  assert.equal(staleContinue.changed, false);
  assert.equal(staleContinue.state.session.currentQuestion.id, submitted.state.session.currentQuestion.id);

  const continued = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: submitted.state, data: submitted.data },
    command: 'continue-session',
    payload: {
      expectedSessionId: submitted.state.session.id,
      expectedQuestionId: publicQuestionId(submitted.state.session),
    },
    requestId: 'required-continue',
  });
  assert.equal(continued.changed, true);

  const missingEnd = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: continued.state, data: continued.data },
    command: 'end-session',
    payload: {},
    requestId: 'required-missing-end',
  });
  assert.equal(missingEnd.changed, false);
  assert.equal(missingEnd.state.session.status, 'active');

  const ended = engine.apply({
    learnerId: 'learner-required-ids',
    subjectRecord: { ui: continued.state, data: continued.data },
    command: 'end-session',
    payload: {
      expectedSessionId: continued.state.session.id,
      expectedQuestionId: publicQuestionId(continued.state.session),
    },
    requestId: 'required-end',
  });
  assert.equal(ended.changed, true);
  assert.equal(ended.state.session.status, 'completed');
});

test('arithmetic prefs ignore untrusted payload keys', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-prefs',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q', injected: 'bad', prefs: { leaked: true } },
    requestId: 'prefs-start',
  });
  assert.deepEqual(Object.keys(started.state.prefs).sort(), ['focusSkillId', 'goal', 'mode', 'testForm']);
  assert.equal(started.state.prefs.injected, undefined);
  assert.equal(started.data.prefs.injected, undefined);

  const saved = engine.apply({
    learnerId: 'learner-prefs',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'save-prefs',
    payload: { prefs: { mode: 'test', unknown: 'x', testForm: 'full' } },
    requestId: 'prefs-save',
  });
  assert.deepEqual(Object.keys(saved.state.prefs).sort(), ['focusSkillId', 'goal', 'mode', 'testForm']);
  assert.equal(saved.state.prefs.mode, 'test');
  assert.equal(saved.state.prefs.testForm, 'full');
  assert.equal(saved.state.prefs.unknown, undefined);
});

test('arithmetic duplicate practice submissions cannot mark the same current question twice', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({
    learnerId: 'learner-dup',
    subjectRecord: { ui: {}, data: {} },
    command: 'start-session',
    payload: { mode: 'smart', goal: '10q' },
    requestId: 'dup-start',
  });
  const question = started.state.session.currentQuestion;
  const answer = question.expected.kind === 'fraction' ? `${question.expected.n}/${question.expected.d}` : String(question.expected.value);
  const first = engine.apply({
    learnerId: 'learner-dup',
    subjectRecord: { ui: started.state, data: started.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: started.state.session.id,
      expectedQuestionId: publicQuestionId(started.state.session),
      response: { answer },
    },
    requestId: 'dup-first',
  });
  assert.equal(first.changed, true);
  assert.equal(first.state.session.answered, 1);

  const duplicate = engine.apply({
    learnerId: 'learner-dup',
    subjectRecord: { ui: first.state, data: first.data },
    command: 'submit-answer',
    payload: {
      expectedSessionId: first.state.session.id,
      expectedQuestionId: publicQuestionId(first.state.session),
      response: { answer },
    },
    requestId: 'dup-second',
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.events.length, 0);
  assert.equal(duplicate.state.session.answered, 1);
});

test('arithmetic read model redacts answer data before the browser sees current questions', () => {
  const engine = createServerArithmeticEngine({ now: () => 1700000000000 });
  const started = engine.apply({ learnerId: 'learner-rm', subjectRecord: { ui: {}, data: {} }, command: 'start-session', payload: {}, requestId: 'rm-start' });
  const readModel = buildArithmeticReadModel({ learnerId: 'learner-rm', state: started.state, data: started.data, stats: started.stats, analytics: started.analytics });
  assert.equal(readModel.session.currentQuestion.expected, undefined);
  assert.equal(readModel.session.currentQuestion.answerText, undefined);
  assert.equal(readModel.session.currentQuestion.solutionLines, undefined);
  assert.equal(readModel.session.currentQuestion.templateId, undefined);
  assert.equal(readModel.session.currentQuestion.seed, undefined);
  assert.equal(readModel.session.currentQuestion.difficulty, undefined);
  assert.notEqual(readModel.session.currentQuestion.id, started.state.session.currentQuestion.id);
  assert.match(readModel.session.currentQuestion.id, /^arith_q_/);
  assert.ok(readModel.content.rewardUnitCount >= 70);
});

test('arithmetic reward projection updates the shared monster codex without touching other subjects', () => {
  const event = {
    id: 'event-1',
    type: ARITHMETIC_EVENT_TYPES.REWARD_UNIT_SECURED,
    learnerId: 'learner-reward',
    rewardUnitId: 'bonds_missing:d0',
    contentReleaseId: 'arithmetic-ks2-worker-v1-2026-05-11',
    createdAt: '2026-05-11T00:00:00.000Z',
  };
  const existingCodex = {
    inklet: { caught: true, mastered: ['spelling-unit'] },
    quoral: { caught: true, mastered: ['punctuation-unit'] },
  };
  const projected = projectArithmeticRewards({
    learnerId: 'learner-reward',
    domainEvents: [event],
    gameState: { 'monster-codex': existingCodex },
    random: () => 0,
  });
  assert.deepEqual(
    MONSTERS_BY_SUBJECT.arithmetic.filter((monsterId) => MONSTERS[monsterId]),
    [...ARITHMETIC_MONSTER_IDS],
    'Arithmetic mastery monster ids must exist in the shared monster roster',
  );
  assert.ok(projected.rewardEvents.length >= 1);
  assert.ok(projected.rewardEvents.every((rewardEvent) => rewardEvent.subjectId === 'arithmetic'));
  assert.ok(projected.gameState['monster-codex'].sumkrab || projected.gameState['monster-codex'].arithon);
  assert.deepEqual(projected.gameState['monster-codex'].inklet, existingCodex.inklet);
  assert.deepEqual(projected.gameState['monster-codex'].quoral, existingCodex.quoral);
});

test('arithmetic Hero due-review envelopes launch the due goal', () => {
  const providerResult = arithmeticProvider({
    content: { rewardUnitCount: 90 },
    stats: { overview: { totalQuestions: 12, due: 1, weak: 0, securedSkills: 0, securedRewardUnits: 0, accuracy: 0.8 } },
    analytics: { skills: [{ skillId: 'number_bonds', status: 'due' }] },
  });
  const dueEnvelope = providerResult.envelopes.find((envelope) => envelope.intent === 'due-review');
  assert.ok(dueEnvelope, 'Arithmetic provider should expose a due-review envelope when due work exists');

  const dueLaunch = mapArithmeticHeroPayload(dueEnvelope);
  assert.equal(dueLaunch.launchable, true);
  assert.equal(dueLaunch.subjectId, 'arithmetic');
  assert.equal(dueLaunch.payload.mode, 'smart');
  assert.equal(dueLaunch.payload.goal, 'due');

  const miniTestLaunch = mapArithmeticHeroPayload({ subjectId: 'arithmetic', intent: 'breadth-maintenance', launcher: 'mini-test' });
  assert.equal(miniTestLaunch.payload.mode, 'test');
  assert.equal(miniTestLaunch.payload.goal, '10q');
});


test('arithmetic command response preserves server-side validation errors in subject UI', () => {
  const appState = {
    learners: { selectedId: 'learner-1' },
    subjectUi: { arithmetic: {} },
  };
  const store = {
    getState() {
      return appState;
    },
    updateSubjectUi(subjectId, nextUi) {
      assert.equal(subjectId, 'arithmetic');
      appState.subjectUi.arithmetic = nextUi;
    },
    pushToasts() {},
    pushMonsterCelebrations() {},
    deferMonsterCelebrations() {},
    releaseMonsterCelebrations() {},
  };
  const applyResponse = applyArithmeticCommandResponse({ store });

  applyResponse({
    learnerId: 'learner-1',
    subjectReadModel: {
      version: 1,
      subjectId: 'arithmetic',
      learnerId: 'learner-1',
      phase: 'session',
      prefs: {},
      error: 'Enter an answer before marking.',
      session: null,
      feedback: null,
      summary: null,
    },
    projections: { rewards: { events: [], toastEvents: [] } },
  });

  assert.equal(appState.subjectUi.arithmetic.error, 'Enter an answer before marking.');
  assert.equal(appState.subjectUi.arithmetic.pendingCommand, '');
});
