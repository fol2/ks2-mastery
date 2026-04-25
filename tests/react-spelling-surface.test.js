import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderSpellingClozeFixture,
  renderSpellingSurfaceFixture,
} from './helpers/react-render.js';
import { createSpellingReadModelService } from '../src/subjects/spelling/client-read-models.js';

test('React spelling setup scene renders primary practice controls', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Round setup/);
  assert.match(html, /Begin 20 words/);
  assert.match(html, /data-action="spelling-start"/);
});

test('React spelling setup scene disables start while a remote start is pending', async () => {
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    pendingCommand: 'start-session',
  });

  assert.match(html, /Starting\.\.\./);
  assert.match(html, /<button[^>]*data-action="spelling-start"[^>]*disabled=""/);
});

test('React spelling setup scene disables start while options are saving', async () => {
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    pendingCommand: 'save-prefs',
  });

  assert.match(html, /Saving\.\.\./);
  assert.match(html, /<button[^>]*data-action="spelling-start"[^>]*disabled=""/);
});

test('client spelling read model preserves word-family variant preference', () => {
  const service = createSpellingReadModelService({
    getState: () => ({
      learners: { selectedId: 'learner-a' },
      subjectUi: {
        spelling: {
          subjectId: 'spelling',
          learnerId: 'learner-a',
          version: 2,
          phase: 'dashboard',
          prefs: {
            mode: 'smart',
            yearFilter: 'extra',
            roundLength: '20',
            showCloze: true,
            autoSpeak: true,
            extraWordFamilies: true,
          },
        },
      },
    }),
  });

  assert.equal(service.getPrefs('learner-a').extraWordFamilies, true);
});

test('React spelling session scene preserves input, replay, and submit affordances', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'session' });

  assert.match(html, /Spell the word you hear|Spell the dictated word/);
  assert.match(html, /name="typed"/);
  assert.match(html, /data-action="spelling-replay"/);
  assert.match(html, /data-action="spelling-submit-form"/);
});

test('React cloze renders one blank for variable-length underscore placeholders', async () => {
  const html = await renderSpellingClozeFixture({
    sentence: 'Each group wrote a prediction for the __________.',
    answer: 'experiment',
  });

  assert.match(html, /<span class="blank">/);
  assert.doesNotMatch(html, /__\./);
});

test('React spelling summary and word bank scenes render migration-critical states', async () => {
  const summaryHtml = await renderSpellingSurfaceFixture({ phase: 'summary' });
  const wordBankHtml = await renderSpellingSurfaceFixture({ phase: 'word-bank' });
  const modalHtml = await renderSpellingSurfaceFixture({ phase: 'modal' });

  assert.match(summaryHtml, /summary-card/);
  assert.match(summaryHtml, /Session summary/);
  assert.match(wordBankHtml, /Word bank progress/);
  assert.match(wordBankHtml, /data-action="spelling-analytics-status-filter"/);
  assert.match(modalHtml, /aria-labelledby="wb-modal-word"/);
  assert.match(modalHtml, /data-action="spelling-word-bank-drill-submit"/);
});

// ----- U5: post-Mega dashboard + Alt+4 shortcut --------------------------------

test('React spelling setup scene renders the legacy 3-mode row when allWordsMega is false', async () => {
  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Smart Review/);
  assert.match(html, /Trouble Drill/);
  assert.match(html, /SATs Test/);
  assert.doesNotMatch(html, /Guardian Mission/);
  assert.doesNotMatch(html, /The Word Vault is yours/);
  assert.doesNotMatch(html, /Graduated · Spelling Guardian/);
});

test('React spelling setup scene renders the post-Mega dashboard with Guardian Mission + 3 placeholders when allWordsMega is true and words are due', async () => {
  // Seed a guardian record that is due today so the Guardian card renders
  // with the "active duty" treatment, not the "all rested" fallback.
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today - 7,
          nextDueDay: today,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: false,
        },
      },
    },
  });

  assert.match(html, /Graduated · Spelling Guardian/);
  assert.match(html, /The Word Vault is yours/);
  assert.match(html, /Guardian Mission/);
  assert.match(html, /Boss Dictation/);
  assert.match(html, /Word Detective/);
  assert.match(html, /Story Challenge/);
  // Placeholder roadmap labels should show "Next 02/03/04" rather than a
  // single generic "Coming soon" shield, so the codex reads as planned steps.
  assert.match(html, /mc-badge-roadmap/);
  // The begin button explicitly routes through spelling-shortcut-start with
  // mode=guardian so the module-level gate is the one source of truth.
  assert.match(html, /data-action="spelling-shortcut-start"[^>]*data-mode="guardian"/);
  assert.match(html, /ACTIVE DUTY/);
  assert.doesNotMatch(html, /Choose today/);
});

test('React spelling setup scene shows "All guardians rested" copy when allWordsMega && guardianDueCount === 0', async () => {
  // Seed guardians but schedule them all for the future so nothing is due
  // today. The Begin button should be inert and the card should read as a
  // quiet signal rather than a greyed-out state.
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const html = await renderSpellingSurfaceFixture({
    phase: 'setup',
    postMega: {
      guardian: {
        possess: {
          reviewLevel: 2,
          lastReviewedDay: today,
          nextDueDay: today + 5,
          correctStreak: 2,
          lapses: 0,
          renewals: 0,
          wobbling: false,
        },
      },
    },
  });

  assert.match(html, /Graduated · Spelling Guardian/);
  assert.match(html, /Guardian Mission/);
  assert.match(html, /All guardians rested/);
  assert.match(html, /ALL RESTED/);
  // The primary begin CTA must be disabled so clicking it does nothing.
  assert.match(html, /<button[^>]*data-action="spelling-shortcut-start"[^>]*data-mode="guardian"[^>]*disabled=""/);
  // The rested-state "Rested" chip appears on the Guardian card frame itself.
  assert.match(html, /mode-card-post-status/);
  assert.match(html, /Rested/);
});
