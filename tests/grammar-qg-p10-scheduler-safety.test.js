/**
 * Grammar QG P10 U8 — Historical Scheduler Safety
 *
 * Proves that the historical P10 certification status map remains internally
 * consistent, while active runtime scheduling uses the current generated
 * authority.
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
const QUALITY_REGISTER_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');

// ---------------------------------------------------------------------------
// 1. P10 Status Map structural validity
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: status map structure', () => {
  it('P10 certification-status-map.json exists', () => {
    assert.ok(fs.existsSync(STATUS_MAP_PATH), 'P10 status map file must exist');
  });

  // P19 supersedes the original flat 78-template P10 register. The live status
  // map is now a `{ metadata, entries: [...] }` envelope covering 510
  // templates and uses `decision` (approved | blocked | watchlist | ...) plus
  // `severity` per entry. The historical P10 quality register has the same
  // shape, so we read entries from both via a normalised view.
  const statusMapDoc = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
  const qualityRegisterDoc = JSON.parse(fs.readFileSync(QUALITY_REGISTER_PATH, 'utf8'));
  const statusEntries = Array.isArray(statusMapDoc.entries) ? statusMapDoc.entries : [];
  const qualityEntries = Array.isArray(qualityRegisterDoc.entries) ? qualityRegisterDoc.entries : [];
  const statusMapById = new Map(statusEntries.map((entry) => [entry.templateId, entry]));
  const p10TemplateIds = qualityEntries.map((entry) => entry.templateId);

  it('has entries for every live template (P19 covers the whole 510-template inventory)', () => {
    assert.equal(statusEntries.length, 510);
  });

  it('every quality-register template exists in the status map', () => {
    for (const templateId of p10TemplateIds) {
      assert.ok(statusMapById.has(templateId), `Missing template in P10 status map: ${templateId}`);
    }
  });

  it('every entry has a valid decision (approved | blocked | watchlist | approved_with_limitation)', () => {
    const validDecisions = new Set(['approved', 'blocked', 'watchlist', 'approved_with_limitation']);
    for (const entry of statusEntries) {
      assert.ok(
        validDecisions.has(entry.decision),
        `Template ${entry.templateId} has invalid decision: ${entry.decision}`,
      );
    }
  });

  it('every entry has a non-empty evidence array', () => {
    for (const entry of statusEntries) {
      assert.ok(Array.isArray(entry.evidence), `Template ${entry.templateId} evidence is not an array`);
      assert.ok(entry.evidence.length > 0, `Template ${entry.templateId} has empty evidence array`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Module parity with JSON artefact
// ---------------------------------------------------------------------------

describe('P10 Historical Scheduler Safety: active runtime coverage', () => {
  it('active runtime map covers every live template ID', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const moduleEntry = CERTIFICATION_STATUS_MAP[template.id];
      assert.ok(moduleEntry, `Module missing template: ${template.id}`);
    }
  });

  it('active runtime map still covers every status map template ID', () => {
    const statusMapDoc = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
    const entries = Array.isArray(statusMapDoc.entries) ? statusMapDoc.entries : [];
    for (const entry of entries) {
      const moduleEntry = CERTIFICATION_STATUS_MAP[entry.templateId];
      assert.ok(moduleEntry, `Module missing status-map template: ${entry.templateId}`);
    }
  });

  it('historical P10 JSON is not treated as the active production runtime authority', () => {
    // P19 Contract A.2 fairness conversion: 142 manual-expansion families +
    // 5 P0/P2/P3 open-rewrite templates promoted to manualReviewOnly. The
    // runtime status records them as approved_with_limitation. Historical
    // P10 figure of 4 is no longer the live count.
    const limitedRuntimeTemplates = Object.values(CERTIFICATION_STATUS_MAP)
      .filter((entry) => entry.status === 'approved_with_limitation');
    assert.equal(limitedRuntimeTemplates.length, 151);
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
        `Template ${template.id} should not be blocked by the active runtime authority`,
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
    const statusMapDoc = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
    const statusMap = new Map(
      (Array.isArray(statusMapDoc.entries) ? statusMapDoc.entries : []).map((entry) => [entry.templateId, entry]),
    );

    for (const entry of register.entries) {
      const mapEntry = statusMap.get(entry.templateId);
      assert.ok(mapEntry, `Status map missing template from quality register: ${entry.templateId}`);
      if (entry.decision === 'blocked') {
        assert.equal(mapEntry.decision, 'blocked', `Template ${entry.templateId} is blocked in register but not in status map`);
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
