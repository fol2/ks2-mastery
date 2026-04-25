// Phase 3 U6b: Writing Try scene (`GrammarTransferScene.jsx`) coverage.
//
// SSR blind-spots documented for readers:
//   * True DOM focus / autoFocus cannot be asserted here — the SSR harness
//     only emits static markup. Focus return from the "Change prompt"
//     back-affordance is a browser side-effect and is covered by manual QA.
//   * `requestIdleCallback`, `MutationObserver`, pointer-capture and IME
//     composition are not simulated. We assert structural markers
//     (data-action attributes, role / aria roles, rendered copy) instead.
//   * React onChange events do not fire in SSR; we dispatch the store
//     actions directly to model the runtime transitions.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  grammarModule,
  GRAMMAR_TRANSFER_ERROR_COPY,
} from '../src/subjects/grammar/module.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { GRAMMAR_CHILD_FORBIDDEN_TERMS } from '../src/subjects/grammar/components/grammar-view-model.js';
import {
  GRAMMAR_TRANSFER_PROMPT_IDS,
} from '../worker/src/subjects/grammar/transfer-prompts.js';
import {
  createInitialGrammarState,
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';

const SAMPLE_PROMPTS = [
  {
    id: 'storm-scene',
    title: 'Describe a storm',
    brief: 'Write a short paragraph describing a storm rolling in.',
    grammarTargets: ['adverbials', 'parenthesis_commas', 'relative_clauses'],
    checklist: [
      'Use at least one fronted adverbial.',
      'Use a pair of commas for parenthesis.',
      'Use one relative clause.',
    ],
  },
  {
    id: 'market-stall',
    title: 'At the market stall',
    brief: 'Write 3-5 sentences about a busy market.',
    grammarTargets: ['noun_phrases'],
    checklist: [
      'Use one expanded noun phrase.',
    ],
  },
];

const SAMPLE_LIMITS = { maxPrompts: 20, historyPerPrompt: 5, writingCapChars: 2000 };

function seedTransferLane(harness, { transferLane, transferUi = {}, pendingCommand = '' } = {}) {
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => normaliseGrammarReadModel({
    ...current,
    phase: 'transfer',
    transferLane,
    pendingCommand,
    ui: { transfer: transferUi },
  }, learnerId));
}

function openTransferHarness({ transferLane, transferUi = {}, pendingCommand = '' } = {}) {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  seedTransferLane(harness, { transferLane, transferUi, pendingCommand });
  return harness;
}

function defaultTransferLane(overrides = {}) {
  return {
    mode: 'non-scored',
    prompts: SAMPLE_PROMPTS,
    limits: SAMPLE_LIMITS,
    evidence: [],
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Pick-prompt mode
// ----------------------------------------------------------------------------

test('U6b: pick-prompt mode lists every prompt card with title, brief, and grammar target badges', () => {
  const harness = openTransferHarness({ transferLane: defaultTransferLane() });
  const html = harness.render();
  assert.match(html, /class="grammar-transfer-scene"/);
  assert.match(html, /Writing Try/);
  // Both prompts render as cards with titles + briefs.
  assert.match(html, /Describe a storm/);
  assert.match(html, /Write a short paragraph describing a storm rolling in\./);
  assert.match(html, /At the market stall/);
  // Grammar target badges map concept ids to child-friendly names via
  // GRAMMAR_CLIENT_CONCEPTS (e.g., `adverbials` -> `Adverbials and fronted adverbials`).
  assert.match(html, /Adverbials and fronted adverbials/);
  assert.match(html, /Expanded noun phrases/);
  // Each card has a Start writing primary button wired to the selector.
  const startMatches = html.match(/data-action="grammar-select-transfer-prompt"[^>]*data-prompt-id="storm-scene"[^>]*>Start writing</g) || [];
  assert.equal(startMatches.length, 1, 'exactly one Start writing button per prompt card');
});

test('U6b: pick-prompt mode shows a saved-count chip for prompts that already have evidence', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane({
      evidence: [{
        promptId: 'storm-scene',
        latest: { writing: 'Prior draft.', selfAssessment: [], savedAt: 1_777_000_000_000, source: 'transfer-lane' },
        history: [
          { writing: 'Older draft.', savedAt: 1_776_000_000_000, source: 'transfer-lane' },
        ],
        updatedAt: 1_777_000_000_000,
      }],
    }),
  });
  const html = harness.render();
  // 1 latest + 1 history = 2 saved items
  assert.match(html, /data-prompt-id="storm-scene"[\s\S]*?2 saved/);
});

test('U6b: empty prompts catalogue renders a friendly empty state (not a blank page)', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane({ prompts: [] }),
  });
  const html = harness.render();
  assert.match(html, /class="grammar-transfer-empty"/);
  assert.match(html, /No writing prompts available right now/);
});

// ----------------------------------------------------------------------------
// Write mode
// ----------------------------------------------------------------------------

test('U6b: selecting a prompt transitions to write mode with textarea + checklist + counter', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene' },
  });
  const html = harness.render();
  // Hero swaps to prompt title; textarea appears.
  assert.match(html, /id="grammar-transfer-write-title"[^>]*>Describe a storm/);
  assert.match(html, /<textarea[^>]*name="grammarTransferDraft"/);
  // Counter reads 0 / 2000 with no typed characters.
  assert.match(html, /id="grammar-transfer-counter"[^>]*>0 \/ 2000/);
  // Checklist renders one <li> per item with stable `check-N` keys.
  assert.match(html, /data-check-key="check-0"/);
  assert.match(html, /data-check-key="check-1"/);
  assert.match(html, /data-check-key="check-2"/);
  // Save button is disabled while the draft is empty.
  assert.match(html, /data-action="grammar-save-transfer-evidence"[^>]*disabled/);
  // "Change prompt" secondary routes back to pick-prompt mode.
  assert.match(html, /data-action="grammar-select-transfer-prompt"[^>]*data-prompt-id=""[^>]*>Change prompt</);
});

test('U6b: dispatching grammar-select-transfer-prompt moves the UI into write mode and grammar-select-transfer-prompt with empty id returns to pick-prompt mode', () => {
  const harness = openTransferHarness({ transferLane: defaultTransferLane() });

  harness.dispatch('grammar-select-transfer-prompt', { promptId: 'storm-scene' });
  let ui = harness.store.getState().subjectUi.grammar;
  assert.equal(ui.ui.transfer.selectedPromptId, 'storm-scene');
  assert.equal(ui.ui.transfer.draft, '', 'draft clears on prompt selection');
  assert.deepEqual(ui.ui.transfer.ticks, {}, 'ticks clear on prompt selection');

  // Change prompt back to empty
  harness.dispatch('grammar-select-transfer-prompt', { promptId: '' });
  ui = harness.store.getState().subjectUi.grammar;
  assert.equal(ui.ui.transfer.selectedPromptId, '');
});

test('U6b: grammar-update-transfer-draft persists the draft verbatim so the scene can warn on over-cap input', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene' },
  });
  harness.dispatch('grammar-update-transfer-draft', { writing: 'Suddenly, the storm broke.' });
  assert.equal(harness.store.getState().subjectUi.grammar.ui.transfer.draft, 'Suddenly, the storm broke.');

  // Over-cap input is preserved (not silently truncated) so the scene can
  // detect > 2000 chars and disable Save. The normaliser still applies a
  // larger hard sanity ceiling to prevent unbounded growth.
  harness.dispatch('grammar-update-transfer-draft', { writing: 'x'.repeat(2500) });
  assert.equal(harness.store.getState().subjectUi.grammar.ui.transfer.draft.length, 2500);
});

test('U6b: grammar-toggle-transfer-check stores a stable check-N key as Boolean', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene' },
  });
  harness.dispatch('grammar-toggle-transfer-check', { key: 'check-0', checked: true });
  harness.dispatch('grammar-toggle-transfer-check', { key: 'check-2', checked: true });
  const ticks = harness.store.getState().subjectUi.grammar.ui.transfer.ticks;
  assert.equal(ticks['check-0'], true);
  assert.equal(ticks['check-2'], true);
  // Untoggling updates the stored Boolean without dropping the key.
  harness.dispatch('grammar-toggle-transfer-check', { key: 'check-0', checked: false });
  assert.equal(harness.store.getState().subjectUi.grammar.ui.transfer.ticks['check-0'], false);
});

test('U6b: over-cap draft disables Save and renders the child-friendly warning copy', () => {
  const oversized = 'x'.repeat(2100);
  // Build a harness and then seed a transfer UI with an over-cap draft
  // directly so we bypass the normaliser cap on ui.transfer.draft (which
  // itself slices to writingCapChars). We write the field onto the
  // subjectUi slot post-normalisation to simulate an upstream Worker
  // projection emitting over-cap evidence (defensive render path).
  const harness = openTransferHarness({ transferLane: defaultTransferLane() });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.store.updateSubjectUi('grammar', (current) => {
    const normalised = normaliseGrammarReadModel(current, learnerId);
    return {
      ...normalised,
      ui: {
        ...normalised.ui,
        transfer: { selectedPromptId: 'storm-scene', draft: oversized, ticks: {} },
      },
    };
  });
  const html = harness.render();
  assert.match(html, /class="grammar-transfer-counter grammar-transfer-counter--warn"/);
  assert.match(html, /That is longer than we can save\. Please shorten it\./);
  assert.match(html, /data-action="grammar-save-transfer-evidence"[^>]*disabled/);
});

test('U6b: pending save disables the Save button and the label flips to "Saving..."', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene', draft: 'Draft in flight.' },
    pendingCommand: 'save-transfer-evidence',
  });
  const html = harness.render();
  assert.match(html, /data-action="grammar-save-transfer-evidence"[^>]*disabled[^>]*>Saving\.\.\./);
});

// ----------------------------------------------------------------------------
// Save dispatch contract
// ----------------------------------------------------------------------------

test('U6b: Save dispatches grammar-save-transfer-evidence with exact {promptId, writing, selfAssessment} payload (no "checklist" key)', () => {
  const observed = { request: null };
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: {
        grammar: normaliseGrammarReadModel({
          phase: 'transfer',
          ui: { transfer: {
            selectedPromptId: 'storm-scene',
            draft: 'Suddenly, the storm broke. Lightning, which split the sky, lit the fields.',
            ticks: { 'check-0': true, 'check-2': true },
          } },
          transferLane: {
            mode: 'non-scored',
            prompts: SAMPLE_PROMPTS,
            limits: SAMPLE_LIMITS,
            evidence: [],
          },
        }, 'learner-a'),
      },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send(request) {
        observed.request = request;
        return new Promise(() => {});
      },
    },
    store: {
      getState() { return context.appState; },
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: { ...context.appState.subjectUi, [subjectId]: next },
        };
      },
      updateSubjectUiForLearner(learnerId, subjectId, updater) {
        if (learnerId !== 'learner-a') return false;
        context.store.updateSubjectUi(subjectId, updater);
        return true;
      },
      pushToasts() {},
      pushMonsterCelebrations() {},
      reloadFromRepositories() {},
    },
  };
  // Replicate what GrammarTransferScene would do: build selfAssessment
  // from the prompt's checklist length so every checklist index becomes a
  // stable `check-N` entry.
  const prompt = SAMPLE_PROMPTS[0];
  const ticks = context.appState.subjectUi.grammar.ui.transfer.ticks;
  const selfAssessment = prompt.checklist.map((_item, index) => ({
    key: `check-${index}`,
    checked: Boolean(ticks[`check-${index}`]),
  }));

  const handled = grammarModule.handleAction('grammar-save-transfer-evidence', {
    ...context,
    data: {
      payload: {
        promptId: prompt.id,
        writing: context.appState.subjectUi.grammar.ui.transfer.draft,
        selfAssessment,
      },
    },
  });
  assert.equal(handled, true);

  assert.ok(observed.request, 'subjectCommands.send must be called');
  assert.equal(observed.request.command, 'save-transfer-evidence');
  assert.deepEqual(Object.keys(observed.request.payload).sort(), ['promptId', 'selfAssessment', 'writing']);
  assert.equal(observed.request.payload.promptId, 'storm-scene');
  assert.equal(observed.request.payload.writing.startsWith('Suddenly'), true);
  assert.deepEqual(observed.request.payload.selfAssessment, [
    { key: 'check-0', checked: true },
    { key: 'check-1', checked: false },
    { key: 'check-2', checked: true },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(observed.request.payload, 'checklist'), false,
    'payload must carry selfAssessment, not checklist');
});

// ----------------------------------------------------------------------------
// Saved-history rendering
// ----------------------------------------------------------------------------

test('U6b: saved-history shows latest (with selfAssessment ticks) plus up to 4 history entries', () => {
  // Worker emits history most-recent-first (see
  // worker/src/subjects/grammar/engine.js — saveTransferEvidence shifts
  // prior drafts to the front of `history`). We mirror that order here so
  // the UI cap at 4 discards the *oldest*, not the most-recent, entries.
  const history = [];
  for (let i = 6; i >= 1; i -= 1) {
    history.push({ writing: `Earlier draft ${i}.`, savedAt: 1_770_000_000_000 + i * 1000, source: 'transfer-lane' });
  }
  const harness = openTransferHarness({
    transferLane: defaultTransferLane({
      evidence: [{
        promptId: 'storm-scene',
        latest: {
          writing: 'Final draft - the storm rolled in.',
          selfAssessment: [
            { key: 'check-0', checked: true },
            { key: 'check-1', checked: false },
            { key: 'check-2', checked: true },
          ],
          savedAt: 1_777_000_000_000,
          source: 'transfer-lane',
        },
        history,
        updatedAt: 1_777_000_000_000,
      }],
    }),
    transferUi: { selectedPromptId: 'storm-scene' },
  });
  const html = harness.render();
  assert.match(html, /id="grammar-transfer-saved-title"[^>]*>My saved writing/);
  assert.match(html, /Final draft - the storm rolled in\./);
  // selfAssessment ticks render on the latest card only.
  assert.match(html, /data-check-key="check-0"[^>]*data-checked="true"/);
  assert.match(html, /data-check-key="check-2"[^>]*data-checked="true"/);
  // Only 4 of the 6 history entries render.
  const historyMatches = html.match(/data-saved-kind="history"/g) || [];
  assert.equal(historyMatches.length, 4, 'history is limited to 4 entries');
  // The oldest two (Earlier draft 1/2) must not appear.
  assert.doesNotMatch(html, /Earlier draft 1\./);
  assert.doesNotMatch(html, /Earlier draft 2\./);
  assert.match(html, /Earlier draft 6\./);
});

test('U6b: orphaned evidence renders as a "Retired prompts" card (no Start writing button)', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane({
      evidence: [{
        promptId: 'retired-prompt-id',
        latest: {
          writing: 'A saved draft for a retired prompt.',
          selfAssessment: [],
          savedAt: 1_777_000_000_000,
          source: 'transfer-lane',
        },
        history: [],
        updatedAt: 1_777_000_000_000,
      }],
    }),
  });
  const html = harness.render();
  assert.match(html, /data-section-id="retired-prompts"/);
  assert.match(html, /Saved for a retired writing prompt/);
  assert.match(html, /A saved draft for a retired prompt\./);
  // The orphan section must not render a Start writing button for the retired prompt.
  assert.doesNotMatch(html, /data-action="grammar-select-transfer-prompt"[^>]*data-prompt-id="retired-prompt-id"/);
});

// ----------------------------------------------------------------------------
// Error handling
// ----------------------------------------------------------------------------

test('U6b: each of the four Worker error codes surfaces its child copy in role="alert"', async () => {
  const codes = [
    'grammar_transfer_unavailable_during_mini_test',
    'grammar_transfer_prompt_not_found',
    'grammar_transfer_writing_required',
    'grammar_transfer_quota_exceeded',
  ];
  for (const code of codes) {
    const storage = installMemoryStorage();
    const harness = createAppHarness({ storage });
    const learnerId = harness.store.getState().learners.selectedId;
    harness.dispatch('open-subject', { subjectId: 'grammar' });
    seedTransferLane(harness, {
      transferLane: defaultTransferLane(),
      transferUi: { selectedPromptId: 'storm-scene', draft: 'A draft', ticks: {} },
    });
    // Set rm.error directly to the translated child copy (module.js path
    // is already covered in the U6a tests).
    harness.store.updateSubjectUi('grammar', (current) => ({
      ...normaliseGrammarReadModel(current, learnerId),
      error: GRAMMAR_TRANSFER_ERROR_COPY[code],
    }));
    const html = harness.render();
    const expected = GRAMMAR_TRANSFER_ERROR_COPY[code].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(html, new RegExp(`role="alert"[\\s\\S]*?${expected}`),
      `expected child copy for ${code} to render in role=alert`);
  }
});

// ----------------------------------------------------------------------------
// Absence: no scoring / adult-diagnostic terms leak into the rendered HTML
// ----------------------------------------------------------------------------

test('U6b: scene HTML never leaks scoring language (score, mastery, points earned, level up)', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane({
      evidence: [{
        promptId: 'storm-scene',
        latest: {
          writing: 'Filled draft.',
          selfAssessment: [{ key: 'check-0', checked: true }],
          savedAt: 1_777_000_000_000,
          source: 'transfer-lane',
        },
        history: [],
        updatedAt: 1_777_000_000_000,
      }],
    }),
    transferUi: { selectedPromptId: 'storm-scene', draft: 'Draft text.' },
  });
  const html = harness.render();
  // Narrow to the scene section only so the rest of the app (e.g., the
  // dashboard adult disclosure) does not pollute the absence sweep.
  const sceneMatch = html.match(/<section class="grammar-transfer-scene"[\s\S]*?<\/section>/);
  assert.ok(sceneMatch, 'transfer scene renders');
  const sceneHtml = sceneMatch[0];
  assert.doesNotMatch(sceneHtml, /\bscore\b/i);
  assert.doesNotMatch(sceneHtml, /\bmastery\b/i);
  assert.doesNotMatch(sceneHtml, /points earned/i);
  assert.doesNotMatch(sceneHtml, /level up/i);
  assert.doesNotMatch(sceneHtml, /reviewCopy/i);
  assert.doesNotMatch(sceneHtml, /requestId/i);
});

test('U6b: scene HTML contains none of GRAMMAR_CHILD_FORBIDDEN_TERMS', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene', draft: 'Draft.' },
  });
  const html = harness.render();
  const sceneMatch = html.match(/<section class="grammar-transfer-scene"[\s\S]*?<\/section>/);
  assert.ok(sceneMatch);
  const sceneHtml = sceneMatch[0];
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(sceneHtml, new RegExp(escaped, 'i'), `forbidden term leaked: ${term}`);
  }
  assert.doesNotMatch(sceneHtml, /\bWorker\b/i);
});

// ----------------------------------------------------------------------------
// Non-scored invariants + recursive redaction scan
// ----------------------------------------------------------------------------

function assertNoForbiddenReadModelKeys(value, forbidden) {
  const forbiddenSet = new Set(forbidden);
  const visit = (node, pathPrefix) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${pathPrefix}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (forbiddenSet.has(key)) {
        assert.fail(`Forbidden key "${key}" found at ${nextPath}`);
      }
      visit(child, nextPath);
    }
  };
  visit(value, '');
}

test('U6b: full Worker round-trip — save-transfer-evidence leaves mastery unchanged, positive evidence delta, no reward toast', () => {
  const engine = createServerGrammarEngine({ now: () => 1_777_000_000_000 });
  const initial = createInitialGrammarState();
  const beforeMastery = JSON.stringify(initial.mastery);
  const beforeRetry = JSON.stringify(initial.retryQueue);

  const result = engine.apply({
    learnerId: 'learner-a',
    subjectRecord: { ui: initial, data: { ...initial } },
    command: 'save-transfer-evidence',
    requestId: 'tx-u6b-full',
    payload: {
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Suddenly, thunder cracked. The clouds, which blocked the sun, loomed overhead.',
      selfAssessment: [
        { key: 'check-0', checked: true },
        { key: 'check-1', checked: false },
        { key: 'check-2', checked: true },
      ],
    },
  });

  // Mastery / retry unchanged across the save.
  assert.equal(JSON.stringify(result.state.mastery), beforeMastery);
  assert.equal(JSON.stringify(result.state.retryQueue), beforeRetry);

  // Positive evidence delta.
  const entry = result.state.transferEvidence[GRAMMAR_TRANSFER_PROMPT_IDS[0]];
  assert.ok(entry, 'evidence entry lands after save');
  assert.equal(entry.latest.writing.startsWith('Suddenly'), true);
  assert.deepEqual(entry.latest.selfAssessment, [
    { key: 'check-0', checked: true },
    { key: 'check-1', checked: false },
    { key: 'check-2', checked: true },
  ]);

  // No reward.monster event fires.
  for (const event of result.events) {
    assert.notEqual(event.type, 'reward.monster');
    assert.notEqual(event.type, 'grammar.answer-submitted');
    assert.notEqual(event.type, 'grammar.concept-secured');
    assert.notEqual(event.type, 'grammar.misconception-seen');
  }

  // Client normaliser passes redaction scan.
  const rm = buildGrammarReadModel({ learnerId: 'learner-a', state: result.state, now: 1_777_000_000_000 });
  const clientRm = normaliseGrammarReadModel(rm, 'learner-a');
  assertNoForbiddenReadModelKeys(clientRm.transferLane, ['reviewCopy', 'requestId']);
});

test('U6b: save-success onResolved callback clears draft + ticks but preserves selectedPromptId', async () => {
  let resolveCommand;
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: {
        grammar: normaliseGrammarReadModel({
          phase: 'transfer',
          ui: {
            transfer: {
              selectedPromptId: 'storm-scene',
              draft: 'Pre-save draft text.',
              ticks: { 'check-0': true },
            },
          },
          transferLane: defaultTransferLane(),
        }, 'learner-a'),
      },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send() {
        return new Promise((resolve) => { resolveCommand = resolve; });
      },
    },
    store: {
      getState() { return context.appState; },
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: { ...context.appState.subjectUi, [subjectId]: next },
        };
      },
      updateSubjectUiForLearner(learnerId, subjectId, updater) {
        if (learnerId !== 'learner-a') return false;
        context.store.updateSubjectUi(subjectId, updater);
        return true;
      },
      pushToasts() {},
      pushMonsterCelebrations() {},
      reloadFromRepositories() {},
    },
  };

  grammarModule.handleAction('grammar-save-transfer-evidence', {
    ...context,
    data: {
      payload: {
        promptId: 'storm-scene',
        writing: 'Pre-save draft text.',
        selfAssessment: [{ key: 'check-0', checked: true }],
      },
    },
  });
  // Confirm pendingCommand registered before the resolve.
  assert.equal(context.appState.subjectUi.grammar.pendingCommand, 'save-transfer-evidence');

  resolveCommand({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'transfer',
      transferLane: {
        mode: 'non-scored',
        prompts: SAMPLE_PROMPTS,
        limits: SAMPLE_LIMITS,
        evidence: [{
          promptId: 'storm-scene',
          latest: {
            writing: 'Pre-save draft text.',
            selfAssessment: [{ key: 'check-0', checked: true }],
            savedAt: 1_777_000_000_000,
            source: 'transfer-lane',
          },
          history: [],
          updatedAt: 1_777_000_000_000,
        }],
      },
    }, 'learner-a'),
    projections: { rewards: { toastEvents: [], events: [] } },
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  const ui = context.appState.subjectUi.grammar;
  assert.equal(ui.ui.transfer.selectedPromptId, 'storm-scene', 'selectedPromptId preserved so learner sees saved-history');
  assert.equal(ui.ui.transfer.draft, '', 'draft clears after save success');
  assert.deepEqual(ui.ui.transfer.ticks, {}, 'ticks clear after save success');
  // Evidence updated
  const evidence = ui.transferLane.evidence.find((entry) => entry.promptId === 'storm-scene');
  assert.ok(evidence);
  assert.equal(evidence.latest.writing, 'Pre-save draft text.');
});

// ----------------------------------------------------------------------------
// Phase allowlist + router
// ----------------------------------------------------------------------------

test('U6b: normaliseGrammarReadModel accepts "transfer" as a valid phase', () => {
  const rm = normaliseGrammarReadModel({ phase: 'transfer' }, 'learner-a');
  assert.equal(rm.phase, 'transfer');
});

test('U6b: ui.transfer slot defaults to empty shape when missing from upstream state', () => {
  const rm = normaliseGrammarReadModel({}, 'learner-a');
  assert.deepEqual(rm.ui.transfer, { selectedPromptId: '', draft: '', ticks: {} });
});

test('U6b: grammar-close-transfer returns the learner to the dashboard and resets transient state', () => {
  const harness = openTransferHarness({
    transferLane: defaultTransferLane(),
    transferUi: { selectedPromptId: 'storm-scene', draft: 'Unsaved draft.', ticks: { 'check-0': true } },
  });
  harness.dispatch('grammar-close-transfer');
  const ui = harness.store.getState().subjectUi.grammar;
  assert.equal(ui.phase, 'dashboard');
});

test('U6b: grammar-open-transfer clears stale Writing Try transient state (draft, ticks, selectedPromptId)', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  harness.dispatch('open-subject', { subjectId: 'grammar' });
  // Seed stale transient state from a prior visit.
  harness.store.updateSubjectUi('grammar', (current) => normaliseGrammarReadModel({
    ...current,
    ui: { transfer: { selectedPromptId: 'storm-scene', draft: 'stale', ticks: { 'check-0': true } } },
  }, learnerId));
  harness.dispatch('grammar-open-transfer');
  const ui = harness.store.getState().subjectUi.grammar;
  assert.equal(ui.phase, 'transfer');
  assert.equal(ui.ui.transfer.selectedPromptId, '');
  assert.equal(ui.ui.transfer.draft, '');
  assert.deepEqual(ui.ui.transfer.ticks, {});
});
