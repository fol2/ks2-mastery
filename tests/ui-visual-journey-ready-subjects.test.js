import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function count(sourceText, pattern) {
  return (sourceText.match(pattern) || []).length;
}

function stripLineComments(sourceText) {
  return sourceText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

test('Home to recommended subject route has one primary CTA and no duplicate setup route', () => {
  const home = source('src/surfaces/home/HomeSurface.jsx');
  assert.match(home, /selectTodaysBestRound/);
  assert.equal(count(home, /dataAction="open-subject"/g), 1);
  assert.match(home, /data-subject-id=\{ctaSubjectId\}/);
  assert.match(home, /actions\.openSubject\(ctaSubjectId\)/);
});

test('ready subject journeys expose setup, session HUD, summary, and home return actions', () => {
  const subjects = [
    {
      id: 'spelling',
      setup: 'src/subjects/spelling/components/SpellingSetupScene.jsx',
      session: 'src/subjects/spelling/components/SpellingSessionScene.jsx',
      summary: 'src/subjects/spelling/components/SpellingSummaryScene.jsx',
      startAction: 'spelling-start',
      backAction: 'spelling-back',
    },
    {
      id: 'grammar',
      setup: 'src/subjects/grammar/components/GrammarSetupScene.jsx',
      session: 'src/subjects/grammar/components/GrammarSessionScene.jsx',
      summary: 'src/subjects/grammar/components/GrammarSummaryScene.jsx',
      startAction: 'grammar-start',
      backAction: 'grammar-back',
    },
    {
      id: 'punctuation',
      setup: 'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
      session: 'src/subjects/punctuation/components/PunctuationSessionScene.jsx',
      summary: 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
      startAction: 'punctuation-start',
      backAction: 'punctuation-back',
    },
  ];

  for (const subject of subjects) {
    const setup = source(subject.setup);
    const session = stripLineComments(source(subject.session));
    const summary = source(subject.summary);

    assert.match(setup, /<SubjectCompanionPanel[\s\S]*\svisible/);
    assert.ok(setup.includes(subject.startAction), `${subject.id} setup must expose start action`);
    assert.match(session, /<SessionHUD[\s\S]*subjectId=/);
    assert.doesNotMatch(session, /Question\s+\{[^}]*\}\s+of\s+\{[^}]*\}/);
    assert.match(summary, /<SessionSummaryFrame[\s\S]*nextPrimaryAction=\{nextPrimaryAction\}/);
    assert.ok(summary.includes(subject.backAction), `${subject.id} summary must expose a return or next route`);
  }
});

test('ready subject journey contract is backed by Worker summary read-model preservation tests', () => {
  const spellingRemote = source('tests/spelling-remote-actions.test.js');
  const spellingHydration = source('tests/spelling-remote-sync-hydration.test.js');

  assert.match(
    spellingRemote,
    /remote spelling command response applies the live summary read model after repository reload/,
  );
  assert.match(spellingRemote, /subjectReadModel:\s*\{\s*phase:\s*'summary'/);
  assert.match(
    spellingHydration,
    /applyCommandResponse preserves postMastery cache when follow-up response lacks postMastery/,
  );
});
