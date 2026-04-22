import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODEX_STAGES,
  codexEntryStateClassName,
  codexFeatureStyle,
  codexStageDotClassName,
  codexTotals,
} from '../src/surfaces/home/codex-view-model.js';

test('codex totals prefer the aggregate secure count when it is ahead', () => {
  const totals = codexTotals([
    { id: 'inklet', caught: true, mastered: 12, stage: 2 },
    { id: 'glimmerbug', caught: false, mastered: 9, stage: 3 },
    { id: 'phaeton', caught: true, mastered: 30, stage: 1 },
  ]);

  assert.deepEqual(totals, {
    caught: 2,
    secure: 30,
    highestStage: 2,
  });
});

test('codex totals fall back to direct secure counts when aggregate is behind', () => {
  const totals = codexTotals([
    { id: 'inklet', caught: true, mastered: 12, stage: 2 },
    { id: 'glimmerbug', caught: true, mastered: 9, stage: 3 },
    { id: 'phaeton', caught: false, mastered: 4, stage: 4 },
  ]);

  assert.deepEqual(totals, {
    caught: 2,
    secure: 21,
    highestStage: 3,
  });
});

test('codex feature style grows with caught stage', () => {
  assert.deepEqual(codexFeatureStyle({
    id: 'phaeton',
    branch: 'b1',
    caught: true,
    stage: 4,
    displayState: 'monster',
  }), {
    '--codex-feature-size': '700px',
    '--codex-feature-orbit-size': '399px',
    '--codex-feature-halo-y': '233px',
    '--codex-feature-halo-lift': '78px',
    '--codex-feature-shadow-width': '602px',
    '--codex-feature-shadow-y': '238px',
    '--codex-feature-rise': '155px',
    '--codex-feature-foot-shift': '9px',
  });

  const eggStyle = codexFeatureStyle({
    id: 'phaeton',
    branch: 'b1',
    caught: true,
    stage: 0,
    displayState: 'egg',
  });
  const eggSize = eggStyle['--codex-feature-size'];

  assert.equal(eggSize, '252px');
  assert.ok(parseInt(eggSize, 10) < 700);
  assert.equal(eggStyle['--codex-feature-halo-y'], '84px');
  assert.equal(eggStyle['--codex-feature-foot-shift'], '5px');

  assert.equal(codexFeatureStyle({
    id: 'glimmerbug',
    caught: false,
    stage: 4,
    displayState: 'fresh',
  })['--codex-feature-rise'], '0px');
});

test('codex class helpers preserve stage and locked state semantics', () => {
  const entry = { caught: true, displayState: 'monster', stage: 3 };
  const lockedEntry = { caught: false, displayState: 'fresh', stage: 0 };

  assert.equal(codexEntryStateClassName('codex-card', entry), 'codex-card is-monster stage-3');
  assert.equal(codexEntryStateClassName('codex-feature', lockedEntry), 'codex-feature is-fresh stage-0 locked');
  assert.equal(
    codexEntryStateClassName('codex-hero', lockedEntry, { includeLocked: false }),
    'codex-hero is-fresh stage-0',
  );
});

test('codex stage dots mark lit and current stages only after catch', () => {
  const adultStage = CODEX_STAGES.find((stage) => stage.value === 3);
  const megaStage = CODEX_STAGES.find((stage) => stage.value === 4);

  assert.equal(
    codexStageDotClassName({ caught: true, stage: 3 }, adultStage),
    'codex-stage-dot is-lit is-current',
  );
  assert.equal(
    codexStageDotClassName({ caught: true, stage: 3 }, megaStage),
    'codex-stage-dot is-mega',
  );
  assert.equal(
    codexStageDotClassName({ caught: false, stage: 3 }, adultStage),
    'codex-stage-dot',
  );
});
