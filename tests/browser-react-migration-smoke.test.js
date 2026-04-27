import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveBrowseBinary() {
  const candidates = [
    process.env.GSTACK_BROWSE,
    path.join(rootDir, '.claude/skills/gstack/browse/dist/browse'),
    path.join(process.env.HOME || '', '.claude/skills/gstack/browse/dist/browse'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function startServerProcess() {
  const child = spawn(process.execPath, ['./tests/helpers/browser-app-server.js', '--serve-only', '--port', '0', '--with-worker-api'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out starting browser app server. ${stderr}`));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.once('data', (chunk) => {
      clearTimeout(timeout);
      resolve(chunk.toString().trim());
    });
  });
  return {
    origin,
    close() {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}

function browseChain(binary, commands, options = {}) {
  return execFileSync(binary, ['chain'], {
    cwd: rootDir,
    input: JSON.stringify(commands),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout || 60_000,
  });
}

test('browser migration smoke covers the React app root, Grammar completeness controls, and spelling interaction contract', {
  skip: process.env.KS2_BROWSER_SMOKE ? false : 'Set KS2_BROWSER_SMOKE=1 to run the gstack browser smoke.',
}, async () => {
  const binary = resolveBrowseBinary();
  assert.ok(binary, 'gstack browse binary is required for browser smoke');

  execFileSync(process.execPath, ['./scripts/build-bundles.mjs'], { cwd: rootDir, stdio: 'inherit' });
  execFileSync(process.execPath, ['./scripts/build-public.mjs'], { cwd: rootDir, stdio: 'inherit' });

  const server = await startServerProcess();
  try {
    const output = browseChain(binary, [
      ['viewport', '390x844'],
      ['goto', `${server.origin}/demo`],
      ['wait', '.subject-grid'],
      ['text'],
      ['html'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Open codex'))?.click(); 'opened codex';"],
      ['wait', '.codex-page'],
      ['js', "const brand = document.querySelector('.profile-brand-button[data-action=\"navigate-home\"]'); if (!brand) throw new Error('missing codex brand home button'); brand.click(); 'clicked codex brand';"],
      ['wait', '.subject-grid'],
      ['js', "document.querySelector('[data-action=\"open-subject\"][data-subject-id=\"punctuation\"]')?.click(); 'opened punctuation';"],
      ['wait', '[data-punctuation-start]'],
      ['text'],
      ['click', '[data-punctuation-start]'],
      ['wait', 'input[name="choiceIndex"]'],
      ['click', 'input[name="choiceIndex"]'],
      ['click', '[data-punctuation-submit]'],
      ['wait', '[data-punctuation-continue]'],
      ['click', '[data-punctuation-continue]'],
      ['wait', 'textarea[name="typed"]'],
      ['fill', 'textarea[name="typed"]', 'where is the library'],
      ['click', '[data-punctuation-submit]'],
      ['wait', '[data-punctuation-continue]'],
      ['click', '[data-punctuation-continue]'],
      ['wait', 'textarea[name="typed"]'],
      ['fill', 'textarea[name="typed"]', 'the pupils packed pencils rubbers and rulers'],
      ['click', '[data-punctuation-submit]'],
      ['wait', '[data-punctuation-continue]'],
      ['click', '[data-punctuation-continue]'],
      ['wait', 'textarea[name="typed"]'],
      ['fill', 'textarea[name="typed"]', 'After lunch, the class checked their work.'],
      ['click', '[data-punctuation-submit]'],
      ['wait', '[data-punctuation-continue]'],
      ['click', '[data-punctuation-continue]'],
      ['wait', '[data-punctuation-summary]'],
      ['text'],
      ['js', "const punctuationHome = document.querySelector('.profile-brand-button[data-action=\"navigate-home\"]'); if (!punctuationHome) throw new Error('missing punctuation brand home button'); punctuationHome.click(); 'back from punctuation';"],
      ['wait', '.subject-grid'],
      ['js', "try { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true }); } catch (_) { window.speechSynthesis = undefined; window.SpeechSynthesisUtterance = undefined; } 'speech synthesis disabled';"],
      ['js', "document.querySelector('[data-action=\"open-subject\"][data-subject-id=\"grammar\"]')?.click(); 'opened grammar';"],
      ['wait', '.grammar-dashboard'],
      ['text'],
      ['js', "Array.from(document.querySelectorAll('.grammar-primary-mode')).find((button) => button.textContent?.includes('Mini Test'))?.click(); 'selected mini-test';"],
      ['js', "Array.from(document.querySelectorAll('.grammar-dashboard .btn.primary')).find((button) => button.textContent?.includes('Begin round'))?.click(); 'started grammar mini-test';"],
      ['wait', '.grammar-mini-test-panel'],
      ['text'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Finish mini-set'))?.click(); 'finished grammar mini-test';"],
      ['wait', '.grammar-summary-shell'],
      ['text'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Back to Grammar setup'))?.click(); 'back to grammar setup';"],
      ['wait', '.grammar-dashboard'],
      ['js', "Array.from(document.querySelectorAll('.grammar-primary-mode')).find((button) => button.textContent?.includes('Smart Practice'))?.click(); 'selected smart grammar';"],
      ['js', "Array.from(document.querySelectorAll('.grammar-dashboard .btn.primary')).find((button) => button.textContent?.includes('Begin round'))?.click(); 'started grammar smart';"],
      ['wait', '.grammar-session'],
      ['text'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Faded support'))?.click(); 'requested faded support';"],
      ['wait', '.grammar-guidance.faded'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Explain this'))?.click(); 'requested grammar ai';"],
      ['wait', '.grammar-ai-enrichment'],
      ['text'],
      ['js', "const grammarHome = document.querySelector('.profile-brand-button[data-action=\"navigate-home\"]'); if (!grammarHome) throw new Error('missing grammar brand home button'); grammarHome.click(); 'back from grammar';"],
      ['wait', '.subject-grid'],
      ['js', "Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Parent hub'))?.click(); 'opened parent hub';"],
      ['wait', '.parent-hub-hero'],
      ['text'],
      ['js', "const parentHome = document.querySelector('.profile-brand-button[data-action=\"navigate-home\"]'); if (!parentHome) throw new Error('missing parent hub brand home button'); parentHome.click(); 'back from parent hub';"],
      ['wait', '.subject-grid'],
      ['js', "document.querySelector('[data-action=\"open-subject\"][data-subject-id=\"spelling\"]')?.click(); 'opened spelling';"],
      ['text'],
      ['click', '[data-action="spelling-open-word-bank"]'],
      ['wait', '.word-bank-topbar'],
      ['js', '`wordBankScrollY:${Math.round(window.scrollY)}`'],
      ['text'],
      ['click', '[data-action="spelling-close-word-bank"]'],
      ['wait', '[data-action="spelling-start"]'],
      ['js', "document.querySelector('[data-action=\"spelling-toggle-pref\"][data-pref=\"autoSpeak\"][aria-pressed=\"true\"]')?.click(); 'disabled auto audio';"],
      ['js', "document.querySelector('[data-action=\"spelling-start\"]')?.click(); 'started spelling';"],
      ['wait', '.spelling-in-session.is-question-revealed input[name="typed"]'],
      ['text'],
      ['is', 'focused', 'input[name="typed"]'],
      ['fill', 'input[name="typed"]', 'zzzz'],
      ['press', 'Enter'],
      ['wait', '.feedback-slot:not(.is-placeholder)'],
      ['text'],
      ['viewport', '768x1024'],
      ['text'],
      ['console', '--errors'],
    ]);

    assert.match(output, /Your subjects/);
    assert.doesNotMatch(output, /data-home-mount/);
    assert.match(output, /punctuation mission/);
    // U4 follower: summary headline is now the accuracy-bucketed celebration
    // copy from `punctuationSummaryHeadline`, replacing the adult
    // "Punctuation session summary" default. Match any of the 3 buckets so
    // the smoke stays stable across the different accuracy paths.
    assert.match(output, /Great round!|Good try!|Keep going/);
    assert.match(output, /Grammar Garden/);
    assert.match(output, /Mini Test/);
    assert.match(output, /Smart Practice/);
    assert.match(output, /Timed test/);
    assert.match(output, /Mini Test results/i);
    assert.match(output, /Faded guidance/);
    assert.match(output, /Non-scored/);
    assert.match(output, /Read aloud/);
    assert.match(output, /Speech synthesis unavailable/);
    assert.match(output, /Grammar evidence/);
    assert.match(output, /Round setup/);
    assert.match(output, /wordBankScrollY:0/);
    assert.match(output, /Word bank progress/);
    assert.match(output, /Spell the word you hear|Spell the dictated word/);
    assert.match(output, /true|focused/i);
    assert.match(output, /Try once more|Not quite|Saved/);
    assert.doesNotMatch(output, /\[console --errors\][\s\S]*(error|warning)/i);
  } finally {
    server.close();
  }
});
