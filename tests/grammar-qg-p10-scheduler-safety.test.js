/**
 * Grammar QG P10 U8 — Scheduler Safety
 *
 * Proves that the P10 certification status map is consistent with the quality
 * register and that blocked templates are excluded from scheduling.
 *
 * R-U4 addendum: proves that engine.js paths (takeDueRetry, nextItem
 * direct-launch, startSimilarProblem) respect the blocklist.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
  grammarTemplateById,
} from '../worker/src/subjects/grammar/content.js';
import {
  isTemplateBlocked,
  CERTIFICATION_STATUS_MAP,
  _testBlockOverride,
} from '../worker/src/subjects/grammar/certification-status.js';
import {
  buildGrammarMiniPack,
} from '../worker/src/subjects/grammar/selection.js';
import {
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-certification-status-map.json');

// ---------------------------------------------------------------------------
// 1. P10 Status Map structural validity
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: status map structure', () => {
  it('P10 certification-status-map.json exists', () => {
    assert.ok(fs.existsSync(STATUS_MAP_PATH), 'P10 status map file must exist');
  });

  const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

  it('has entries for all 78 templates', () => {
    assert.equal(Object.keys(statusMap).length, 78);
  });

  it('every template in GRAMMAR_TEMPLATE_METADATA exists in the P10 map', () => {
    const mapKeys = new Set(Object.keys(statusMap));
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.ok(mapKeys.has(template.id), `Missing template in P10 status map: ${template.id}`);
    }
  });

  it('every entry has a valid status (approved | blocked | watchlist)', () => {
    const validStatuses = new Set(['approved', 'blocked', 'watchlist']);
    for (const [id, entry] of Object.entries(statusMap)) {
      assert.ok(validStatuses.has(entry.status), `Template ${id} has invalid status: ${entry.status}`);
    }
  });

  it('every entry has a non-empty evidence array', () => {
    for (const [id, entry] of Object.entries(statusMap)) {
      assert.ok(Array.isArray(entry.evidence), `Template ${id} evidence is not an array`);
      assert.ok(entry.evidence.length > 0, `Template ${id} has empty evidence array`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Module parity with JSON artefact
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: module vs JSON parity', () => {
  const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

  it('CERTIFICATION_STATUS_MAP matches P10 JSON artefact for every template', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const jsonEntry = statusMap[template.id];
      const moduleEntry = CERTIFICATION_STATUS_MAP[template.id];
      assert.ok(moduleEntry, `Module missing template: ${template.id}`);
      assert.equal(moduleEntry.status, jsonEntry.status, `Status mismatch for ${template.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Blocked template exclusion proof
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: blocked template exclusion', () => {
  const satsFriendlyTemplate = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly);
  const blockedId = satsFriendlyTemplate?.id || GRAMMAR_TEMPLATE_METADATA[0].id;

  it('test-blocked template is excluded from mini-pack scheduling', () => {
    _testBlockOverride.add(blockedId);
    try {
      for (let s = 1; s <= 30; s++) {
        const pack = buildGrammarMiniPack({ seed: s, size: 8 });
        const ids = pack.map((e) => e.templateId);
        assert.ok(!ids.includes(blockedId), `Blocked template ${blockedId} appeared in seed ${s}`);
      }
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('approved templates are NOT blocked by isTemplateBlocked', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.equal(
        isTemplateBlocked(template.id),
        false,
        `Template ${template.id} should not be blocked (all P10 templates are approved)`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Quality register consistency
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: quality register consistency', () => {
  const qualityRegisterPath = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');

  it('quality register exists', () => {
    assert.ok(fs.existsSync(qualityRegisterPath), 'Quality register file must exist');
  });

  it('status map reflects quality register decisions', () => {
    if (!fs.existsSync(qualityRegisterPath)) return;
    const register = JSON.parse(fs.readFileSync(qualityRegisterPath, 'utf8'));
    const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

    for (const entry of register.entries) {
      const mapEntry = statusMap[entry.templateId];
      assert.ok(mapEntry, `Status map missing template from quality register: ${entry.templateId}`);
      if (entry.decision === 'blocked') {
        assert.equal(mapEntry.status, 'blocked', `Template ${entry.templateId} is blocked in register but not in status map`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Characterisation: approved template flows through engine paths unchanged
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: characterisation — approved template engine paths', () => {
  // Pick a single_choice sats-friendly template guaranteed to be approved
  // so we can reliably produce a wrong answer for repair tests.
  const SINGLE_CHOICE_TEMPLATE_ID = 'word_class_underlined_choice';
  const approvedTemplate = GRAMMAR_TEMPLATE_METADATA.find((t) => t.id === SINGLE_CHOICE_TEMPLATE_ID);
  const approvedId = approvedTemplate.id;

  function findWrongAnswer(templateId, seed) {
    const question = createGrammarQuestion({ templateId, seed });
    for (const opt of (question.inputSpec.options || [])) {
      const value = typeof opt === 'string' ? opt : opt.value;
      const result = evaluateGrammarQuestion(question, { answer: value });
      if (result && !result.correct) return value;
    }
    return null;
  }

  it('approved template starts a session via direct-launch', () => {
    const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
    const result = engine.apply({
      learnerId: 'learner-char-1',
      subjectRecord: {},
      command: 'start-session',
      requestId: 'char-direct-launch',
      payload: { mode: 'smart', roundLength: 1, templateId: approvedId, seed: 42 },
    });
    assert.equal(result.state.phase, 'session');
    assert.equal(result.state.session.currentItem.templateId, approvedId);
  });

  it('approved template in retry queue is served via takeDueRetry', () => {
    const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
    // Pre-load the retry queue with the approved template due now.
    const retryQueue = [{ templateId: approvedId, seed: 7, dueAt: 0, conceptIds: [], reason: 'recent-miss' }];
    const result = engine.apply({
      learnerId: 'learner-char-2',
      subjectRecord: { data: { retryQueue } },
      command: 'start-session',
      requestId: 'char-retry-serve',
      payload: { mode: 'smart', roundLength: 1 },
    });
    assert.equal(result.state.phase, 'session');
    // The first item should be the retry entry (same template + seed).
    assert.equal(result.state.session.currentItem.templateId, approvedId);
    assert.equal(result.state.session.currentItem.seed, 7);
  });

  it('approved template starts a similar problem after wrong answer', () => {
    const wrongAnswer = findWrongAnswer(approvedId, 99);
    assert.ok(wrongAnswer, 'Must have a wrong answer option for this template');
    const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
    const start = engine.apply({
      learnerId: 'learner-char-3',
      subjectRecord: {},
      command: 'start-session',
      requestId: 'char-similar-start',
      payload: { mode: 'smart', roundLength: 2, templateId: approvedId, seed: 99 },
    });
    const submit = engine.apply({
      learnerId: 'learner-char-3',
      subjectRecord: { ui: start.state, data: start.data },
      latestSession: start.practiceSession,
      command: 'submit-answer',
      requestId: 'char-similar-submit',
      payload: { response: { answer: wrongAnswer } },
    });
    const similar = engine.apply({
      learnerId: 'learner-char-3',
      subjectRecord: { ui: submit.state, data: submit.data },
      latestSession: submit.practiceSession,
      command: 'start-similar-problem',
      requestId: 'char-similar-next',
      payload: {},
    });
    assert.equal(similar.state.phase, 'session');
    assert.equal(similar.state.session.currentItem.templateId, approvedId);
    assert.equal(similar.changed, true);
  });
});

// ---------------------------------------------------------------------------
// 6. R-U4 engine.js blocklist wiring — blocked template exclusion
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety R-U4: blocked template skipped in retry queue', () => {
  const targetTemplate = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly);
  const blockedId = targetTemplate.id;

  it('blocked template in retry queue is skipped; next eligible item served', () => {
    _testBlockOverride.add(blockedId);
    try {
      const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
      // Retry queue has two entries: a blocked one (due now) and an approved one (due now).
      const approvedId = GRAMMAR_TEMPLATE_METADATA.find((t) => t.id !== blockedId && t.satsFriendly).id;
      const retryQueue = [
        { templateId: blockedId, seed: 10, dueAt: 0, conceptIds: [], reason: 'recent-miss' },
        { templateId: approvedId, seed: 20, dueAt: 0, conceptIds: [], reason: 'recent-miss' },
      ];
      const result = engine.apply({
        learnerId: 'learner-retry-block',
        subjectRecord: { data: { retryQueue } },
        command: 'start-session',
        requestId: 'retry-block-test',
        payload: { mode: 'smart', roundLength: 1 },
      });
      assert.equal(result.state.phase, 'session');
      // The blocked template must NOT be the one served.
      assert.notEqual(result.state.session.currentItem.templateId, blockedId,
        'Blocked template must be skipped in retry queue');
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});

describe('P10 Scheduler Safety R-U4: blocked template direct-launch returns blocked', () => {
  const targetTemplate = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly);
  const blockedId = targetTemplate.id;

  it('blocked template with direct-launch in normal mode throws grammar_template_blocked', () => {
    _testBlockOverride.add(blockedId);
    try {
      const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
      assert.throws(
        () => engine.apply({
          learnerId: 'learner-direct-block',
          subjectRecord: {},
          command: 'start-session',
          requestId: 'direct-block-test',
          payload: { mode: 'smart', roundLength: 1, templateId: blockedId, seed: 5 },
        }),
        (error) => error?.extra?.code === 'grammar_template_blocked',
      );
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('blocked template with debugMode: true is allowed through direct-launch', () => {
    _testBlockOverride.add(blockedId);
    try {
      const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
      const result = engine.apply({
        learnerId: 'learner-direct-debug',
        subjectRecord: {},
        command: 'start-session',
        requestId: 'direct-debug-test',
        payload: { mode: 'smart', roundLength: 1, templateId: blockedId, seed: 5, debugMode: true },
      });
      assert.equal(result.state.phase, 'session');
      assert.equal(result.state.session.currentItem.templateId, blockedId);
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('blocked template with reviewMode: true is allowed through direct-launch', () => {
    _testBlockOverride.add(blockedId);
    try {
      const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
      const result = engine.apply({
        learnerId: 'learner-direct-review',
        subjectRecord: {},
        command: 'start-session',
        requestId: 'direct-review-test',
        payload: { mode: 'smart', roundLength: 1, templateId: blockedId, seed: 5, reviewMode: true },
      });
      assert.equal(result.state.phase, 'session');
      assert.equal(result.state.session.currentItem.templateId, blockedId);
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});

describe('P10 Scheduler Safety R-U4: blocked template returns null from startSimilarProblem', () => {
  // Use a single_choice template so we can reliably produce a wrong answer.
  const SINGLE_CHOICE_TEMPLATE_ID = 'word_class_underlined_choice';
  const blockedId = SINGLE_CHOICE_TEMPLATE_ID;

  function findWrongAnswer(templateId, seed) {
    const question = createGrammarQuestion({ templateId, seed });
    for (const opt of (question.inputSpec.options || [])) {
      const value = typeof opt === 'string' ? opt : opt.value;
      const result = evaluateGrammarQuestion(question, { answer: value });
      if (result && !result.correct) return value;
    }
    return null;
  }

  it('startSimilarProblem with blocked base template returns no-change', () => {
    const wrongAnswer = findWrongAnswer(blockedId, 99);
    assert.ok(wrongAnswer, 'Must have a wrong answer option');
    // First start a session with the template while it is still approved.
    const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
    const start = engine.apply({
      learnerId: 'learner-similar-block',
      subjectRecord: {},
      command: 'start-session',
      requestId: 'similar-block-start',
      payload: { mode: 'smart', roundLength: 2, templateId: blockedId, seed: 99 },
    });
    const submit = engine.apply({
      learnerId: 'learner-similar-block',
      subjectRecord: { ui: start.state, data: start.data },
      latestSession: start.practiceSession,
      command: 'submit-answer',
      requestId: 'similar-block-submit',
      payload: { response: { answer: wrongAnswer } },
    });

    // NOW block the template — simulating a post-session block decision.
    _testBlockOverride.add(blockedId);
    try {
      const similar = engine.apply({
        learnerId: 'learner-similar-block',
        subjectRecord: { ui: submit.state, data: submit.data },
        latestSession: submit.practiceSession,
        command: 'start-similar-problem',
        requestId: 'similar-block-next',
        payload: {},
      });
      // When the base template is blocked, startSimilarProblem returns null,
      // which translates to changed=false (no state mutation, no similar served).
      assert.equal(similar.changed, false);
      // Phase stays at feedback (the submit left it in feedback/awaitingAdvance).
      assert.equal(similar.state.phase, 'feedback');
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});
