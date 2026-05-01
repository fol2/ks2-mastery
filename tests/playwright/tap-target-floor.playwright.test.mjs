import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appCssPath = path.join(repoRoot, 'styles/app.css');

const criticalTargets = [
  ['GrammarSessionScene answer button', 'grammar-session-answer'],
  ['GrammarSessionScene next button', 'grammar-session-next'],
  ['PunctuationSessionScene answer button', 'punctuation-session-answer'],
  ['PunctuationSessionScene next button', 'punctuation-session-next'],
  ['GrammarSummaryScene continue button', 'grammar-summary-continue'],
  ['PunctuationSummaryScene restart button', 'punctuation-summary-restart'],
  ['MonsterCelebrationOverlay keep-going CTA', 'monster-celebration-keep-going'],
  ['HeroQuestCard quest CTA', 'hero-quest-cta'],
  ['CodexCard practice button', 'codex-card-practice'],
  ['AuthSurface sign-in button', 'auth-sign-in'],
  ['Onboarding first-tap button', 'onboarding-first-tap'],
  ['GrammarConceptBankScene status chip', 'grammar-bank-chip-status'],
  ['GrammarConceptBankScene cluster chip', 'grammar-bank-chip-cluster'],
  ['SpellingWordBankScene status chip', 'wb-chip-status'],
  ['SpellingWordBankScene Guardian chip', 'wb-chip-guardian'],
  ['Generic interactive chip', 'generic-chip'],
  ['SpellingSessionScene audio replay icon button', 'spelling-audio-replay'],
];

test('PR-A tap-target floor keeps critical interactive selectors at least 44 x 44 CSS pixels', async ({ page }) => {
  const css = await readFile(appCssPath, 'utf8');
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>${css}</style>
        <style>
          body {
            padding: 24px;
            display: grid;
            gap: 12px;
          }
        </style>
      </head>
      <body>
        <button type="button" class="btn primary" data-target="grammar-session-answer">Answer</button>
        <button type="button" class="btn primary" data-target="grammar-session-next">Next</button>
        <button type="button" class="btn primary" data-target="punctuation-session-answer">Choice</button>
        <button type="button" class="btn primary" data-target="punctuation-session-next">Next</button>
        <button type="button" class="btn primary" data-target="grammar-summary-continue">Continue</button>
        <button type="button" class="btn ghost" data-target="punctuation-summary-restart">Restart</button>
        <button type="button" class="btn primary lg" data-target="monster-celebration-keep-going">Keep going</button>
        <button type="button" class="btn primary" data-target="hero-quest-cta">Start quest</button>
        <button type="button" class="btn secondary" data-target="codex-card-practice">Practise</button>
        <button type="button" class="btn primary" data-target="auth-sign-in">Sign in</button>
        <button type="button" class="btn primary" data-target="onboarding-first-tap">Start</button>
        <button type="button" class="grammar-bank-chip grammar-bank-chip-status" data-target="grammar-bank-chip-status">Due</button>
        <button type="button" class="grammar-bank-chip grammar-bank-chip-cluster" data-target="grammar-bank-chip-cluster">Bracehart</button>
        <button type="button" class="wb-chip wb-chip-status" data-target="wb-chip-status">Trouble</button>
        <button type="button" class="wb-chip wb-chip-status wb-chip-guardian" data-target="wb-chip-guardian">Guardian due</button>
        <button type="button" class="chip" data-target="generic-chip">Filter</button>
        <div class="spelling-in-session">
          <div class="audio-row">
            <button type="button" class="btn icon" data-target="spelling-audio-replay" aria-label="Replay audio">*</button>
          </div>
        </div>
      </body>
    </html>
  `);

  for (const [label, target] of criticalTargets) {
    const box = await page.locator(`[data-target="${target}"]`).boundingBox();
    expect(box, `${label} should render`).not.toBeNull();
    expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
  }
});
